import { getProgram, listPrograms } from "../core/program-registry.js";
import { loadProgramData } from "../core/program-loader.js";
import { haversineMiles } from "../core/geo.js";
import {
  buildCoverageModel,
  buildTerritoryHealth,
  buildGapPlacementPlan
} from "../core/coverage-engine.js";
import { initializeProgramSwitcher } from "../modules/program-switcher.js";

const requestedProgramId =
  new URLSearchParams(window.location.search).get("program") ||
  localStorage.getItem("psp_active_program") ||
  "premium-merchandising";
const ACTIVE_PROGRAM_ID = requestedProgramId;
const ACTIVE_PROGRAM = getProgram(ACTIVE_PROGRAM_ID);
const {
  stores: RAW_STORES,
  rts: RTS,
  metadata: DATA_METADATA
} = await loadProgramData(ACTIVE_PROGRAM);
const PROGRAM_ELIGIBILITY =
  ACTIVE_PROGRAM.adapter?.isRtsEligibleForStore || (() => true);
const DATA_WARNINGS = [];
let ORG_HIERARCHY={regionalManagers:[],rdmToRegionalManager:{}};
try{
 const orgPath=ACTIVE_PROGRAM_ID==='one-walmart'
   ? './data/one-walmart/organization.json'
   : './data/premium-merchandising/organization.json';
 const response=await fetch(orgPath,{cache:'no-store'});
 if(response.ok)ORG_HIERARCHY=await response.json();
}catch(error){console.warn('Organization hierarchy could not be loaded',error)}

function normalizeProgramRetailer(store){
 if(ACTIVE_PROGRAM_ID!=='one-walmart')return store;
 const raw=`${store.storeName||''} ${store.retailer||''}`.toLowerCase();
 if(raw.includes('neighborhood'))store.retailer='Walmart Neighborhood Market';
 else if(raw.includes('supercenter'))store.retailer='Walmart Supercenter';
 else if(raw.includes("sam's")||raw.includes('sams club')||raw.includes('sam’s'))store.retailer="Sam's Club";
 else store.retailer='Walmart';
 return store;
}
RAW_STORES.forEach(normalizeProgramRetailer);

const HOME = ACTIVE_PROGRAM.home;
const $=x=>document.getElementById(x), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map=L.map('map',{zoomControl:true,inertia:true}).setView(HOME.center,HOME.zoom);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
const clusterLayer=L.markerClusterGroup({disableClusteringAtZoom:12,chunkedLoading:true,showCoverageOnHover:false}),plainLayer=L.layerGroup(),rtsLayer=L.layerGroup().addTo(map),ringLayer=L.layerGroup().addTo(map),highlightLayer=L.layerGroup().addTo(map),simLayer=L.layerGroup().addTo(map),territoryLayer=L.layerGroup().addTo(map),territoryLabelLayer=L.layerGroup().addTo(map);
map.addLayer(clusterLayer);let heatLayer=null,stores=[],filtered=[],markerById=new Map(),simMarker=null,simMode=false,selectedSearch=-1;
function hav(a,b,c,d){return haversineMiles(a,b,c,d)}
function activeRTS(){return RTS}
function calculate(s){
 const eligible=activeRTS().filter(r=>PROGRAM_ELIGIBILITY(s,r));
 const distances=eligible
   .map(r=>({id:r.id,name:r.name,email:r.email,lat:r.lat,lng:r.lng,distance:hav(s.lat,s.lng,r.lat,r.lng)}))
   .sort((a,b)=>a.distance-b.distance);
 s._eligibleDistances=distances;
 s.nearest=distances.slice(0,3);
 updateStoreCoverageForRadius(s,Number($('radius')?.value||75));
 s.eligibleRtsCount=eligible.length;
 return s
}
function updateStoreCoverageForRadius(s,radius){
 const distances=s._eligibleDistances||[];
 let count=0;
 for(const r of distances){
   if(r.distance<=radius)count++;
   else break;
 }
 s.coverCount=count;
 s.covered=count>0;
 s.coverageType=count===0?'Gap':count===1?'Unique':'Shared';
 s.nearest=distances.slice(0,3);
 return s
}
function recompute(){
 const radius=Number($('radius')?.value||75);
 stores.forEach(s=>updateStoreCoverageForRadius(s,radius));
 refreshCascadingFilters({preserve:true});
 applyFilters();
 drawRts();
 drawTerritories();
}
function uniq(a){return [...new Set(a.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function options(id,vals){
 const e=$(id);if(!e)return;
 const first=e.options[0];
 const placeholder=first?first.textContent:'All';
 e.innerHTML='';
 const base=document.createElement('option');
 base.value='';base.textContent=placeholder;
 e.appendChild(base);
 vals.forEach(v=>{
   const o=document.createElement('option');
   o.value=v;o.textContent=v;e.appendChild(o)
 });
}
function storeMarker(s){const color=s.covered?'#16a34a':'#dc2626',icon=L.divIcon({className:'',html:`<div class="store-dot" style="background:${color}"></div>`,iconSize:[11,11],iconAnchor:[5,5]});const m=L.marker([s.lat,s.lng],{icon}).bindPopup(()=>storePopup(s),{maxWidth:440,autoPanPadding:[80,80]});m.on('click',()=>{map.flyTo([s.lat,s.lng],Math.max(11,map.getZoom()),{duration:.55})});return m}
function storePopup(s){
 const addr=s.address?esc(s.address):'<span style="color:#94a3b8">Street address unavailable</span>';
 const nearest=s.nearest.map((r,i)=>`<div class="s2-near-row ${i===0?'primary':''}">
   <span class="s2-rank">${i+1}</span>
   <span><span class="s2-near-name">${esc(r.name)}</span><span class="s2-near-email">${esc(r.email)}</span></span>
   <span class="s2-near-dist">${r.distance.toFixed(1)} mi</span>
 </div>`).join('');
 const teamText=(s.dedicatedTeams||[]).length?(s.dedicatedTeams||[]).join(', '):'Core program';
 const nearestDistance=s.nearest[0]?.distance;
 const backup=s.nearest.find((r,i)=>i>0&&r.distance<=Number($('radius').value));
 return `<div class="popup sprint2-popup v6-store-popup">
   <div class="s2-popup-head">
     <div class="s2-popup-headline">
       <div class="s2-popup-title">${esc(s.retailer||s.storeName||'Store')} #${esc(s.storeNumber||'—')}</div>
       <span class="badge ${s.covered?'covered':'gap'}">${esc(s.coverageType||'Gap')}</span>
     </div>
     <div class="s2-popup-address">📍 ${addr}<br>${esc(s.city)}, ${esc(s.state)} ${esc(s.zip)}</div>
     <div class="s2-popup-meta">SiteID ${esc(s.siteId)}${s.mdmStoreId?` · MDM ${esc(s.mdmStoreId)}`:''}</div>
   </div>
   <div class="s2-popup-scroll">
     <div class="s2-grid">
       <div class="s2-card"><span class="s2-label">Program</span><div class="s2-value">${esc(v4ProgramLabel())}</div></div>
       <div class="s2-card"><span class="s2-label">Team exposure</span><div class="s2-value">${esc(teamText)}</div></div>
       <div class="s2-card"><span class="s2-label">Manager</span><div class="s2-value">${esc(s.manager||'Not listed')}</div></div>
       <div class="s2-card"><span class="s2-label">Market</span><div class="s2-value">${esc(s.market||'Not listed')}</div></div>
       <div class="s2-card"><span class="s2-label">Coverage</span><div class="s2-value">${esc(s.coverageType||'Gap')}${Number.isFinite(nearestDistance)?`<br>${nearestDistance.toFixed(1)} mi to nearest eligible RTS`:''}</div></div>
       <div class="s2-card"><span class="s2-label">Backup RTS</span><div class="s2-value">${backup?`${esc(backup.name)}<br>${backup.distance.toFixed(1)} mi`:'None inside radius'}</div></div>
       <div class="s2-card full"><span class="s2-label">Nearest eligible RTS</span><div class="s2-nearest">${nearest||'<div class="callout">No eligible RTS found.</div>'}</div></div>
     </div>
   </div>
   <div class="s2-popup-actions">
     ${s.nearest[0]?`<button class="btn primary" onclick="window.openTerritory('${esc(s.nearest[0].id)}')">Open RTS Profile</button>`:''}
     <button class="btn" onclick="window.v6OpenStoreIntelligence('${esc(s.siteId)}')">Store Intelligence</button>
     <button class="btn" onclick="window.simulateAt(${s.lat},${s.lng})">Simulate RTS Here</button>
     <button class="btn" onclick="window.showNearbyStores('${esc(s.siteId)}')">Nearby Stores</button>
   </div>
 </div>`;
}
function drawRts(){
 rtsLayer.clearLayers();
 ringLayer.clearLayers();
 if($('showRts').checked)activeRTS().forEach(r=>{
   const radius=Number($('radius').value);
   const inside=stores.filter(s=>(s._eligibleDistances||[]).some(x=>String(x.id)===String(r.id)&&x.distance<=radius));
   const unique=inside.filter(s=>s.coverCount===1);
   const shared=inside.filter(s=>s.coverCount>=2);
   const coveragePct=inside.length?100:0;
   const icon=L.divIcon({className:'',html:'<div class="rts-icon"></div>',iconSize:[22,22],iconAnchor:[11,11]});
   const hover=`<div class="s2-hover">
     <b>${esc(r.name)}</b>
     <span>${esc(v4ProgramLabel())} RTS</span>
     <div class="s2-hover-grid">
       <div><small>Stores in radius</small><strong>${inside.length}</strong></div>
       <div><small>Unique</small><strong>${unique.length}</strong></div>
       <div><small>Shared</small><strong>${shared.length}</strong></div>
       <div><small>Radius</small><strong>${$('radius').value} mi</strong></div>
     </div>
     <span style="margin-top:5px">Click to open territory review</span>
   </div>`;
   L.marker([r.lat,r.lng],{icon})
     .on('click',()=>openTerritory(r.id))
     .bindTooltip(hover,{direction:'top',offset:[0,-10],opacity:1,className:''})
     .addTo(rtsLayer);
 });
 if($('showRings').checked)activeRTS().forEach(r=>L.circle([r.lat,r.lng],{
   radius:Number($('radius').value)*1609.344,color:'#7c3aed',weight:1,fillOpacity:.025,interactive:false
 }).addTo(ringLayer));
}

function territoryColor(r){
 const owned=stores.filter(s=>s.nearest[0]?.id===r.id);
 const avgTerritory=stores.length/Math.max(1,activeRTS().length);
 const ratio=owned.length/Math.max(1,avgTerritory);
 if(ratio>=1.45)return '#dc2626';
 if(ratio>=1.15)return '#f59e0b';
 if(ratio<=0.55)return '#0ea5e9';
 return '#16a34a';
}
function drawTerritories(){
 territoryLayer.clearLayers();
 territoryLabelLayer.clearLayers();
 if(!$('territories').checked || typeof d3==='undefined' || !activeRTS().length)return;

 const hubs=activeRTS();
 // Generate a geographic Voronoi in longitude/latitude space, clipped to the continental map extent.
 const points=hubs.map(r=>[r.lng,r.lat]);
 const delaunay=d3.Delaunay.from(points);
 const vor=delaunay.voronoi([-179,15,-55,72]);

 hubs.forEach((r,i)=>{
   const poly=vor.cellPolygon(i);
   if(!poly || poly.length<3)return;
   const latlngs=poly.map(p=>[p[1],p[0]]);
   const owned=stores.filter(s=>s.nearest[0]?.id===r.id);
   const color=territoryColor(r);
   const polygon=L.polygon(latlngs,{
     color,weight:1.4,fillColor:color,fillOpacity:.07,interactive:true
   }).bindTooltip(`<div class="boundary-tooltip"><b>${esc(r.name)}</b><br>${owned.length} stores within radius<br>Click to review territory</div>`,{sticky:true,className:''})
     .on('click',()=>openTerritory(r.id))
     .addTo(territoryLayer);
   if($('territoryLabels').checked){
     L.tooltip({permanent:true,direction:'center',className:'boundary-tooltip',opacity:.9})
       .setLatLng([r.lat,r.lng])
       .setContent(`<b>${esc(r.name)}</b><br>${owned.length} stores`)
       .addTo(territoryLabelLayer);
   }
 });
}



function v7141RuntimeSmokeCheck(){
 const issues=[];
 try{
   if(typeof v710SequentialPlan!=='function')issues.push('v710SequentialPlan missing');
   if(typeof v714CachedSequentialPlan!=='function')issues.push('v714CachedSequentialPlan missing');
   if(typeof window.v793OpenManagerProfileToken!=='function')issues.push('manager drill handler missing');
   if(typeof window.v793OpenRegionalProfileToken!=='function')issues.push('regional drill handler missing');
 }catch(e){issues.push(e.message)}
 return issues;
}
window.v7141RuntimeSmokeCheck=v7141RuntimeSmokeCheck;

function v714Debounce(fn,wait=120){
 let t=null;
 return function(...args){
   clearTimeout(t);
   t=setTimeout(()=>fn.apply(this,args),wait);
 };
}

function applyFilters(){
 const c=$('fCoverage').value,ret=$('fRetailer').value,st=$('fState').value,
 regional=$('fRegional')?.value||'',mgr=$('fManager').value,rr=$('fRts').value,
 rad=Number($('radius').value);
 filtered=stores.filter(s=>
   (!c||(c==='covered'?s.covered:!s.covered))&&
   (!ret||s.retailer===ret)&&
   (!st||s.state===st)&&
   (!regional||v7OrgForStore(s).regionalManager===regional)&&
   (!mgr||v7OrgForStore(s).areaManager===mgr)&&
   (!rr||(s._eligibleDistances||[]).some(r=>r.name===rr&&r.distance<=rad))&&
   (!$('within').checked||(s._eligibleDistances||[]).some(r=>r.distance<=rad))
 );
 updateMetrics();
 scheduleMapRender();
}
let v76MapRenderFrame=0;
function scheduleMapRender(){
 if(v76MapRenderFrame)cancelAnimationFrame(v76MapRenderFrame);
 v76MapRenderFrame=requestAnimationFrame(()=>{
  v76MapRenderFrame=0;
  renderStores();
  if($('territories')?.checked)drawTerritories();
 });
}
function renderStores(){clusterLayer.clearLayers();plainLayer.clearLayers();const ms=filtered.map(s=>markerById.get(s.siteId));if($('cluster').checked){clusterLayer.addLayers(ms);if(!map.hasLayer(clusterLayer))map.addLayer(clusterLayer);if(map.hasLayer(plainLayer))map.removeLayer(plainLayer)}else{ms.forEach(m=>plainLayer.addLayer(m));if(!map.hasLayer(plainLayer))map.addLayer(plainLayer);if(map.hasLayer(clusterLayer))map.removeLayer(clusterLayer)}drawHeat();drawOverlap()}
function updateMetrics(){
 const scope=filtered;
 let covered=0,totalNearestDistance=0;
 const territoryCountsByRts=new Map();
 const servingIds=new Set();
 const radius=Number($('radius')?.value||75);

 for(const s of scope){
   if(s.covered)covered++;
   if(Number.isFinite(s.nearest?.[0]?.distance))totalNearestDistance+=s.nearest[0].distance;
   const nearestInRadius=(s._eligibleDistances||[]).find(r=>r.distance<=radius);
   if(nearestInRadius){
     const id=String(nearestInRadius.id);
     servingIds.add(id);
     territoryCountsByRts.set(id,(territoryCountsByRts.get(id)||0)+1);
   }
 }
 const gaps=scope.length-covered;
 const pct=scope.length?covered/scope.length*100:0;
 const avg=scope.length?totalNearestDistance/scope.length:0;
 const territoryCounts=[...territoryCountsByRts.values()].sort((a,b)=>a-b);
 const avgTerr=territoryCounts.length?territoryCounts.reduce((a,b)=>a+b,0)/territoryCounts.length:0;
 const medianTerr=territoryCounts.length?(territoryCounts.length%2?territoryCounts[(territoryCounts.length-1)/2]:(territoryCounts[territoryCounts.length/2-1]+territoryCounts[territoryCounts.length/2])/2):0;

 $('kStores').textContent=scope.length.toLocaleString();
 $('kRts').textContent=servingIds.size.toLocaleString();
 $('kCovered').textContent=covered.toLocaleString();
 $('kGaps').textContent=gaps.toLocaleString();
 $('kPct').textContent=pct.toFixed(1)+'%';
 $('kAvg').textContent=avg.toFixed(1)+' mi';
 $('kAvgTerritory').textContent=Math.round(avgTerr).toLocaleString();
 $('kLargestTerritory').textContent=(territoryCounts.at(-1)||0).toLocaleString();
 $('kSmallestTerritory').textContent=(territoryCounts[0]||0).toLocaleString();
 $('kMedianTerritory').textContent=Math.round(medianTerr).toLocaleString();
 $('hVisible').textContent=scope.length.toLocaleString();
 $('hPct').textContent=pct.toFixed(1)+'%';
 $('hGaps').textContent=gaps.toLocaleString();
}
function drawHeat(){if(heatLayer){map.removeLayer(heatLayer);heatLayer=null}if($('heat').checked){heatLayer=L.heatLayer(filtered.map(s=>[s.lat,s.lng,s.covered?.45:1]),{radius:20,blur:16,maxZoom:10}).addTo(map)}}
function drawOverlap(){highlightLayer.clearLayers();if(!$('overlap').checked)return;filtered.filter(s=>s.coverCount>=2).forEach(s=>L.circleMarker([s.lat,s.lng],{radius:7,color:'#111',weight:2,fillOpacity:0,interactive:false}).addTo(highlightLayer))}
function fit(){if(!filtered.length)return;map.fitBounds(filtered.map(s=>[s.lat,s.lng]),{padding:[25,25],maxZoom:11})}
function csv(rows,name){if(!rows.length)return;const keys=Object.keys(rows[0]),q=v=>`"${String(v??'').replace(/"/g,'""')}"`,blob=new Blob([[keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function storeRows(rows){return rows.map(s=>({SiteID:s.siteId,Retailer:s.retailer,StoreNumber:s.storeNumber,Address:s.address||'',City:s.city,State:s.state,ZIP:s.zip,Manager:s.manager,ManagerEmail:s.managerEmail,Coverage:s.covered?'Covered':'Gap',NearestRTS:s.nearest[0]?.name||'',DistanceMiles:s.nearest[0]?.distance?.toFixed(1)||''}))}
function showDrawer(title,html){$('drawerTitle').textContent=title;$('drawerContent').innerHTML=html;$('drawer').classList.add('show')}
function territoryQuality(owned,inside,avg,farthest,overlapCount){
 const coverage=owned.length?owned.filter(s=>s.covered).length/owned.length*100:0;
 let score=100;
 if(avg>45)score-=25;else if(avg>32)score-=14;else if(avg>22)score-=6;
 if(farthest>90)score-=20;else if(farthest>75)score-=10;
 if(coverage<70)score-=25;else if(coverage<85)score-=12;
 if(owned.length>330)score-=12;else if(owned.length<90)score-=8;
 if(overlapCount>inside.length*.5)score-=8;
 if(score>=82)return {label:'Excellent',cls:'excellent'};
 if(score>=68)return {label:'Good',cls:'good'};
 if(score>=52)return {label:'Fair',cls:'fair'};
 return {label:'Weak',cls:'weak'};
}
function openTerritory(id){
 const r=activeRTS().find(x=>String(x.id)===String(id));if(!r)return;
 const rad=Number($('radius').value),active=activeRTS(),scope=filtered.length?filtered:stores;
 const distFor=s=>(s._eligibleDistances||[]).find(x=>String(x.id)===String(r.id))?.distance ?? Infinity;
 const inside=scope.filter(s=>distFor(s)<=rad);
 const unique=inside.filter(s=>s.coverCount===1);
 const shared=inside.filter(s=>s.coverCount>=2);
 const distances=inside.map(distFor);
 const avg=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;
 const farthest=distances.length?Math.max(...distances):0;
 const farthestObj=inside.length?[...inside].sort((a,b)=>distFor(b)-distFor(a))[0]:null;
 const teamCounts=coverageModel(scope).byRts.map(x=>x.count);
 const teamAvg=teamCounts.length?teamCounts.reduce((a,b)=>a+b,0)/teamCounts.length:0;
 const delta=teamAvg?((inside.length-teamAvg)/teamAvg*100):0;
 const retailers=Object.entries(inside.reduce((o,s)=>(o[s.retailer]=(o[s.retailer]||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const managers=Object.entries(inside.reduce((o,s)=>{const k=v7OrgForStore(s).areaManager||'Not listed';o[k]=(o[k]||0)+1;return o},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const maxRetail=Math.max(1,...retailers.map(x=>x[1])),maxMgr=Math.max(1,...managers.map(x=>x[1]));
 let score=100;
 if(avg>48)score-=22;else if(avg>38)score-=12;else if(avg>28)score-=6;
 if(inside.length>teamAvg*1.6)score-=18;else if(inside.length>teamAvg*1.3)score-=10;
 if(inside.length<teamAvg*.45)score-=6;
 if(unique.length>inside.length*.75&&unique.length>80)score-=12;
 score=Math.max(0,Math.min(100,score));
 let q={label:'Excellent',cls:'excellent'};
 if(score<50)q={label:'Needs Attention',cls:'weak'};else if(score<68)q={label:'Fair',cls:'fair'};else if(score<84)q={label:'Good',cls:'good'};
 document.body.classList.add('territory-focus');highlightLayer.clearLayers();
 inside.forEach(s=>{const u=unique.some(x=>x.siteId===s.siteId);L.circleMarker([s.lat,s.lng],{radius:u?6:4,color:u?'#2563eb':'#16a34a',weight:u?2.5:1.5,fillOpacity:u?.82:.52,className:'territory-focus-marker'}).addTo(highlightLayer)});
 map.flyTo([r.lat,r.lng],7,{duration:.6});
 showDrawer(`RTS Territory — ${r.name}`,`
 <div class="s2-drawer-hero"><div class="s2-drawer-title">${esc(r.name)}</div><div class="s2-drawer-sub">${esc(r.email)}${r.rtm?`<br>RTM: ${esc(r.rtm)}`:''}</div><span class="s2-score ${q.cls}">Territory health: ${q.label}</span></div>
 <div class="help-term"><b>How to read these territory metrics</b><details><summary>Stores within radius, unique coverage, and shared coverage</summary><div style="margin-top:5px"><b>Stores within radius</b> are all mapped stores inside the selected mileage radius of this RTS. <b>Unique coverage</b> means only this RTS is within range. <b>Shared coverage</b> means two or more active RTS are within range. Stores outside every RTS radius are network gaps and should be addressed through additional RTS placement—not counted against the nearest existing RTS.</div></details></div>
 <div class="s2-kpi-grid">
 <div class="s2-kpi"><small>Stores within ${rad} miles</small><b>${inside.length}</b><span>${delta>=0?'▲':'▼'} ${Math.abs(delta).toFixed(1)}% vs team average</span></div>
 <div class="s2-kpi"><small>Unique coverage</small><b>${unique.length}</b><span>Only this RTS is in range</span></div>
 <div class="s2-kpi"><small>Shared coverage</small><b>${shared.length}</b><span>Two or more RTS are in range</span></div>
 <div class="s2-kpi"><small>Average drive</small><b>${avg.toFixed(1)} mi</b><span>Average to stores in radius</span></div>
 <div class="s2-kpi"><small>Farthest in-radius store</small><b>${farthest.toFixed(1)} mi</b><span>${farthestObj?`${esc(farthestObj.city)}, ${esc(farthestObj.state)}`:'—'}</span></div>
 <div class="s2-kpi"><small>Unique share</small><b>${inside.length?(unique.length/inside.length*100).toFixed(1):'0.0'}%</b><span>Stores uniquely dependent on this RTS</span></div>
 </div>
 <div class="s2-list-card"><h4>Retailer mix</h4>${retailers.map(x=>`<div class="s2-bar-row"><span class="s2-bar-label">${esc(x[0])}</span><span class="s2-bar"><span style="width:${x[1]/maxRetail*100}%"></span></span><b>${x[1]}</b></div>`).join('')}</div>
 <div class="s2-list-card"><h4>Manager mix</h4>${managers.map(x=>`<div class="s2-bar-row"><span class="s2-bar-label">${esc(x[0])}</span><span class="s2-bar"><span style="width:${x[1]/maxMgr*100}%"></span></span><b>${x[1]}</b></div>`).join('')}</div>
 <div class="actions"><button class="btn primary" onclick="window.exportTerritory('${esc(r.id)}')">Export Territory</button><button class="btn" onclick="window.print()">Print</button><button class="btn" onclick="window.clearHighlight()">Clear Highlight</button></div>
 <div class="tablewrap"><table class="s2-mini-table"><thead><tr><th>Store</th><th>Location</th><th>Distance</th><th>Coverage Type</th></tr></thead><tbody>${inside.sort((a,b)=>hav(a.lat,a.lng,r.lat,r.lng)-hav(b.lat,b.lng,r.lat,r.lng)).slice(0,500).map(s=>{const u=unique.some(x=>x.siteId===s.siteId);return `<tr><td>${esc(s.retailer)} #${esc(s.storeNumber)}</td><td>${esc(s.city)}, ${esc(s.state)}</td><td>${hav(s.lat,s.lng,r.lat,r.lng).toFixed(1)} mi</td><td>${u?'Unique':'Shared'}</td></tr>`}).join('')}</tbody></table></div>`);
}
window.openTerritory=openTerritory;window.clearHighlight=()=>{highlightLayer.clearLayers();document.body.classList.remove('territory-focus')};window.exportTerritory=id=>{
 const r=activeRTS().find(x=>String(x.id)===String(id)),rad=Number($('radius').value),active=activeRTS();
 const rows=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad).map(s=>{const covering=active.filter(x=>hav(s.lat,s.lng,x.lat,x.lng)<=rad);return {SiteID:s.siteId,Retailer:s.retailer,StoreNumber:s.storeNumber,Address:s.address||'',City:s.city,State:s.state,ZIP:s.zip,DistanceMiles:hav(s.lat,s.lng,r.lat,r.lng).toFixed(1),CoverageType:covering.length===1?'Unique':'Shared',RTSWithinRadius:covering.length}});
 csv(rows,`territory_${r.name.replace(/\W+/g,'_')}.csv`);
}
function simulateAt(lat,lng){simLayer.clearLayers();const icon=L.divIcon({className:'',html:'<div class="sim-icon"></div>',iconSize:[24,24],iconAnchor:[12,12]});simMarker=L.marker([lat,lng],{icon,draggable:true}).addTo(simLayer);simMarker.on('dragend',updateSimulation);updateSimulation();simMode=false}
window.simulateAt=simulateAt;
function v76SimulationControls(){
 return `<div class="v76-sim-search">
   <div class="v76-sim-title">Find a home address</div>
   <input id="v76SimAddress" type="text" placeholder="Street, city, state ZIP" autocomplete="street-address">
   <div class="v76-sim-actions">
    <button class="btn primary" onclick="window.v76GeocodeSimulation()">Find Address</button>
    <button class="btn" onclick="window.v76UseSimulationCoords()">Use Coordinates</button>
    <button class="btn" onclick="window.v76UseMapCenter()">Use Map Center</button>
   </div>
   <input id="v76SimCoords" type="text" placeholder="Latitude, longitude — e.g. 34.36340, -111.50162">
   <div id="v76SimMessage" class="v76-sim-msg">You can also click anywhere on the map.</div>
  </div>`;
}

function v77ActiveRts(){
 return activeRTS();
}
function v77CoverageAtStore(store,radius=Number($('radius')?.value||75)){
 return (store._eligibleDistances||[]).filter(x=>x.distance<=radius);
}
function v77SimImpact(lat,lng,radius=Number($('radius')?.value||75)){
 const active=v77ActiveRts();
 const byName=new Map(active.map(r=>[r.name,r]));
 const currentCovered=stores.filter(s=>s.covered);
 const currentGaps=stores.filter(s=>!s.covered);

 const inRadius=stores
   .map(s=>({store:s,simDistance:hav(lat,lng,s.lat,s.lng)}))
   .filter(x=>x.simDistance<=radius)
   .sort((a,b)=>a.simDistance-b.simDistance);

 const netNew=[],backup=[],primaryRelief=[],fringeImproved=[],singlePoint=[],redundant=[];
 const relievedMap=new Map();

 for(const row of inRadius){
   const s=row.store;
   const current=v77CoverageAtStore(s,radius);
   const nearest=current[0]||null;
   const next=[...current];

   if(current.length===0){
     netNew.push(row);
   } else {
     backup.push(row);
   }

   if(nearest && row.simDistance < nearest.distance){
     primaryRelief.push({...row,currentPrimary:nearest});
     const key=nearest.name;
     if(!relievedMap.has(key))relievedMap.set(key,{name:key,count:0,stores:[]});
     relievedMap.get(key).count++;
     relievedMap.get(key).stores.push(s);
   }

   if(nearest && nearest.distance>=60 && nearest.distance<=75 && row.simDistance<nearest.distance){
     fringeImproved.push({...row,currentPrimary:nearest});
   }

   if(current.length===1){
     singlePoint.push({...row,currentPrimary:nearest});
   }

   if(current.length>=2){
     redundant.push(row);
   }
 }

 const projectedCovered=currentCovered.length+netNew.length;
 const relief=[...relievedMap.values()].sort((a,b)=>b.count-a.count);

 let rating='Balanced opportunity',ratingClass='good',ratingWhy='';
 if(netNew.length>=75){
   rating='Strong coverage opportunity';ratingClass='excellent';
   ratingWhy='This location closes a meaningful uncovered concentration while also improving network flexibility.';
 }else if(netNew.length>=25 || singlePoint.length>=25 || primaryRelief.length>=25){
   rating='Useful network improvement';ratingClass='good';
   ratingWhy='This location adds meaningful coverage, backup, or workload relief within the selected radius.';
 }else if(netNew.length<10 && backup.length>netNew.length*5){
   rating='High overlap / limited benefit';ratingClass='watch';
   ratingWhy='Most stores are already well covered and the location adds limited network improvement.';
 }else{
   ratingWhy='The location provides moderate improvement but should be compared with nearby gap-cluster alternatives.';
 }

 return {
   lat,lng,radius,inRadius,netNew,backup,primaryRelief,fringeImproved,
   singlePoint,redundant,relief,projectedCovered,rating,ratingClass,ratingWhy
 };
}
function v77ImpactRows(mode,impact){
 if(mode==='netNew')return impact.netNew;
 if(mode==='backup')return impact.backup;
 if(mode==='relief')return impact.primaryRelief;
 if(mode==='fringe')return impact.fringeImproved;
 if(mode==='single')return impact.singlePoint;
 if(mode==='redundant')return impact.redundant;
 return [];
}
function v77ImpactTitle(mode){
 return ({
  netNew:'Net-new coverage',
  backup:'Backup coverage gained',
  relief:'Primary relief potential',
  fringe:'Fringe stores improved',
  single:'Single-point strengthened',
  redundant:'Redundant overlap'
 })[mode]||'Simulation impact';
}
function v77ClearSimulationImpact(){
 highlightLayer.clearLayers();
}
function v77HighlightSimulationImpact(mode){
 const impact=window._v77SimImpact;if(!impact)return;
 const rows=v77ImpactRows(mode,impact);
 highlightLayer.clearLayers();
 rows.forEach(row=>{
   const s=row.store;
   L.circleMarker([s.lat,s.lng],{
     radius:7,weight:3,fillOpacity:.85
   }).bindTooltip(`${s.retailer||'Store'} ${s.storeNumber||s.storeNbr||s.siteId||''} · ${v77ImpactTitle(mode)}`)
     .addTo(highlightLayer);
 });
 const details=$('v77ImpactDetails');
 if(details){
   const first=rows.slice(0,15).map(r=>{
     const s=r.store;
     const label=`${s.retailer||'Store'} ${s.storeNumber||s.storeNbr||s.siteId||''} — ${s.city||''}, ${s.state||''}`;
     const extra=r.currentPrimary?` · current RTS ${r.currentPrimary.name} ${r.currentPrimary.distance.toFixed(1)} mi`:'';
     return `<div class="v77-impact-row" onclick="window.v77FocusStore('${esc(s.siteId)}')"><b>${esc(label)}</b>${esc(extra)}</div>`;
   }).join('');
   details.innerHTML=`<b>${esc(v77ImpactTitle(mode))}: ${rows.length}</b>${first||'<div>No stores in this category.</div>'}${rows.length>15?`<div class="muted">Showing first 15 of ${rows.length}.</div>`:''}`;
 }
}
function v77FocusStore(siteId){
 const s=stores.find(x=>String(x.siteId)===String(siteId));
 if(!s)return;
 map.flyTo([s.lat,s.lng],11,{duration:.4});
 const marker=markerById.get(s.siteId);
 if(marker?.openPopup)marker.openPopup();
}
window.v77HighlightSimulationImpact=v77HighlightSimulationImpact;
window.v77ClearSimulationImpact=v77ClearSimulationImpact;
window.v77FocusStore=v77FocusStore;

function v76SimulationResultHtml(p,gained,current,after,total){
 const impact=v77SimImpact(p.lat,p.lng,Number($('radius')?.value||75));
 window._v77SimImpact=impact;
 window._simGained=impact.netNew.map(x=>x.store);

 const reliefHtml=impact.relief.length
   ? impact.relief.slice(0,8).map(x=>`<button class="v77-relief-chip" onclick="window.openTerritoryByName?.('${esc(x.name)}')">${esc(x.name)} · ${x.count}</button>`).join('')
   : '<span class="muted">No current RTS would become farther than the simulated location for stores in this radius.</span>';

 const metric=(key,title,count,sub)=>`<button class="v77-sim-metric" onclick="window.v77HighlightSimulationImpact('${key}')">
   <div class="v77-sim-label">${title}<span class="v77-help-dot">?</span></div>
   <div class="v77-sim-value">${count.toLocaleString()}</div>
   <div class="v77-sim-sub">${sub}</div>
 </button>`;

 return `${v76SimulationControls()}
  <div class="v77-sim-assessment ${impact.ratingClass}">
    <div><small>Placement assessment</small><b>${esc(impact.rating)}</b></div>
    <span>${impact.radius} mi simulation</span>
  </div>
  <div class="v77-sim-why"><b>Why this rating:</b> ${esc(impact.ratingWhy)} Click any metric below to highlight its stores on the map.</div>

  <div class="v77-sim-grid">
   ${metric('netNew','Net-new coverage',impact.netNew.length,'currently uncovered stores')}
   ${metric('backup','Backup coverage gained',impact.backup.length,'covered stores gain another RTS option')}
   ${metric('relief','Primary relief potential',impact.primaryRelief.length,'simulated RTS becomes closer')}
   ${metric('fringe','Fringe stores improved',impact.fringeImproved.length,'current nearest RTS is 60–75 miles away')}
   ${metric('single','Single-point strengthened',impact.singlePoint.length,'stores gain an in-radius backup')}
   ${metric('redundant','Redundant overlap',impact.redundant.length,'already have two or more RTS in range')}
  </div>

  <div class="v77-sim-section">
   <h4>Current RTS potentially relieved</h4>
   <div class="v77-relief-list">${reliefHtml}</div>
  </div>

  <div class="v77-sim-section">
   <h4>Compare simulated placement to current network</h4>
   <div class="v77-impact-actions">
    <button class="btn" onclick="window.v77HighlightSimulationImpact('netNew')">Net-new (${impact.netNew.length})</button>
    <button class="btn" onclick="window.v77HighlightSimulationImpact('backup')">Backup gained (${impact.backup.length})</button>
    <button class="btn" onclick="window.v77HighlightSimulationImpact('relief')">Primary relief (${impact.primaryRelief.length})</button>
    <button class="btn" onclick="window.v77HighlightSimulationImpact('fringe')">Fringe improved (${impact.fringeImproved.length})</button>
    <button class="btn" onclick="window.v77HighlightSimulationImpact('single')">Single-point (${impact.singlePoint.length})</button>
    <button class="btn" onclick="window.v77HighlightSimulationImpact('redundant')">Redundant overlap (${impact.redundant.length})</button>
    <button class="btn" onclick="window.v77ClearSimulationImpact()">Clear highlights</button>
   </div>
   <div id="v77ImpactDetails" class="v77-impact-details">Choose a category to highlight those stores and compare the simulated RTS with current coverage.</div>
  </div>

  <div class="v77-sim-section v77-projected">
   <b>Projected ${ACTIVE_PROGRAM_ID==='one-walmart'?'One Walmart':'Premium Merchandising'} coverage:</b>
   ${impact.projectedCovered.toLocaleString()} / ${stores.length.toLocaleString()} stores
   (${stores.length?(impact.projectedCovered/stores.length*100).toFixed(1):'0.0'}%)
   <div class="muted">Impact compares the simulated location against the current RTS network using the selected ${impact.radius}-mile radius.</div>
  </div>

  <div class="v77-sim-section">
    <div class="v77-sim-actions-bottom">
      <button class="btn primary" onclick="window.v77ViewSimulationStores()">View stores in radius</button>
      <button class="btn" onclick="window.exportSimulation()">Export impact</button>
      <button class="btn" onclick="window.v77CopySimulationJson()">Copy JSON for this location</button>
      <button class="btn" onclick="window.v77ClearSimulation()">Clear simulation</button>
    </div>
  </div>`;
}
function v77ViewSimulationStores(){
 const impact=window._v77SimImpact;if(!impact)return;
 openModal('Stores inside simulated RTS radius',`
  <div class="callout">${impact.inRadius.length.toLocaleString()} stores are within ${impact.radius} miles of the simulated location.</div>
  <div class="tablewrap"><table><thead><tr><th>Store</th><th>Location</th><th>Distance</th><th>Current Coverage</th><th>District/Area</th></tr></thead><tbody>
  ${impact.inRadius.map(x=>{
    const s=x.store,org=v7OrgForStore(s);
    return `<tr class="v76-drill-row" onclick="window.v77FocusStore('${esc(s.siteId)}')"><td><b>${esc(s.retailer||'Store')} ${esc(s.storeNumber||s.storeNbr||s.siteId||'')}</b></td><td>${esc((s.city||'')+', '+(s.state||''))}</td><td>${x.simDistance.toFixed(1)} mi</td><td>${esc(s.coverageType||'')}</td><td>${esc(org.areaManager||'')}</td></tr>`;
  }).join('')}</tbody></table></div>`);
}
function v77CopySimulationJson(){
 const impact=window._v77SimImpact;if(!impact)return;
 const payload={
   program:ACTIVE_PROGRAM_ID,
   lat:Number(impact.lat.toFixed(6)),lng:Number(impact.lng.toFixed(6)),
   radiusMiles:impact.radius,
   netNewCoverage:impact.netNew.length,
   backupCoverageGained:impact.backup.length,
   primaryReliefPotential:impact.primaryRelief.length,
   fringeStoresImproved:impact.fringeImproved.length,
   singlePointStrengthened:impact.singlePoint.length,
   redundantOverlap:impact.redundant.length,
   projectedCoverage:impact.projectedCovered
 };
 navigator.clipboard?.writeText(JSON.stringify(payload,null,2));
}
function v77ClearSimulation(){
 simMode=false;
 if(simMarker){simLayer.removeLayer(simMarker);simMarker=null}
 highlightLayer.clearLayers();
 if($('drawer'))$('drawer').classList.remove('show');
}
window.v77ViewSimulationStores=v77ViewSimulationStores;
window.v77CopySimulationJson=v77CopySimulationJson;
window.v77ClearSimulation=v77ClearSimulation;

function updateSimulation(){
 if(!simMarker)return;
 const p=simMarker.getLatLng(),rad=Number($('radius').value);
 const scope=stores,gaps=scope.filter(s=>!s.covered);
 const gained=gaps.filter(s=>hav(s.lat,s.lng,p.lat,p.lng)<=rad);
 const current=scope.length-gaps.length,after=current+gained.length;
 showDrawer('Simulated New RTS',v76SimulationResultHtml(p,gained,current,after,scope.length));
 window._simGained=gained;
}
async function v76GeocodeSimulation(){
 const input=$('v76SimAddress'),msg=$('v76SimMessage');
 const q=(input?.value||'').trim();if(!q){if(msg)msg.textContent='Enter an address first.';return}
 if(msg)msg.textContent='Searching address…';
 try{
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(q);
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw new Error('Address search failed');
  const rows=await response.json();
  if(!rows.length){if(msg)msg.textContent='No matching address found. Try adding city, state, and ZIP.';return}
  const lat=Number(rows[0].lat),lng=Number(rows[0].lon);
  simulateAt(lat,lng);map.flyTo([lat,lng],8,{duration:.5});
 }catch(error){
  if(msg)msg.textContent='Address search could not complete. You can enter latitude/longitude or click the map.';
 }
}
function v76UseSimulationCoords(){
 const raw=($('v76SimCoords')?.value||'').trim();
 const m=raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
 const msg=$('v76SimMessage');
 if(!m){if(msg)msg.textContent='Enter coordinates as latitude, longitude.';return}
 const lat=Number(m[1]),lng=Number(m[2]);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){if(msg)msg.textContent='Those coordinates are not valid.';return}
 simulateAt(lat,lng);map.flyTo([lat,lng],8,{duration:.5});
}
function v76UseMapCenter(){const c=map.getCenter();simulateAt(c.lat,c.lng)}
window.v76GeocodeSimulation=v76GeocodeSimulation;
window.v76UseSimulationCoords=v76UseSimulationCoords;
window.v76UseMapCenter=v76UseMapCenter;
window.exportSimulation=()=>{
 const impact=window._v77SimImpact;if(!impact)return;
 const rows=[];
 const push=(category,list)=>list.forEach(x=>{
   const s=x.store,org=v7OrgForStore(s);
   rows.push({
     Category:category,
     Store:s.storeNumber||s.storeNbr||s.siteId||'',
     Retailer:s.retailer||'',
     City:s.city||'',State:s.state||'',
     SimDistance:Number(x.simDistance.toFixed(2)),
     CurrentNearestRTS:x.currentPrimary?.name||s.nearest?.[0]?.name||'',
     CurrentNearestDistance:Number((x.currentPrimary?.distance??s.nearest?.[0]?.distance??0).toFixed(2)),
     RegionalManager:org.regionalManager||'',
     DistrictAreaManager:org.areaManager||''
   });
 });
 push('Net-new',impact.netNew);
 push('Backup gained',impact.backup);
 push('Primary relief',impact.primaryRelief);
 push('Fringe improved',impact.fringeImproved);
 push('Single-point strengthened',impact.singlePoint);
 push('Redundant overlap',impact.redundant);
 csv(rows,`simulation_${ACTIVE_PROGRAM_ID}_${impact.lat.toFixed(4)}_${impact.lng.toFixed(4)}.csv`);
};
window.showNearbyStores=function(siteId){
 const s=stores.find(x=>String(x.siteId)===String(siteId));
 if(!s)return;
 const rows=stores.filter(x=>x.siteId!==s.siteId)
   .map(x=>({store:x,distance:hav(s.lat,s.lng,x.lat,x.lng)}))
   .sort((a,b)=>a.distance-b.distance)
   .slice(0,25);
 showDrawer(`Nearby Stores — ${s.retailer} #${s.storeNumber||'—'}`,`
   <div class="callout">The 25 closest mapped stores to ${esc(s.address||`${s.city}, ${s.state}`)}.</div>
   <div class="tablewrap"><table><thead><tr><th>Store</th><th>Address / Location</th><th>Distance</th></tr></thead><tbody>
   ${rows.map(x=>`<tr><td>${esc(x.store.retailer)} #${esc(x.store.storeNumber||'—')}</td><td>${esc(x.store.address||'')}<br>${esc(x.store.city)}, ${esc(x.store.state)} ${esc(x.store.zip)}</td><td>${x.distance.toFixed(1)} mi</td></tr>`).join('')}
   </tbody></table></div>
 `);
};

function startSimulation(){
 simMode=true;
 showDrawer('Simulate New RTS',`${v76SimulationControls()}<div class="callout">Enter an address, use coordinates, use the map center, or click anywhere on the map to place a draggable simulated RTS marker.</div>`);
}
map.on('click',e=>{if(simMode)simulateAt(e.latlng.lat,e.latlng.lng)});
function openModal(title,html){$('modalTitle').textContent=title;$('modalContent').innerHTML=html;$('modal').classList.add('show')}
function gapClusters(base=stores.filter(s=>!s.covered),rad=75,min=10){const remaining=new Set(base.map(s=>s.siteId)),out=[];for(const seed of base){if(!remaining.has(seed.siteId))continue;const group=base.filter(s=>remaining.has(s.siteId)&&hav(seed.lat,seed.lng,s.lat,s.lng)<=rad);group.forEach(s=>remaining.delete(s.siteId));if(group.length>=min){const lat=group.reduce((a,s)=>a+s.lat,0)/group.length,lng=group.reduce((a,s)=>a+s.lng,0)/group.length;out.push({lat,lng,count:group.length,city:seed.city,state:seed.state,stores:group})}}return out.sort((a,b)=>b.count-a.count)}
function openGapFinder(){
 const clusters=gapClustersV2(filtered,100);
 openModal('Current Gap Finder',`
  <div class="callout"><b>Purpose:</b> Find concentrated uncovered areas in the current filtered scope. Every row is actionable: click it to simulate an RTS at that location, then compare net-new coverage, backup strength, relief, and overlap.</div>
  <div class="tools"><button class="btn" onclick="window.exportGapClusters()">Export Gap Clusters</button></div>
  <div class="tablewrap"><table><thead><tr><th>Rank</th><th>Area</th><th>Uncovered Stores</th><th></th></tr></thead><tbody>
   ${clusters.map(c=>`<tr class="v76-drill-row" onclick="window.simulateAt(${c.lat},${c.lng});document.getElementById('modal').classList.remove('show')"><td>${c.rank}</td><td><b>${esc(c.city)}, ${esc(c.state)}</b></td><td>${c.gain}</td><td>Simulate ↗</td></tr>`).join('')}
  </tbody></table></div>`);
 window._clusters=clusters.map(c=>({...c,count:c.gain}));
}
function territoryBalanceRows(scope=currentScope()){
 const rows=territoryHealthV2(scope);
 const avg=rows.length?rows.reduce((a,x)=>a+x.count,0)/rows.length:0;

 return rows.map(x=>{
   let level='good',action='Balanced — continue monitoring.';
   if(x.ratio>=1.55 || (x.uniqueCount>=150 && x.uniqueShare>=80)){
     level='high';
     action='High in-radius workload or unique dependency. Review capacity and consider placing an additional RTS near this service area.';
   }else if(x.ratio>=1.25 || x.avgDistance>=42 || (x.uniqueCount>=100 && x.uniqueShare>=75)){
     level='watch';
     action='Review in-radius workload, drive distance, and unique dependency. Additional nearby coverage may improve resiliency.';
   }else if(x.ratio<=.45){
     level='watch';
     action='Light in-radius workload. Review whether this RTS can support nearby shared coverage or adjacent future expansion.';
   }

   return {
     r:x.r,
     owned:x.count,
     covered:x.count,
     outside:0,
     coverage:100,
     avgDist:x.avgDistance,
     ratio:x.ratio,
     backupRisk:x.uniqueCount,
     uniqueCount:x.uniqueCount,
     sharedCount:x.sharedCount,
     uniqueShare:x.uniqueShare,
     level,
     action
   };
 }).sort((a,b)=>({high:2,watch:1,good:0}[b.level]-{high:2,watch:1,good:0}[a.level])||b.owned-a.owned);
}
function territoryBalancer(){
 const scope=currentScope();
 const rows=territoryBalanceRows(scope);
 const high=rows.filter(x=>x.level==='high').length;
 const watch=rows.filter(x=>x.level==='watch').length;
 const avg=rows.length?rows.reduce((a,x)=>a+x.owned,0)/rows.length:0;
 const model=coverageModel(scope);

 openModal('Territory Balancer',`
 <div class="callout"><b>Scope:</b> ${esc(scopeLabel())}. This tool evaluates only stores inside each RTS service radius. Network gaps are shown separately and are not assigned to an existing RTS.</div>
 <div class="balance-grid">
  <div class="balance-card"><small>Active RTS</small><b>${rows.length}</b><span>Included in this scope</span></div>
  <div class="balance-card"><small>Average in-radius workload</small><b>${Math.round(avg)}</b><span>Stores within ${model.rad} miles</span></div>
  <div class="balance-card"><small>High priority</small><b>${high}</b><span>Capacity or resiliency review</span></div>
  <div class="balance-card"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No active RTS within ${model.rad} miles</span></div>
 </div>
 <div class="tools"><button class="btn" onclick="window.exportBalance()">Export Balance Review</button></div>
 ${rows.map(x=>`<div class="balance-rec ${x.level}">
   <h4>${esc(x.r.name)} — ${x.owned} stores within radius</h4>
   <p><b>${x.uniqueCount} unique</b> · ${x.sharedCount} shared · ${x.avgDist.toFixed(1)} mi average drive · ${x.uniqueShare.toFixed(1)}% uniquely dependent.</p>
   <p>${esc(x.action)}</p>
   <div style="margin-top:6px"><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open Territory</button></div>
 </div>`).join('')}
 `);
 window._balanceRows=rows;
}
window.exportBalance=()=>csv((window._balanceRows||[]).map(x=>({RTS:x.r.name,Email:x.r.email,NearestOwned:x.owned,Covered:x.covered,UniqueStores:x.uniqueCount,SharedStores:x.sharedCount,UniqueSharePercent:x.uniqueShare.toFixed(1),AverageDistanceMiles:x.avgDist.toFixed(1),Priority:x.level,Recommendation:x.action})),'premium_merchandising_territory_balance.csv');

function buildHiringPlan(scope=currentScope(),limit=20){
 return gapClustersV2(scope,limit);
}
function hiringRecommendationPlan(){
 const scope=currentScope(),currentCovered=scope.filter(s=>s.covered).length,plan=buildHiringPlan(scope,20);let cumulative=0;
 openModal('Hiring Recommendation Plan',`
 <div class="callout"><b>Scope:</b> ${esc(scopeLabel())}. Each suggestion targets the largest remaining uncovered cluster within 75 miles. Planning estimate only.</div>
 <div class="tools"><button class="btn" onclick="window.exportHiringPlan()">Export Hiring Plan</button><button class="btn" onclick="window.showHiringPlanOnMap()">Show Suggestions on Map</button></div>
 <div class="tablewrap"><table><thead><tr><th>Rank</th><th>Suggested Area</th><th>Net-New Stores</th><th>Cumulative Coverage</th><th>Primary Manager</th><th>Primary Retailer</th><th>Action</th></tr></thead><tbody>
 ${plan.map(x=>{cumulative+=x.gain;const after=(currentCovered+cumulative)/Math.max(1,scope.length)*100;return `<tr><td>${x.rank}</td><td>${esc(x.city)}, ${esc(x.state)}</td><td>${x.gain}</td><td>${after.toFixed(1)}%</td><td>${esc(x.topManager)}</td><td>${esc(x.topRetailer)}</td><td><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">Simulate</button></td></tr>`}).join('')}
 </tbody></table></div>`);
 window._hiringPlan=plan;
}
window.exportHiringPlan=()=>csv((window._hiringPlan||[]).map(x=>({Rank:x.rank,City:x.city,State:x.state,Latitude:x.lat,Longitude:x.lng,NetNewStores:x.gain,PrimaryManager:x.topManager,PrimaryRetailer:x.topRetailer})),'premium_merchandising_hiring_recommendations.csv');
window.showHiringPlanOnMap=()=>{
 simLayer.clearLayers();(window._hiringPlan||[]).forEach(x=>{const icon=L.divIcon({className:'',html:`<div class="sim-icon" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:950">${x.rank}</div>`,iconSize:[24,24],iconAnchor:[12,12]});L.marker([x.lat,x.lng],{icon}).bindTooltip(`#${x.rank} ${x.city}, ${x.state}<br>+${x.gain} stores`).on('click',()=>simulateAt(x.lat,x.lng)).addTo(simLayer)});$('modal').classList.remove('show');if((window._hiringPlan||[]).length)map.fitBounds(window._hiringPlan.map(x=>[x.lat,x.lng]),{padding:[35,35],maxZoom:7});
};

function leadershipReport(){
 const scope=currentScope(),model=coverageModel(scope),covered=scope.length-model.gaps.length,pct=scope.length?covered/scope.length*100:0;
 const health=territoryHealthV2(scope),plan=gapClustersV2(scope,8),gapIds=new Set(model.gaps.map(s=>String(s.siteId)));
 const states=Object.values(scope.reduce((o,s)=>{const k=s.state||'Unknown';o[k]??={name:k,total:0,gaps:0};o[k].total++;if(gapIds.has(String(s.siteId)))o[k].gaps++;return o},{})).sort((a,b)=>b.gaps-a.gaps).slice(0,8);
 const managers=Object.values(scope.reduce((o,s)=>{const k=v7OrgForStore(s).areaManager||'Not listed';o[k]??={name:k,total:0,gaps:0};o[k].total++;if(gapIds.has(String(s.siteId)))o[k].gaps++;return o},{})).sort((a,b)=>b.gaps-a.gaps).slice(0,8);
 const risk=[...health].sort((a,b)=>a.score-b.score).slice(0,6),work=[...health].sort((a,b)=>b.count-a.count).slice(0,6);
 openModal('Leadership Summary',`<div class="v78-leader-hero"><h2>${esc(v4ProgramLabel())} Leadership Summary</h2><p>${esc(scopeLabel())} · ${model.radiusMiles||Number($('radius').value)}-mile service radius</p></div>
 <div class="v6-kpi-grid"><div class="v6-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} covered</span></div><div class="v6-kpi"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No eligible RTS in radius</span></div><div class="v6-kpi"><small>Unique dependency</small><b>${model.uniqueStores.length.toLocaleString()}</b><span>Exactly one RTS in range</span></div><div class="v6-kpi"><small>Shared coverage</small><b>${model.sharedStores.length.toLocaleString()}</b><span>2+ RTS in range</span></div></div>
 <div class="v78-decision-callout"><b>Leadership interpretation:</b> ${pct>=80?'Coverage is broadly stable; prioritize isolated gaps, unique-dependency risk, and workload balancing.':pct>=60?'Coverage is mixed; prioritize concentrated gaps and high-dependency RTS service areas.':'Coverage remains materially constrained; validate new RTS placement opportunities before workload balancing.'}</div>
 <div class="v4-two"><div class="v4-panel"><h3>Highest-gap states</h3>${states.map(x=>`<div class="v78-drill-row v4-list-row" data-drill-type="state" data-drill-value="${esc(x.name)}"><span><b>${esc(x.name)}</b><br>${x.total} stores</span><span>${x.gaps} gaps ↗</span></div>`).join('')}</div>
 <div class="v4-panel"><h3>Highest manager exposure</h3>${managers.map(x=>`<div class="v78-drill-row v4-list-row" data-drill-type="manager" data-drill-value="${esc(x.name)}"><span><b>${esc(x.name)}</b><br>${x.total} stores</span><span>${x.gaps} gaps ↗</span></div>`).join('')}</div></div>
 <div class="v4-two"><div class="v4-panel"><h3>Service-area risk</h3>${risk.map(x=>`<div class="v78-drill-row v4-list-row" data-drill-type="rts" data-drill-value="${esc(x.r.id)}"><span><b>${esc(x.r.name)}</b><br>${x.uniqueCount} unique · ${x.sharedCount} shared</span><span>${x.score.toFixed(0)}/100 ↗</span></div>`).join('')}</div>
 <div class="v4-panel"><h3>Workload leaders</h3>${work.map(x=>`<div class="v78-drill-row v4-list-row" data-drill-type="rts" data-drill-value="${esc(x.r.id)}"><span><b>${esc(x.r.name)}</b><br>${x.avgDistance.toFixed(1)} mi avg</span><span>${x.count} stores ↗</span></div>`).join('')}</div></div>
 <div class="v4-panel"><h3>Top placement opportunities</h3>${plan.map(x=>`<div class="v78-drill-row v4-list-row" data-drill-type="simulate" data-drill-value="${esc(x.city)}" data-lat="${x.lat}" data-lng="${x.lng}"><span><b>${esc(x.city)}, ${esc(x.state||'')}</b><br>${esc(x.manager||'')} · ${esc(x.retailer||'')}</span><span>+${x.gain} ↗</span></div>`).join('')}</div>
 <div class="actions"><button class="btn primary" onclick="window.print()">Print / Save PDF</button><button class="btn" onclick="window.exportLeadershipSummary()">Export Summary</button><button class="btn" onclick="window.v62SaveScenario()">Save Placement Scenario</button></div>`);
 window._leadershipSummary=[{Program:v4ProgramLabel(),Scope:scopeLabel(),Stores:scope.length,Covered:covered,CoveragePercent:pct.toFixed(1),NetworkGaps:model.gaps.length,UniqueStores:model.uniqueStores.length,SharedStores:model.sharedStores.length,TopGapState:states[0]?.name||'',TopGapStateGaps:states[0]?.gaps||0,TopManager:managers[0]?.name||'',TopManagerGaps:managers[0]?.gaps||0,TopPlacement:plan[0]?`${plan[0].city}, ${plan[0].state}`:'',TopPlacementGain:plan[0]?.gain||0}];
}
window.exportLeadershipSummary=()=>csv(window._leadershipSummary||[],'premium_merchandising_leadership_summary.csv');




const V76_PLAN_CACHE=new Map();
function v76ScopeCacheKey(scope,limit=0){
 const parts=[
   ACTIVE_PROGRAM_ID,Number($('radius')?.value||75),limit,
   $('fCoverage')?.value||'', $('fRetailer')?.value||'', $('fState')?.value||'',
   $('fRegional')?.value||'', $('fManager')?.value||'', $('fRts')?.value||'',
   scope.length
 ];
 if(scope!==filtered&&scope!==stores){
   parts.push(scope.slice(0,30).map(s=>s.siteId).join(','));
 }
 return parts.join('|');
}
function v76RtsLookup(){
 const map=new Map();
 RTS.forEach(r=>map.set(String(r.id),r));
 return map;
}
function coverageModel(scope=stores){
 const radius=Number($('radius')?.value||75);
 const lookup=v76RtsLookup();
 const byRtsMap=new Map(RTS.map(r=>[String(r.id),{
   rts:r,entries:[],stores:[],count:0,uniqueCount:0,sharedCount:0,
   distanceSum:0,averageDistance:0,farthestDistance:0
 }]));
 const storeCoverage=[];
 const gaps=[],uniqueStores=[],sharedStores=[];

 for(const store of scope){
   const covering=[];
   for(const d of (store._eligibleDistances||[])){
     if(d.distance>radius)break;
     const r=lookup.get(String(d.id));
     if(!r)continue;
     covering.push({...r,distance:d.distance});
   }
   const type=covering.length===0?'Gap':covering.length===1?'Unique':'Shared';
   const entry={store,coveringRts:covering,coverageType:type};
   storeCoverage.push(entry);
   if(type==='Gap')gaps.push(store);
   else if(type==='Unique')uniqueStores.push(store);
   else sharedStores.push(store);

   for(const coveringRts of covering){
     const row=byRtsMap.get(String(coveringRts.id));
     if(!row)continue;
     row.entries.push(entry);
     row.stores.push(store);
     row.count++;
     row.distanceSum+=coveringRts.distance;
     if(coveringRts.distance>row.farthestDistance)row.farthestDistance=coveringRts.distance;
     if(type==='Unique')row.uniqueCount++;
     else if(type==='Shared')row.sharedCount++;
   }
 }
 const byRts=[...byRtsMap.values()].map(row=>{
   row.averageDistance=row.count?row.distanceSum/row.count:0;
   delete row.distanceSum;
   return row;
 });
 return {radiusMiles:radius,activeRts:[...RTS],storeCoverage,byRts,gaps,uniqueStores,sharedStores};
}
function territoryHealthV2(scope=filtered){
 const model=coverageModel(scope);
 const counts=model.byRts.map(x=>x.count);
 const avgCount=counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:0;
 return model.byRts.map(item=>{
   const ratio=item.count/Math.max(1,avgCount);
   const uniqueShare=item.count?item.uniqueCount/item.count*100:0;
   let score=100;
   if(item.averageDistance>50)score-=20;else if(item.averageDistance>40)score-=12;else if(item.averageDistance>30)score-=6;
   if(ratio>1.65)score-=20;else if(ratio>1.35)score-=12;else if(ratio<.4)score-=8;
   if(uniqueShare>85&&item.uniqueCount>100)score-=12;else if(uniqueShare>70&&item.uniqueCount>75)score-=6;
   score=Math.max(0,Math.min(100,score));
   let health='Excellent',cls='excellent';
   if(score<50){health='Needs Attention';cls='critical'}
   else if(score<68){health='Fair';cls='watch'}
   else if(score<84){health='Good';cls='good'}
   return {...item,r:item.rts,avgDistance:item.averageDistance,farthest:item.farthestDistance,
     ratio,workloadRatio:ratio,uniqueShare,score,health,className:cls,cls,
     backupRisk:item.uniqueCount,overlap:item.sharedCount};
 }).sort((a,b)=>a.score-b.score||b.count-a.count);
}
function gapClustersV2(scope=filtered,limit=25){
 const radius=Number($('radius')?.value||75);
 const cacheKey=v76ScopeCacheKey(scope,limit);
 if(V76_PLAN_CACHE.has(cacheKey))return V76_PLAN_CACHE.get(cacheKey);

 let remaining=scope.filter(s=>!s.covered);
 if(!remaining.length)return [];

 // Grid index: keeps candidate evaluation local rather than gap × gap national scans.
 const cell=Math.max(.75,radius/55);
 const grid=new Map();
 const keyFor=s=>`${Math.floor(s.lat/cell)}:${Math.floor(s.lng/cell)}`;
 for(const s of remaining){
   const k=keyFor(s);
   if(!grid.has(k))grid.set(k,[]);
   grid.get(k).push(s);
 }
 const neighbors=(candidate,activeSet)=>{
   const cx=Math.floor(candidate.lat/cell),cy=Math.floor(candidate.lng/cell),out=[];
   for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
     const arr=grid.get(`${cx+dx}:${cy+dy}`)||[];
     for(const s of arr){
       if(!activeSet.has(s.siteId))continue;
       if(Math.abs(s.lat-candidate.lat)>radius/50)continue;
       if(hav(candidate.lat,candidate.lng,s.lat,s.lng)<=radius)out.push(s);
     }
   }
   return out;
 };

 const activeSet=new Set(remaining.map(s=>s.siteId));
 const recommendations=[];
 for(let rank=1;rank<=limit&&activeSet.size;rank++){
   let best=null;
   for(const candidate of remaining){
     if(!activeSet.has(candidate.siteId))continue;
     const gain=neighbors(candidate,activeSet);
     if(!best||gain.length>best.gain.length)best={candidate,gain};
   }
   if(!best||best.gain.length<3)break;
   const countBy=key=>Object.entries(best.gain.reduce((o,s)=>{
     const v=s[key]||'Not listed';o[v]=(o[v]||0)+1;return o;
   },{})).sort((a,b)=>b[1]-a[1]);
   recommendations.push({
     rank,lat:best.candidate.lat,lng:best.candidate.lng,city:best.candidate.city,
     state:best.candidate.state,gain:best.gain.length,stores:best.gain,
     manager:countBy('manager')[0]?.[0]||'',retailer:countBy('retailer')[0]?.[0]||''
   });
   best.gain.forEach(s=>activeSet.delete(s.siteId));
 }
 V76_PLAN_CACHE.set(cacheKey,recommendations);
 if(V76_PLAN_CACHE.size>30)V76_PLAN_CACHE.delete(V76_PLAN_CACHE.keys().next().value);
 return recommendations;
}

function s6Scope(){return filtered}
function s6ScopeName(){return scopeLabel ? scopeLabel() : 'Current filtered scope'}

function s6TerritoryData(scope=s6Scope()){
 return territoryHealthV2(scope).map(x=>({
   ...x,
   inside:x.stores,
   owned:x.stores,
   ownedCount:x.count,
   covered:x.count,
   gaps:0,
   coverage:x.count?100:0,
   backupRisk:x.uniqueCount,
   overlap:x.sharedCount
 }));
}

function s6CandidatePlan(scope=s6Scope(),maxHires=10){
 return gapClustersV2(scope,maxHires);
}

function s6ProjectedCoverage(scope,plan,n){
 const covered=scope.filter(s=>s.covered).length;
 const gain=plan.slice(0,n).reduce((a,x)=>a+x.gain,0);
 return {covered:Math.min(scope.length,covered+gain),gain,pct:scope.length?Math.min(scope.length,covered+gain)/scope.length*100:0};
}

function executiveMode(){
 const scope=s6Scope();
 const model=coverageModel(scope);
 const covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const health=territoryHealthV2(scope);
 const plan=gapClustersV2(scope,5);
 const largest=[...health].sort((a,b)=>b.count-a.count)[0];
 const worst=health[0];
 const p3=s6ProjectedCoverage(scope,plan,3);

 const states=Object.values(scope.reduce((o,s)=>{
   const k=s.state||'Unknown';o[k]??={name:k,total:0,gaps:0};o[k].total++;
   if(model.gaps.some(g=>g.siteId===s.siteId))o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);

 openModal('Executive Mode',`
  <div class="s6-hero"><h2>Premium Merchandising Network Overview</h2><p><b>Coverage Model v2:</b> Workload is all stores within ${model.rad} miles. Gaps are stores with no RTS in range.</p></div>
  <div class="s6-grid">
   <div class="s6-card"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} covered of ${scope.length.toLocaleString()}</span></div>
   <div class="s6-card"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No RTS within radius</span></div>
   <div class="s6-card"><small>Best next hire</small><b>${plan[0]?`${esc(plan[0].city)}, ${esc(plan[0].state)}`:'—'}</b><span>${plan[0]?`+${plan[0].gain} net-new stores`:'No qualifying cluster'}</span></div>
   <div class="s6-card"><small>Coverage after 3 hires</small><b>${p3.pct.toFixed(1)}%</b><span>Estimated +${p3.gain.toLocaleString()} stores</span></div>
  </div>
  <div class="s6-two">
   <div class="s6-section"><h3>Priority signals</h3>
    <div class="s6-row"><span class="s6-rank">1</span><span><b>Highest-gap state</b><br>${states[0]?`${esc(states[0].name)} · ${states[0].gaps.toLocaleString()} gaps`:'—'}</span><span class="s6-tag critical">Gap</span></div>
    <div class="s6-row"><span class="s6-rank">2</span><span><b>Highest in-radius workload</b><br>${largest?`${esc(largest.r.name)} · ${largest.count} stores`:'—'}</span><span class="s6-tag watch">Workload</span></div>
    <div class="s6-row"><span class="s6-rank">3</span><span><b>Lowest service-area health</b><br>${worst?`${esc(worst.r.name)} · ${worst.score.toFixed(0)}/100`:'—'}</span><span class="s6-tag ${worst?.cls||'good'}">${worst?.health||'—'}</span></div>
   </div>
   <div class="s6-section"><h3>Recommended next hires</h3>
    ${plan.slice(0,4).map(x=>`<div class="s6-row"><span class="s6-rank">${x.rank}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>${esc(x.manager)} · ${esc(x.retailer)}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}
   </div>
  </div>
 `);
}

function territoryHealthScores(){
 const rows=s6TerritoryData();
 openModal('Territory Health Scores',`
  <div class="callout">Health scores evaluate only the RTS service area: stores within the selected radius, average drive distance, in-radius workload, unique dependency, and shared coverage. Network gaps outside the service area do not reduce an RTS score.</div>
  <div class="tools"><button class="btn" onclick="window.exportHealthScores()">Export Health Scores</button></div>
  ${rows.map(x=>`<div class="s6-rec v76-click-card ${x.cls==='critical'?'high':x.cls==='watch'?'watch':'good'}" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">
    <h4>${esc(x.r.name)} <span class="s6-tag ${x.cls}">${x.health} · ${x.score.toFixed(0)}/100</span></h4>
    <p>${x.count} stores within radius · ${x.uniqueCount} unique · ${x.sharedCount} shared · ${x.avgDistance.toFixed(1)} mi average distance.</p>
    <div class="s6-health-bar"><span style="width:${x.score}%;background:${x.score>=82?'#16a34a':x.score>=65?'#2563eb':x.score>=45?'#f59e0b':'#dc2626'}"></span></div>
    <div class="v76-open-hint">Open RTS profile ↗</div>
  </div>`).join('')}
 `);
 window._healthRows=rows;
}
window.exportHealthScores=()=>csv((window._healthRows||[]).map(x=>({
 RTS:x.r.name,Health:x.health,Score:x.score.toFixed(0),StoresWithinRadius:x.count,
 UniqueStores:x.uniqueCount,SharedStores:x.sharedCount,UniqueSharePercent:x.uniqueShare.toFixed(1),
 AverageDistanceMiles:x.avgDistance.toFixed(1),FarthestMiles:x.farthest.toFixed(1),
 BackupRiskStores:x.backupRisk
})),'premium_merchandising_territory_health.csv');

function multiHirePlanner(){
 const scope=s6Scope();
 const plan=gapClustersV2(scope,10);
 const current=scope.length?scope.filter(s=>s.covered).length/scope.length*100:0;
 openModal('Multi-Hire Coverage Planner',`
  <div class="callout"><b>Scope:</b> ${esc(s6ScopeName())}. Choose how many RTS to add. Suggested locations are selected sequentially from stores currently outside every active RTS radius.</div>
  <div class="s6-control">
    <label><b>RTS to add</b></label>
    <input id="s6HireSlider" type="range" min="1" max="${Math.max(1,plan.length)}" value="${Math.min(3,Math.max(1,plan.length))}">
    <div id="s6HireCount" class="s6-big">${Math.min(3,Math.max(1,plan.length))}</div>
  </div>
  <div id="s6HireResults" style="margin-top:10px"></div>
 `);
 window._multiHirePlan=plan;
 const slider=$('s6HireSlider');
 const render=()=>{
   const n=Number(slider.value),proj=s6ProjectedCoverage(scope,plan,n);
   $('s6HireCount').textContent=n;
   $('s6HireResults').innerHTML=`
    <div class="s6-grid">
      <div class="s6-card"><small>Current coverage</small><b>${current.toFixed(1)}%</b><span>Before added RTS</span></div>
      <div class="s6-card"><small>Projected coverage</small><b>${proj.pct.toFixed(1)}%</b><span>After ${n} added RTS</span></div>
      <div class="s6-card"><small>Net-new stores</small><b>${proj.gain.toLocaleString()}</b><span>Estimated newly covered</span></div>
      <div class="s6-card"><small>Gaps remaining</small><b>${Math.max(0,scope.length-proj.covered).toLocaleString()}</b><span>After modeled hires</span></div>
    </div>
    <div class="s6-section"><h3>Recommended hiring sequence</h3>
      ${plan.slice(0,n).map(x=>`<div class="s6-row"><span class="s6-rank">${x.rank}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>${esc(x.manager)} · ${esc(x.retailer)}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}
    </div>
    <div class="actions"><button class="btn primary" onclick="window.showMultiHireOnMap(${n})">Show on Map</button><button class="btn" onclick="window.exportMultiHire(${n})">Export Plan</button></div>`;
 };
 slider.oninput=render;render();
}
window.showMultiHireOnMap=n=>{
 simLayer.clearLayers();
 (window._multiHirePlan||[]).slice(0,n).forEach(x=>{
   const icon=L.divIcon({className:'',html:`<div class="sim-icon" style="display:flex;align-items:center;justify-content:center;color:#fff;font-weight:950;font-size:10px">${x.rank}</div>`,iconSize:[24,24],iconAnchor:[12,12]});
   L.marker([x.lat,x.lng],{icon}).bindTooltip(`#${x.rank} ${x.city}, ${x.state}<br>+${x.gain} stores`).on('click',()=>simulateAt(x.lat,x.lng)).addTo(simLayer);
 });
 $('modal').classList.remove('show');
 const pts=(window._multiHirePlan||[]).slice(0,n).map(x=>[x.lat,x.lng]);
 if(pts.length)map.fitBounds(pts,{padding:[35,35],maxZoom:7});
};
window.exportMultiHire=n=>csv((window._multiHirePlan||[]).slice(0,n).map(x=>({
 Rank:x.rank,City:x.city,State:x.state,Latitude:x.lat,Longitude:x.lng,
 NetNewStores:x.gain,PrimaryManager:x.manager,PrimaryRetailer:x.retailer
})),'premium_merchandising_multi_hire_plan.csv');



/* ===== v7.14 Performance Cache ===== */
const V714_CACHE={
  seqPlan:null,
  seqKey:'',
  managerRows:null,
  managerKey:'',
  regionalRows:null,
  regionalKey:'',
  managerProfiles:new Map(),
  regionalProfiles:new Map(),
  candidateImpact:new Map()
};

function v714CoverageVersionKey(){
  const radius=Number($('radius')?.value||75);
  const activeCount=Array.isArray(RTS)?RTS.filter(r=>r.active!==false).length:0;
  return `v7145|${ACTIVE_PROGRAM_ID}|${radius}|${stores.length}|${activeCount}`;
}
function v714ClearPlanningCache(){
  V714_CACHE.seqPlan=null;V714_CACHE.seqKey='';
  V714_CACHE.managerRows=null;V714_CACHE.managerKey='';
  V714_CACHE.regionalRows=null;V714_CACHE.regionalKey='';
  V714_CACHE.managerProfiles.clear();
  V714_CACHE.regionalProfiles.clear();
  V714_CACHE.candidateImpact.clear();
}
window.v714ClearPlanningCache=v714ClearPlanningCache;

function v714CachedSequentialPlan(){
  const key=v714CoverageVersionKey();
  if(V714_CACHE.seqPlan && V714_CACHE.seqKey===key)return V714_CACHE.seqPlan;
  const plan=v710SequentialPlan();
  if(window.v712DisambiguatePostingMarkets)v712DisambiguatePostingMarkets(plan.placements);
  V714_CACHE.seqPlan=plan;
  V714_CACHE.seqKey=key;
  return plan;
}
window.v714CachedSequentialPlan=v714CachedSequentialPlan;

function v714ManagerRowsCached(){
  const key=v714CoverageVersionKey();
  if(V714_CACHE.managerRows && V714_CACHE.managerKey===key)return V714_CACHE.managerRows;
  const rows=v793ManagerRows(stores);
  V714_CACHE.managerRows=rows;V714_CACHE.managerKey=key;
  return rows;
}
function v714RegionalRowsCached(){
  const key=v714CoverageVersionKey();
  if(V714_CACHE.regionalRows && V714_CACHE.regionalKey===key)return V714_CACHE.regionalRows;
  const rows=v793RegionalRows(stores);
  V714_CACHE.regionalRows=rows;V714_CACHE.regionalKey=key;
  return rows;
}

/* ===== v7.10 Sequential Authorized-Capacity Optimizer ===== */

/* ===== v7.11 Practical Posting Market Resolver ===== */
const V711_POSTING_MARKETS=[
 ['Atlanta','GA',33.7490,-84.3880],['Austin','TX',30.2672,-97.7431],['Baltimore','MD',39.2904,-76.6122],
 ['Birmingham','AL',33.5186,-86.8104],['Boise','ID',43.6150,-116.2023],['Boston','MA',42.3601,-71.0589],
 ['Buffalo','NY',42.8864,-78.8784],['Charlotte','NC',35.2271,-80.8431],['Chicago','IL',41.8781,-87.6298],
 ['Cincinnati','OH',39.1031,-84.5120],['Cleveland','OH',41.4993,-81.6944],['Columbus','OH',39.9612,-82.9988],
 ['Dallas','TX',32.7767,-96.7970],['Denver','CO',39.7392,-104.9903],['Des Moines','IA',41.5868,-93.6250],
 ['Detroit','MI',42.3314,-83.0458],['El Paso','TX',31.7619,-106.4850],['Fresno','CA',36.7378,-119.7871],
 ['Grand Rapids','MI',42.9634,-85.6681],['Greenville','SC',34.8526,-82.3940],['Harrisburg','PA',40.2732,-76.8867],
 ['Hartford','CT',41.7658,-72.6734],['Houston','TX',29.7604,-95.3698],['Indianapolis','IN',39.7684,-86.1581],
 ['Jackson','MS',32.2988,-90.1848],['Jacksonville','FL',30.3322,-81.6557],['Kansas City','MO',39.0997,-94.5786],
 ['Knoxville','TN',35.9606,-83.9207],['Las Vegas','NV',36.1699,-115.1398],['Little Rock','AR',34.7465,-92.2896],
 ['Los Angeles','CA',34.0522,-118.2437],['Louisville','KY',38.2527,-85.7585],['Memphis','TN',35.1495,-90.0490],
 ['Miami','FL',25.7617,-80.1918],['Milwaukee','WI',43.0389,-87.9065],['Minneapolis','MN',44.9778,-93.2650],
 ['Mobile','AL',30.6954,-88.0399],['Nashville','TN',36.1627,-86.7816],['New Orleans','LA',29.9511,-90.0715],
 ['New York','NY',40.7128,-74.0060],['Norfolk','VA',36.8508,-76.2859],['Oklahoma City','OK',35.4676,-97.5164],
 ['Omaha','NE',41.2565,-95.9345],['Orlando','FL',28.5383,-81.3792],['Philadelphia','PA',39.9526,-75.1652],
 ['Phoenix','AZ',33.4484,-112.0740],['Pittsburgh','PA',40.4406,-79.9959],['Portland','OR',45.5152,-122.6784],
 ['Providence','RI',41.8240,-71.4128],['Raleigh','NC',35.7796,-78.6382],['Richmond','VA',37.5407,-77.4360],
 ['Rochester','NY',43.1566,-77.6088],['Sacramento','CA',38.5816,-121.4944],['Salt Lake City','UT',40.7608,-111.8910],
 ['San Antonio','TX',29.4241,-98.4936],['San Diego','CA',32.7157,-117.1611],['San Francisco','CA',37.7749,-122.4194],
 ['San Jose','CA',37.3382,-121.8863],['Savannah','GA',32.0809,-81.0912],['Seattle','WA',47.6062,-122.3321],
 ['St. Louis','MO',38.6270,-90.1994],['Syracuse','NY',43.0481,-76.1474],['Tampa','FL',27.9506,-82.4572],
 ['Toledo','OH',41.6528,-83.5379],['Tucson','AZ',32.2226,-110.9747],['Tulsa','OK',36.1540,-95.9928],
 ['Washington','DC',38.9072,-77.0369],['Wichita','KS',37.6872,-97.3301],['Albuquerque','NM',35.0844,-106.6504],
 ['Charleston','SC',32.7765,-79.9311],['Charleston','WV',38.3498,-81.6326],['Chattanooga','TN',35.0456,-85.3097],
 ['Columbia','SC',34.0007,-81.0348],['Dayton','OH',39.7589,-84.1916],['Fort Wayne','IN',41.0793,-85.1394],
 ['Lexington','KY',38.0406,-84.5037],['Madison','WI',43.0731,-89.4012],['Roanoke','VA',37.2709,-79.9414],
 ['Scranton','PA',41.4089,-75.6624],['Spokane','WA',47.6588,-117.4260],['Springfield','MO',37.2089,-93.2923],
 ['Tallahassee','FL',30.4383,-84.2807],['Anchorage','AK',61.2181,-149.9003],['Fairbanks','AK',64.8378,-147.7164],
 ['Honolulu','HI',21.3069,-157.8583],['San Juan','PR',18.4655,-66.1057]
];

function v711PostingMarket(candidate){
 let best=null;
 for(const m of V711_POSTING_MARKETS){
   const d=hav(candidate.lat,candidate.lng,m[2],m[3]);
   if(!best||d<best.distance)best={city:m[0],state:m[1],lat:m[2],lng:m[3],distance:d};
 }
 const nearby=stores.filter(s=>hav(candidate.lat,candidate.lng,s.lat,s.lng)<=35);
 const counts=new Map();
 nearby.forEach(s=>{
   if(!s.city)return;
   const key=`${s.city}|${s.state||''}`;
   const cur=counts.get(key)||{count:0,dist:0};
   cur.count++; cur.dist+=hav(candidate.lat,candidate.lng,s.lat,s.lng);
   counts.set(key,cur);
 });
 const local=[...counts.entries()].map(([key,v])=>({key,count:v.count,avgDist:v.dist/v.count}))
   .sort((a,b)=>b.count-a.count||a.avgDist-b.avgDist)[0];

 if(best&&best.distance<=25)
   return {...best,label:`${best.city}, ${best.state}`,source:'nearby-major-metro'};
 if(best&&best.distance<=40&&local&&local.avgDist<=18)
   return {...best,label:`${best.city}, ${best.state}`,source:'same-market-metro'};
 if(local){
   const [city,state]=local.key.split('|');
   return {city,state,label:`${city}, ${state}`,distance:local.avgDist,source:'local-market'};
 }
 return {city:candidate.city||candidate.label||'Coverage area',state:candidate.state||'',
   label:`${candidate.city||candidate.label||'Coverage area'}${candidate.state?', '+candidate.state:''}`,
   distance:0,source:'coverage-center'};
}
function v710Roster(){ return Array.isArray(RTS)?RTS:[]; }
function v710ProgramCapacity(){
 const cap=100;
 const active=v710Roster().filter(r=>r.active!==false).length;
 return {cap,active,remaining:Math.max(0,cap-active)};
}

function v710CoverageState(extraPlacements=[]){
 const radius=Number($('radius')?.value||75);
 const covered=new Set();
 const counts=new Map();

 for(const s of stores){
   let count=0;
   for(const d of (s._eligibleDistances||[])){
     if(d.distance<=radius)count++;
     else break;
   }
   for(const p of extraPlacements){
     if(hav(s.lat,s.lng,p.lat,p.lng)<=radius)count++;
   }
   counts.set(String(s.siteId),count);
   if(count>0)covered.add(String(s.siteId));
 }
 return {covered,counts};
}

function v710CandidateUniverse(){
 // Use fast gap-cluster candidates plus state/manager gap centroids to improve recall.
 const candidates=[];
 const seen=new Set();

 const push=(lat,lng,city,state,label,source)=>{
   if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
   const key=`${lat.toFixed(3)}|${lng.toFixed(3)}`;
   if(seen.has(key))return;
   seen.add(key);
   candidates.push({lat,lng,city:city||'',state:state||'',label:label||`${city||''}, ${state||''}`,source});
 };

 gapClustersV2(stores,120).forEach(c=>push(c.lat,c.lng,c.city,c.state,`${c.city}, ${c.state}`,'gap-cluster'));

 const gaps=stores.filter(s=>!s.covered);
 const byState=gaps.reduce((o,s)=>(o[s.state||'Unknown']??=[]).push(s)&&o,{});
 Object.entries(byState).forEach(([state,arr])=>{
   if(arr.length<8)return;
   const lat=arr.reduce((a,s)=>a+s.lat,0)/arr.length;
   const lng=arr.reduce((a,s)=>a+s.lng,0)/arr.length;
   push(lat,lng,arr[0]?.city||'',state,`${state} gap center`,'state-centroid');
 });

 const byMgr=gaps.reduce((o,s)=>{
   const m=v7OrgForStore(s).areaManager||'Unaligned';
   (o[m]??=[]).push(s);return o;
 },{});
 Object.entries(byMgr).forEach(([mgr,arr])=>{
   if(arr.length<10)return;
   const lat=arr.reduce((a,s)=>a+s.lat,0)/arr.length;
   const lng=arr.reduce((a,s)=>a+s.lng,0)/arr.length;
   push(lat,lng,arr[0]?.city||'',arr[0]?.state||'',`${mgr} gap center`,'manager-centroid');
 });

 return candidates;
}

function v710EvaluateCandidate(candidate,placements,currentState){
 const radius=Number($('radius')?.value||75);
 let netNew=0,backup=0,totalInRadius=0;
 const newlyCovered=[];
 const backupStores=[];

 for(const s of stores){
   const dist=hav(s.lat,s.lng,candidate.lat,candidate.lng);
   if(dist>radius)continue;
   totalInRadius++;
   const sid=String(s.siteId);
   const count=currentState.counts.get(sid)||0;
   if(count===0){netNew++;newlyCovered.push(s)}
   else if(count===1){backup++;backupStores.push(s)}
 }

 const totalStores=stores.length||1;
 const currentGaps=totalStores-currentState.covered.size;
 const pctFootprint=netNew/totalStores*100;
 const gapCapture=currentGaps?netNew/currentGaps*100:0;

 // Portfolio score favors incremental net-new stores most strongly.
 const netNewScore=Math.min(100,netNew/45*100);
 const gapCaptureScore=Math.min(100,gapCapture/15*100);
 const backupScore=Math.min(100,backup/30*100);
 const score=Math.round(netNewScore*.65 + gapCaptureScore*.25 + backupScore*.10);

 let tier='No Recommendation';
 if(netNew>=35 && score>=72) tier='High Priority';
 else if(netNew>=25 && score>=58) tier='Strong Candidate';
 else if(netNew>=15 && score>=42) tier='Expansion Candidate';
 else if(netNew>=10 && score>=34) tier='Monitor';

 const postingMarket=v711PostingMarket(candidate);

 return {
   ...candidate,netNew,backup,totalInRadius,pctFootprint,gapCapture,score,tier,
   postingMarket,newlyCovered,backupStores
 };
}

function v710SequentialPlan(){
 const capacity=v710ProgramCapacity();
 const candidates=v710CandidateUniverse();
 const placements=[];
 let state=v710CoverageState([]);
 const baselineCovered=state.covered.size;
 const curve=[{positions:capacity.active,covered:baselineCovered,coverage:stores.length?baselineCovered/stores.length*100:0,incremental:0}];

 for(let slot=1;slot<=capacity.remaining;slot++){
   let best=null;

   for(const c of candidates){
     if(placements.some(p=>hav(p.lat,p.lng,c.lat,c.lng)<30))continue; // suppress only strongly overlapping proposed hires
     const q=v710EvaluateCandidate(c,placements,state);
     if(!best || q.score>best.score || (q.score===best.score && q.netNew>best.netNew))best=q;
   }

   // Stop if the next available position no longer produces a competitive return.
   if(!best || !['High Priority','Strong Candidate','Expansion Candidate'].includes(best.tier))break;

   placements.push({...best,rank:placements.length+1});
   state=v710CoverageState(placements);
   const covered=state.covered.size;
   curve.push({
     positions:capacity.active+placements.length,
     covered,
     coverage:stores.length?covered/stores.length*100:0,
     incremental:covered-curve[curve.length-1].covered
   });
 }

 return {
   capacity,
   baselineCovered,
   baselineCoverage:stores.length?baselineCovered/stores.length*100:0,
   placements,
   curve,
   finalCovered:curve.at(-1)?.covered||baselineCovered,
   finalCoverage:curve.at(-1)?.coverage||0
 };
}
window.v710SequentialPlan=v710SequentialPlan;


function v712DisambiguatePostingMarkets(placements){
 const groups=new Map();
 placements.forEach(p=>{
   const label=p.postingMarket?.label||`${p.city||p.label}, ${p.state||''}`;
   if(!groups.has(label))groups.set(label,[]);
   groups.get(label).push(p);
 });
 for(const [label,group] of groups){
   if(group.length<2)continue;
   group.sort((a,b)=>(a.postingMarket?.distance??999)-(b.postingMarket?.distance??999));
   for(const p of group.slice(1)){
     const counts=new Map();
     stores.filter(s=>s.city&&hav(p.lat,p.lng,s.lat,s.lng)<=30).forEach(s=>{
       const key=`${s.city}|${s.state||''}`;
       counts.set(key,(counts.get(key)||0)+1);
     });
     const alt=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).find(k=>{
       const [c,st]=k.split('|'); return `${c}, ${st}`!==label;
     });
     if(alt){
       const [city,state]=alt.split('|');
       p.postingMarket={city,state,label:`${city}, ${state}`,distance:0,source:'local-market-disambiguated'};
     }else{
       p.postingMarket={...(p.postingMarket||{}),label:`${p.city||p.label}, ${p.state||''}`,source:'coverage-center-disambiguated'};
     }
   }
 }
 return placements;
}
function v710ExportSequentialPlan(){
 const plan=window._v710Plan||v714CachedSequentialPlan();
 const rows=plan.placements.map(p=>({
   Rank:p.rank,
   PostingMarket:p.postingMarket?.label||'',
   PostingMarketDistanceMiles:p.postingMarket?.distance?Number(p.postingMarket.distance.toFixed(1)):0,
   CoverageCenterCity:p.city,
   CoverageCenterState:p.state,
   Source:p.source,
   PositionValue:p.score,
   Tier:p.tier,
   IncrementalNetNew:p.netNew,
   BackupCoverageGained:p.backup,
   GapCapturePct:Number(p.gapCapture.toFixed(1)),
   Latitude:Number(p.lat.toFixed(5)),
   Longitude:Number(p.lng.toFixed(5))
 }));
 csv(rows,`${ACTIVE_PROGRAM_ID}_sequential_position_plan.csv`);
}
window.v710ExportSequentialPlan=v710ExportSequentialPlan;

function v710SimulatePortfolioPlacement(rank){
 const plan=window._v710Plan;
 const p=plan?.placements?.find(x=>x.rank===rank);
 if(!p)return;
 $('modal')?.classList.remove('show');
 simulateAt(p.lat,p.lng);
 map.flyTo([p.lat,p.lng],8,{duration:.4});
}
window.v710SimulatePortfolioPlacement=v710SimulatePortfolioPlacement;

function networkOptimizer(){
 const plan=v714CachedSequentialPlan();
 v712DisambiguatePostingMarkets(plan.placements);
 window._v710Plan=plan;
 const c=plan.capacity;

 const placementRows=plan.placements.length
   ? plan.placements.map(p=>`<tr class="v76-drill-row" onclick="window.v710SimulatePortfolioPlacement(${p.rank})">
      <td>${p.rank}</td>
      <td><b>${esc(p.postingMarket?.label||p.city||p.label)}</b><br><small>Recommended RTS recruiting/home market${p.postingMarket?.distance?` · ${p.postingMarket.distance.toFixed(0)} mi from modeled center`:''}</small><br><small class="v711-coverage-center">Modeled 75-mi coverage center: ${esc(p.city||p.label)}, ${esc(p.state||'')} · ${esc(p.source)}</small></td>
      <td>${p.score}/100<br><small>${esc(p.tier)}</small></td>
      <td>+${p.netNew}</td>
      <td>+${p.backup}</td>
      <td>${p.gapCapture.toFixed(1)}%</td>
      <td>Simulate ↗</td>
     </tr>`).join('')
   : `<tr><td colspan="7"><div class="callout"><b>No additional position currently meets the competitive threshold.</b><br>The optimizer stopped rather than recommending a low-value use of authorized capacity.</div></td></tr>`;

 const curveRows=plan.curve.map((x,i)=>`<tr>
   <td>${x.positions}</td>
   <td>${x.covered.toLocaleString()}</td>
   <td>${x.coverage.toFixed(1)}%</td>
   <td>${i===0?'—':`+${x.incremental}`}</td>
 </tr>`).join('');

 const stopReason=plan.placements.length<c.remaining
   ? `The model stopped after ${plan.placements.length} additional position${plan.placements.length===1?'':'s'} because the next available candidate no longer met the Competitive threshold.`
   : `All ${c.remaining} currently available authorized positions were used by qualifying candidates.`;

 openModal('Optimize Network',`
  <div class="v6-hero"><h2>Authorized Position Portfolio</h2>
   <p>Existing RTS positions are fixed/protected. The optimizer evaluates only new positions and recalculates the network after each hypothetical placement so overlapping recommendations do not receive duplicate credit.</p>
  </div>

  <div class="v795-capacity">
   <div><small>AUTHORIZED POSITIONS</small><b>${c.cap}</b></div>
   <div><small>ACTIVE RTS</small><b>${c.active}</b></div>
   <div><small>OPEN CAPACITY</small><b>${c.remaining}</b></div>
   <div><small>QUALIFYING NEW POSITIONS</small><b>${plan.placements.length}</b><span>Model stops at diminishing value</span></div>
  </div>

  <div class="v710-summary">
   <div><small>CURRENT COVERAGE</small><b>${plan.baselineCoverage.toFixed(1)}%</b><span>${plan.baselineCovered.toLocaleString()} stores</span></div>
   <div><small>PROJECTED COVERAGE</small><b>${plan.finalCoverage.toFixed(1)}%</b><span>${plan.finalCovered.toLocaleString()} stores</span></div>
   <div><small>NET IMPROVEMENT</small><b>+${(plan.finalCovered-plan.baselineCovered).toLocaleString()}</b><span>incrementally covered stores</span></div>
  </div>

  <div class="callout"><b>How ranking works:</b> Candidate #1 is evaluated against the current RTS network. After it is hypothetically added, Candidate #2 is recalculated against that expanded network, and so on. The portfolio now includes <b>High Priority</b>, <b>Strong Candidate</b>, and <b>Expansion Candidate</b> opportunities so you can see a broader path toward authorized headcount. The modeled coverage center remains mathematically precise, while the displayed RTS market stays operationally close to that center: normally within 25 miles, and only selectively out to 40 miles. Duplicate metro labels are split into more local markets.</div>

  <div class="v4-two">
   <div class="v4-panel"><h3>Sequential placement plan</h3>
    <div class="tablewrap"><table><thead><tr><th>#</th><th>Recommended RTS Market</th><th>Position Value</th><th>Net-new</th><th>Backup</th><th>Remaining-gap share</th><th></th></tr></thead><tbody>${placementRows}</tbody></table></div>
   </div>
   <div class="v4-panel"><h3>Marginal coverage curve</h3>
    <div class="tablewrap"><table><thead><tr><th>Total Positions</th><th>Covered Stores</th><th>Coverage</th><th>Incremental Gain</th></tr></thead><tbody>${curveRows}</tbody></table></div>
    <div class="callout">${esc(stopReason)}</div>
   </div>
  </div>

  <div class="actions">
   <button class="btn primary" onclick="window.v710ExportSequentialPlan()">Export Position Plan</button>
   ${plan.placements[0]?`<button class="btn" onclick="window.v710SimulatePortfolioPlacement(1)">Simulate Top Candidate</button>`:''}
  </div>
 `);
}
function rtmDashboard(){
 const rtms=uniq(activeRTS().map(r=>r.rtm||'Not listed'));
 const options=rtms.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 openModal('RTM Dashboard',`
  <div class="tools"><label><b>Select RTM</b> <select id="s6RtmSelect">${options}</select></label><button class="btn primary" onclick="window.renderRtmDashboard()">Open Dashboard</button></div>
  <div id="s6RtmResults"></div>
 `);
 renderRtmDashboard();
}
window.renderRtmDashboard=()=>{
 const name=$('s6RtmSelect')?.value||uniq(activeRTS().map(r=>r.rtm||'Not listed'))[0];
 const rtsList=activeRTS().filter(r=>(r.rtm||'Not listed')===name);
 const ids=new Set(rtsList.map(r=>r.id));
 const scope=s6Scope();
 const model=coverageModel(scope);
 const rtmRows=territoryHealthV2(scope).filter(x=>ids.has(x.r.id));
 const coveredStores=model.storeCoverage.filter(x=>x.covering.some(r=>ids.has(r.id))).map(x=>x.store);
 const uniqueStores=model.storeCoverage.filter(x=>x.coverageType==='Unique'&&x.covering.some(r=>ids.has(r.id))).map(x=>x.store);
 const sharedStores=model.storeCoverage.filter(x=>x.coverageType==='Shared'&&x.covering.some(r=>ids.has(r.id))).map(x=>x.store);
 const gapPlan=gapClustersV2(scope,5);
 const target=$('s6RtmResults');if(!target)return;
 target.innerHTML=`
  <div class="s6-grid">
   <div class="s6-card"><small>RTS</small><b>${rtsList.length}</b><span>Assigned to ${esc(name)}</span></div>
   <div class="s6-card"><small>Stores in service radii</small><b>${new Set(coveredStores.map(s=>s.siteId)).size.toLocaleString()}</b><span>Unique store count across RTM team</span></div>
   <div class="s6-card"><small>Unique stores</small><b>${uniqueStores.length.toLocaleString()}</b><span>Only one RTS in range</span></div>
   <div class="s6-card"><small>Shared stores</small><b>${sharedStores.length.toLocaleString()}</b><span>Multiple RTS in range</span></div>
  </div>
  <div class="s6-two">
   <div class="s6-section"><h3>RTS service-area health</h3>
    ${rtmRows.map(x=>`<div class="s6-row"><span class="s6-rank">${x.score.toFixed(0)}</span><span><b>${esc(x.r.name)}</b><br>${x.count} in radius · ${x.uniqueCount} unique · ${x.sharedCount} shared</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open</button></div>`).join('')}
   </div>
   <div class="s6-section"><h3>National gap opportunities</h3>
    ${gapPlan.map(x=>`<div class="s6-row"><span class="s6-rank">${x.rank}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>${esc(x.manager)} · ${esc(x.retailer)}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}
   </div>
  </div>`;
};

window.executiveMode=executiveMode;
window.networkOptimizer=networkOptimizer;
window.multiHirePlanner=multiHirePlanner;
window.territoryHealthScores=territoryHealthScores;
window.rtmDashboard=rtmDashboard;



function v710PositionPlanningCard(){
 const p=v714CachedSequentialPlan();
 return `<div class="v4-panel"><h3>Authorized Position Outlook</h3>
   <div class="v4-grid">
    <div class="metric"><small>Active RTS</small><b>${p.capacity.active}</b></div>
    <div class="metric"><small>Open capacity</small><b>${p.capacity.remaining}</b></div>
    <div class="metric"><small>Qualifying additions</small><b>${p.placements.length}</b></div>
    <div class="metric"><small>Projected coverage</small><b>${p.finalCoverage.toFixed(1)}%</b></div>
   </div>
   <button class="btn primary" onclick="networkOptimizer()">Open Position Portfolio</button>
  </div>`;
}

function executiveDashboard(){
 const scope=currentScope();
 const model=coverageModel(scope);
 const covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const health=territoryHealthV2(scope).sort((a,b)=>b.count-a.count);
 const states=Object.values(scope.reduce((o,s)=>{
   const k=s.state||'Unknown';
   o[k]??={name:k,total:0,gaps:0};
   o[k].total++;
   if(model.gaps.some(g=>g.siteId===s.siteId))o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);

 const retailers=Object.values(scope.reduce((o,s)=>{
   const k=s.retailer||'Unknown';
   o[k]??={name:k,total:0,gaps:0};
   o[k].total++;
   if(model.gaps.some(g=>g.siteId===s.siteId))o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);

 const plan=gapClustersV2(scope,5);
 const avg=health.length?health.reduce((a,x)=>a+x.count,0)/health.length:0;

 openModal('Executive Coverage Dashboard',`
 <div class="callout"><b>Coverage Model v2:</b> RTS workload is based only on stores within the selected ${model.rad}-mile service radius. Stores outside all RTS radii are network gaps and are not assigned to the nearest RTS.</div>
 <div class="exec-grid">
  <div class="exec-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} of ${scope.length.toLocaleString()} stores</span></div>
  <div class="exec-kpi"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No RTS within ${model.rad} miles</span></div>
  <div class="exec-kpi"><small>Unique stores</small><b>${model.uniqueStores.length.toLocaleString()}</b><span>Exactly one RTS in range</span></div>
  <div class="exec-kpi"><small>Shared stores</small><b>${model.sharedStores.length.toLocaleString()}</b><span>Two or more RTS in range</span></div>
 </div>
 <div class="exec-two">
  <div class="exec-section"><h3>Highest-gap states</h3>
   ${states.slice(0,8).map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.name)}</b><br>${x.total.toLocaleString()} stores</span><span class="exec-chip ${x.gaps/x.total>.65?'risk':x.gaps/x.total>.4?'watch':'good'}">${x.gaps.toLocaleString()} gaps</span></div>`).join('')}
  </div>
  <div class="exec-section"><h3>Highest-gap retailers</h3>
   ${retailers.slice(0,8).map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.name)}</b><br>${x.total.toLocaleString()} stores</span><span class="exec-chip ${x.gaps/x.total>.65?'risk':x.gaps/x.total>.4?'watch':'good'}">${x.gaps.toLocaleString()} gaps</span></div>`).join('')}
  </div>
  <div class="exec-section"><h3>Highest active workloads</h3>
   ${health.slice(0,8).map((x,i)=>{
      const ratio=x.count/Math.max(1,avg);
      return `<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.count} in-radius stores · ${x.uniqueCount} unique<div class="workload-meter ${ratio>1.45?'high':ratio>1.15?'watch':''}"><span style="width:${Math.min(100,ratio/1.6*100)}%"></span></div></span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">${x.count}</button></div>`;
   }).join('')}
  </div>
  <div class="exec-section"><h3>Top placement opportunities</h3>
   ${plan.map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>Uncovered gap cluster</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}
  </div>
 </div>
 `);
}


/* ===== v7.14.2 Exact Store Search ===== */
function v7142StoreNumber(s){
 const raw=String(s.storeNbr??s.storeNumber??s.store??'').trim();
 if(raw)return raw.replace(/^0+/,'')||'0';
 const name=String(s.name||s.storeName||'');
 const m=name.match(/#\s*0*(\d+)/);
 return m ? (m[1].replace(/^0+/,'')||'0') : '';
}
function v7142ExactStoreMatch(query){
 const q=String(query||'').trim().replace(/^#/, '').replace(/^0+/,'')||'0';
 if(!/^\d+$/.test(q))return null;
 return stores.find(s=>v7142StoreNumber(s)===q)||null;
}
function v7142OpenStoreDirect(s){
 if(!s)return false;
 try{
   const results=$('results');
   if(results){
     results.classList.remove('show');
     results.innerHTML='';
   }
   selectedSearch=-1;

   const lat=Number(s.lat),lng=Number(s.lng);
   const marker=markerById.get(s.siteId);

   const openResolvedMarker=()=>{
     const liveMarker=markerById.get(s.siteId);
     if(!liveMarker)return false;

     // MarkerCluster requires zoomToShowLayer on the first jump. Opening the
     // popup directly while the marker is still represented by a cluster
     // silently fails; this callback fires only after the individual marker
     // is actually visible.
     if($('cluster')?.checked && clusterLayer && typeof clusterLayer.zoomToShowLayer==='function'){
       try{
         clusterLayer.zoomToShowLayer(liveMarker,()=>{
           requestAnimationFrame(()=>liveMarker.openPopup());
         });
         return true;
       }catch(err){
         console.warn('Cluster reveal fallback',err);
       }
     }

     requestAnimationFrame(()=>liveMarker.openPopup());
     return true;
   };

   if(Number.isFinite(lat)&&Number.isFinite(lng)){
     let opened=false;
     const afterMove=()=>{
       if(opened)return;
       opened=true;
       if(!openResolvedMarker() && typeof window.v6OpenStoreIntelligence==='function'){
         window.v6OpenStoreIntelligence(String(s.siteId));
       }
     };

     // Wait for the first map movement to finish before asking MarkerCluster
     // to reveal the individual store marker.
     map.once('moveend',afterMove);
     map.flyTo([lat,lng],12,{duration:.55});

     // Safety fallback for browsers where moveend is delayed/suppressed.
     setTimeout(afterMove,900);
     return true;
   }

   if(marker){
     return openResolvedMarker();
   }

   if(typeof window.v6OpenStoreIntelligence==='function'){
     window.v6OpenStoreIntelligence(String(s.siteId));
     return true;
   }
 }catch(err){
   console.error('Exact store search open failed',err);
 }
 return false;
}
window.v7142ExactStoreMatch=v7142ExactStoreMatch;
window.v7142OpenStoreDirect=v7142OpenStoreDirect;

function search(){
 const raw=$('search').value.trim(),q=raw.toLowerCase();
 selectedSearch=-1;
 if(!q){$('results').classList.remove('show');return}
 const exactStore=v7142ExactStoreMatch(raw);
 if(exactStore){
   const hit={
     type:'Store',
     obj:exactStore,
     exactStoreNumber:true,
     title:`${exactStore.retailer} #${exactStore.storeNumber||'—'}`,
     sub:`${exactStore.address?exactStore.address+' · ':''}${exactStore.city}, ${exactStore.state} ${exactStore.zip} · SiteID ${exactStore.siteId}`
   };
   $('results').innerHTML=`<div class="res v7142-exact-store-result" data-i="0"><b>Store · ${esc(hit.title)}</b><span>${esc(hit.sub)}</span></div>`;
   $('results').classList.add('show');
   $('results').firstElementChild.onclick=()=>selectHit(hit);
   $('search')._hits=[hit];
   selectedSearch=0;
   return;
 }

 // Build city/state summary results first so a city search behaves like a location search,
 // rather than simply showing the first matching store.
 const cityGroups=new Map();
 stores.forEach(s=>{
   const city=(s.city||'').trim(),state=(s.state||'').trim();
   if(!city)return;
   const label=`${city}, ${state}`;
   const cityOnly=city.toLowerCase();
   const cityState=label.toLowerCase();
   if(cityOnly.includes(q)||cityState.includes(q)){
     const key=cityState;
     if(!cityGroups.has(key))cityGroups.set(key,{city,state,stores:[]});
     cityGroups.get(key).stores.push(s);
   }
 });
 const cityHits=[...cityGroups.values()]
   .sort((a,b)=>{
     const ae=a.city.toLowerCase()===q?0:a.city.toLowerCase().startsWith(q)?1:2;
     const be=b.city.toLowerCase()===q?0:b.city.toLowerCase().startsWith(q)?1:2;
     return ae-be||b.stores.length-a.stores.length||a.city.localeCompare(b.city);
   })
   .slice(0,8)
   .map(g=>({
     type:'City',
     obj:g,
     title:`${g.city}, ${g.state}`,
     sub:`${g.stores.length.toLocaleString()} matching store${g.stores.length===1?'':'s'}`
   }));

 const rh=activeRTS()
   .filter(r=>`${r.name} ${r.email} ${r.rtm}`.toLowerCase().includes(q))
   .slice(0,8)
   .map(r=>({type:'RTS',obj:r,title:r.name,sub:r.email}));

 const sh=stores
   .filter(s=>`${s.storeNumber} ${s.siteId} ${s.retailer} ${s.address} ${s.city} ${s.state} ${s.zip} ${s.manager}`.toLowerCase().includes(q))
   .slice(0,30)
   .map(s=>({
     type:'Store',
     obj:s,
     title:`${s.retailer} #${s.storeNumber||'—'}`,
     sub:`${s.address?s.address+' · ':''}${s.city}, ${s.state} ${s.zip} · SiteID ${s.siteId}`
   }));

 const hits=[...cityHits,...rh,...sh].slice(0,40);
 $('results').innerHTML=hits.map((h,i)=>`<div class="res" data-i="${i}"><b>${h.type} · ${esc(h.title)}</b><span>${esc(h.sub)}</span></div>`).join('');
 $('results').classList.toggle('show',hits.length>0);
 [...$('results').children].forEach((e,i)=>e.onclick=()=>selectHit(hits[i]));
 $('search')._hits=hits;
}
function selectHit(h){
 if(h.type==='City'){
   const pts=h.obj.stores.map(s=>[s.lat,s.lng]);
   if(pts.length===1){
     map.flyTo(pts[0],12,{duration:.7});
     setTimeout(()=>markerById.get(h.obj.stores[0].siteId)?.openPopup(),450);
   }else if(pts.length){
     map.flyToBounds(pts,{padding:[45,45],maxZoom:11,duration:.75});
   }
 }else if(h.type==='Store'){
   v7142OpenStoreDirect(h.obj);
 }else{
   openTerritory(h.obj.id);
 }
 $('results').classList.remove('show');
}

function setDataStatus(kind,text){
 const box=$('dataStatus'),label=$('dataStatusText');
 if(!box||!label)return;
 box.classList.remove('ready','warning','error');
 if(kind)box.classList.add(kind);
 label.textContent=text;
}
function formatDataDate(value){
 if(!value)return 'date not supplied';
 const d=new Date(`${value}T00:00:00`);
 if(Number.isNaN(d.getTime()))return value;
 return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function initializeDataStatus(){
 const updated=formatDataDate(DATA_METADATA?.dataUpdated);
 const activeCount=RTS.length;
 const base=`${ACTIVE_PROGRAM.name} · Updated ${updated} · ${RAW_STORES.length.toLocaleString()} stores · ${activeCount.toLocaleString()} roster RTS`;
 if(DATA_WARNINGS?.length){
   console.warn('Data validation warnings:',DATA_WARNINGS);
   setDataStatus('warning',`${base} · data count warning`);
 }else{
   setDataStatus('ready',base);
 }
}


function v4Model(scope=filtered){
 return coverageModel(scope);
}
function v4Health(scope=filtered){
 return territoryHealthV2(scope);
}
function v4Plan(scope=filtered,limit=10){
 return gapClustersV2(scope,limit);
}
function v4ProgramLabel(){
 return ACTIVE_PROGRAM?.name || 'Current Program';
}
function currentScope(){ return (Array.isArray(filtered)&&filtered.length>=0)?filtered:stores; }
function scopeLabel(){
 const parts=[];
 const add=(label,id)=>{const v=$(id)?.value||'';if(v)parts.push(`${label}: ${v}`)};
 add('Coverage','fCoverage');add('Retailer','fRetailer');add('State','fState');
 add('Regional','fRegional');add(ACTIVE_PROGRAM_ID==='premium-merchandising'?'District':'Area/RDM','fManager');add('RTS','fRts');
 return parts.length?parts.join(' · '):'All stores';
}
function v78FocusRetailer(retailer){
 $('modal')?.classList.remove('show');
 if($('fRetailer'))$('fRetailer').value=retailer||'';
 refreshCascadingFilters({preserve:false});applyFilters();fitResults();
}
window.v78FocusRetailer=v78FocusRetailer;
function rollup(field,title){
 const scope=currentScope(),model=coverageModel(scope),gapIds=new Set(model.gaps.map(s=>String(s.siteId)));
 const rows=Object.values(scope.reduce((o,s)=>{
   let key='Not listed';
   if(field==='retailer')key=s.retailer||'Not listed';
   else if(field==='manager')key=v7OrgForStore(s).areaManager||'Not listed';
   else if(field==='regional')key=v7OrgForStore(s).regionalManager||'Unaligned';
   o[key]??={key,total:0,gaps:0,covered:0,states:new Set(),managers:new Set(),retailers:new Set()};
   const r=o[key];r.total++;
   if(gapIds.has(String(s.siteId)))r.gaps++;else r.covered++;
   if(s.state)r.states.add(s.state);if(s.retailer)r.retailers.add(s.retailer);
   const org=v7OrgForStore(s);if(org.areaManager)r.managers.add(org.areaManager);
   return o;
 },{})).map(r=>({...r,coverage:r.total?r.covered/r.total*100:0})).sort((a,b)=>b.gaps-a.gaps||b.total-a.total);
 const drill=field==='retailer'?'retailer':field==='regional'?'regional':'manager';
 openModal(title,`<div class="callout">Current scope: <b>${esc(scopeLabel())}</b>. Every row is clickable and continues into the matching map scope.</div>
 <div class="tablewrap"><table><thead><tr><th>${field==='retailer'?'Retailer':field==='regional'?'Regional Manager':'Manager'}</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>States</th><th>${field==='retailer'?'Managers':'Retailers'}</th><th></th></tr></thead><tbody>
 ${rows.map(r=>`<tr class="v78-drill-row" data-drill-type="${drill}" data-drill-value="${esc(r.key)}"><td><b>${esc(r.key)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.states.size}</td><td>${field==='retailer'?r.managers.size:r.retailers.size}</td><td>↗</td></tr>`).join('')}
 </tbody></table></div>`);
 window._v78Rollup=rows;
 return rows;
}
function v4OpenExecutive(){
 const scope=filtered;
 const model=v4Model(scope);
 const health=v4Health(scope);
 const plan=v4Plan(scope,5);
 const covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const avgWork=health.length?health.reduce((a,x)=>a+x.count,0)/health.length:0;
 const avgDrive=health.length?health.reduce((a,x)=>a+x.avgDistance,0)/health.length:0;
 const highest=[...health].sort((a,b)=>b.count-a.count)[0];
 const risk=[...health].sort((a,b)=>a.score-b.score)[0];

 openModal('Executive Dashboard',`
  <div class="v4-dashboard">
   <div class="v4-hero">
    <h1>${esc(v4ProgramLabel())}</h1>
    <p>Coverage Intelligence Platform · ${model.rad||Number($('radius').value)}-mile service radius · ${scopeLabel()}</p>
   </div>
   <div class="v4-kpi-grid">
    <div class="v4-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} of ${scope.length.toLocaleString()} stores</span></div>
    <div class="v4-kpi"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No eligible RTS in radius</span></div>
    <div class="v4-kpi"><small>Average workload</small><b>${Math.round(avgWork)}</b><span>Stores per RTS service area</span></div>
    <div class="v4-kpi"><small>Average drive</small><b>${avgDrive.toFixed(1)} mi</b><span>Across RTS service areas</span></div>
    <div class="v4-kpi"><small>Unique stores</small><b>${model.uniqueStores.length.toLocaleString()}</b><span>Exactly one eligible RTS</span></div>
    <div class="v4-kpi"><small>Shared stores</small><b>${model.sharedStores.length.toLocaleString()}</b><span>Two or more eligible RTS</span></div>
    <div class="v4-kpi"><small>Highest workload</small><b>${highest?highest.count:'—'}</b><span>${highest?esc(highest.r.name):'No RTS'}</span></div>
    <div class="v4-kpi"><small>Highest risk</small><b>${risk?risk.score.toFixed(0):'—'}</b><span>${risk?esc(risk.r.name):'No RTS'}</span></div>
   </div>
   <div class="v4-two">
    <div class="v4-panel"><h3>Top hiring opportunities</h3>
     ${plan.map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.city)}, ${esc(x.state||'')}</b><br>${esc(x.manager||'')} · ${esc(x.retailer||'')}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}
    </div>
    <div class="v4-panel"><h3>RTS workload leaders</h3>
     ${[...health].sort((a,b)=>b.count-a.count).slice(0,6).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.uniqueCount} unique · ${x.sharedCount} shared</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">${x.count}</button></div>`).join('')}
    </div>
   </div>
  </div>
 `);
}
function v4ExecutiveBrief(){
 const scope=filtered,model=v4Model(scope),health=v4Health(scope),plan=v4Plan(scope,3);
 const covered=scope.length-model.gaps.length,pct=scope.length?covered/scope.length*100:0;
 const highest=[...health].sort((a,b)=>b.count-a.count)[0];
 const risk=[...health].sort((a,b)=>a.score-b.score)[0];
 const after3=scope.length?Math.min(scope.length,covered+plan.reduce((a,x)=>a+x.gain,0))/scope.length*100:0;
 const text=`${v4ProgramLabel()} currently covers ${pct.toFixed(1)}% of the ${scope.length.toLocaleString()} stores in the selected scope, leaving ${model.gaps.length.toLocaleString()} network gaps. ${model.uniqueStores.length.toLocaleString()} stores depend on exactly one eligible RTS, while ${model.sharedStores.length.toLocaleString()} have shared coverage.

${highest?`${highest.r.name} has the highest current in-radius workload at ${highest.count} stores.`:''} ${risk?`${risk.r.name} has the lowest current coverage-health score at ${risk.score.toFixed(0)} out of 100.`:''}

The strongest modeled hiring opportunity is ${plan[0]?`${plan[0].city}, ${plan[0].state||''}, with approximately ${plan[0].gain} net-new stores`:'not available in the current scope'}. The top three modeled placements would increase projected coverage to approximately ${after3.toFixed(1)}%.

Recommended leadership action: validate the highest-value gap clusters, review high unique-dependency service areas, and confirm staffing feasibility before finalizing placement decisions.`;
 openModal('Executive Brief',`<div class="v4-brief">${esc(text)}</div><div class="actions"><button class="btn" onclick="navigator.clipboard.writeText(${JSON.stringify(text)})">Copy Brief</button><button class="btn primary" onclick="window.print()">Print / Save PDF</button></div>`);
}
function v4CompareRts(){
 const options=activeRTS().map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
 openModal('Compare RTS',`
  <div class="tools"><label>RTS A <select id="v4CmpA">${options}</select></label><label>RTS B <select id="v4CmpB">${options}</select></label><button class="btn primary" onclick="window.v4RenderCompare()">Compare</button></div>
  <div id="v4CompareResults"></div>
 `);
 const b=$('v4CmpB');if(b&&b.options.length>1)b.selectedIndex=1;
 v4RenderCompare();
}
window.v4RenderCompare=()=>{
 const aId=$('v4CmpA')?.value,bId=$('v4CmpB')?.value;
 const rows=v4Health(filtered);
 const a=rows.find(x=>String(x.r.id)===String(aId)),b=rows.find(x=>String(x.r.id)===String(bId));
 const el=$('v4CompareResults');if(!el||!a||!b)return;
 const card=x=>`<div class="v4-compare-card"><h3>${esc(x.r.name)}</h3>
  <div class="v4-score-grid">
   <div class="v4-score"><b>${x.count}</b><span>Stores in radius</span></div>
   <div class="v4-score"><b>${x.uniqueCount}</b><span>Unique</span></div>
   <div class="v4-score"><b>${x.sharedCount}</b><span>Shared</span></div>
   <div class="v4-score"><b>${x.avgDistance.toFixed(1)}</b><span>Avg miles</span></div>
   <div class="v4-score"><b>${x.farthest.toFixed(1)}</b><span>Farthest miles</span></div>
   <div class="v4-score"><b>${x.score.toFixed(0)}</b><span>Health score</span></div>
  </div></div>`;
 el.innerHTML=`<div class="v4-compare-grid">${card(a)}${card(b)}</div>`;
};
function v4CoverageTimeline(){
 const scope=filtered,model=v4Model(scope),covered=scope.length-model.gaps.length,plan=v4Plan(scope,10);
 const steps=[0,1,2,3,5,10].map(n=>{
   const gain=plan.slice(0,n).reduce((a,x)=>a+x.gain,0);
   const pct=scope.length?Math.min(scope.length,covered+gain)/scope.length*100:0;
   return {n,pct,gain};
 });
 openModal('Coverage Timeline',`
  <div class="callout">Projected coverage assumes each modeled hire covers the largest remaining uncovered cluster and that placements are added sequentially.</div>
  <div class="v4-timeline">${steps.map(x=>`<div class="v4-timeline-step"><span>${x.n===0?'Today':`+${x.n} RTS`}</span><b>${x.pct.toFixed(1)}%</b><span>${x.n?`+${x.gain.toLocaleString()} stores`:'Current network'}</span></div>`).join('')}</div>
 `);
}
function v4TerritoryReport(){
 const rows=v4Health(stores);
 openModal('Territory Report',`
  <div class="tools"><button class="btn primary" onclick="window.print()">Print / Save PDF</button><button class="btn" onclick="window.v4ExportTerritorySummary()">Export CSV</button></div>
  <div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores</th><th>Unique</th><th>Shared</th><th>Avg Miles</th><th>Farthest</th><th>Health</th></tr></thead><tbody>
  ${rows.map(x=>`<tr class="v76-drill-row" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')"><td><b>${esc(x.r.name)}</b></td><td>${x.count}</td><td>${x.uniqueCount}</td><td>${x.sharedCount}</td><td>${x.avgDistance.toFixed(1)}</td><td>${x.farthest.toFixed(1)}</td><td>${x.score.toFixed(0)} · ${esc(x.health)}</td></tr>`).join('')}
  </tbody></table></div>`);
 window._v4TerritoryRows=rows;
}
window.v4ExportTerritorySummary=()=>csv((window._v4TerritoryRows||[]).map(x=>({
 RTS:x.r.name,Email:x.r.email,StoresWithinRadius:x.count,UniqueStores:x.uniqueCount,
 SharedStores:x.sharedCount,AverageDistanceMiles:x.avgDistance.toFixed(1),
 FarthestDistanceMiles:x.farthest.toFixed(1),HealthScore:x.score.toFixed(0),Health:x.health
})),'psp_territory_summary.csv');

function v4ToggleGapHeat(enabled){
 if(enabled){
   if(heatLayer)map.removeLayer(heatLayer);
   const gaps=v4Model(stores).gaps;
   heatLayer=L.heatLayer(gaps.map(s=>[s.lat,s.lng,1]),{radius:24,blur:18,maxZoom:8}).addTo(map);
 }else if(heatLayer){map.removeLayer(heatLayer);heatLayer=null;}
}
function v4ToggleRings(enabled){
 ringLayer.clearLayers();
 if(!enabled)return;
 const rad=Number($('radius').value);
 activeRTS().forEach(r=>L.circle([r.lat,r.lng],{radius:rad*1609.344,weight:1.2,fillOpacity:.035,color:'#2563eb'}).addTo(ringLayer));
}
function v4RtsProfiles(){
 const rows=v4Health(stores);
 openModal('RTS Profiles',`
  <div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores</th><th>Unique</th><th>Shared</th><th>Avg Drive</th><th>Health</th><th></th></tr></thead><tbody>
  ${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.count}</td><td>${x.uniqueCount}</td><td>${x.sharedCount}</td><td>${x.avgDistance.toFixed(1)} mi</td><td>${x.score.toFixed(0)} · ${esc(x.health)}</td><td><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open</button></td></tr>`).join('')}
  </tbody></table></div>`);
}
window.v4OpenExecutive=v4OpenExecutive;
window.v4ExecutiveBrief=v4ExecutiveBrief;
window.v4CompareRts=v4CompareRts;
window.v4CoverageTimeline=v4CoverageTimeline;
window.v4TerritoryReport=v4TerritoryReport;
window.v4RtsProfiles=v4RtsProfiles;


const V41_SAVED_VIEWS_KEY='psp_v41_saved_views';

function v41SetSelectValue(id,value){
 const el=$(id);if(!el)return;
 [...el.options].forEach(o=>o.selected=(value==='All'?o.value==='All':o.value===value));
}
function v41CurrentViewState(){
 const selected=id=>[...($(id)?.selectedOptions||[])].map(o=>o.value);
 const center=map.getCenter();
 return {
   program:ACTIVE_PROGRAM_ID,
   filters:{
     coverage:selected('fCoverage'),
     retailer:selected('fRetailer'),
     state:selected('fState'),
     regional:selected('fRegional'),
     manager:selected('fManager'),
     rts:selected('fRts')
   },
   radius:Number($('radius')?.value||75),
   map:{lat:center.lat,lng:center.lng,zoom:map.getZoom()}
 };
}
function v41ApplyViewState(state){
 if(!state)return;
 const apply=(id,values)=>{
   const el=$(id);if(!el)return;
   const set=new Set(values||[]);
   [...el.options].forEach(o=>o.selected=set.has(o.value));
 };
 apply('fCoverage',state.filters?.coverage);
 apply('fRetailer',state.filters?.retailer);
 apply('fState',state.filters?.state);
 apply('fRegional',state.filters?.regional);
 apply('fManager',state.filters?.manager);
 apply('fRts',state.filters?.rts);
 if($('radius')&&state.radius){$('radius').value=state.radius;$('radiusLbl').textContent=state.radius}
 applyFilters();
 if(state.map)map.setView([state.map.lat,state.map.lng],state.map.zoom);
}
function v41CopyViewLink(){
 const state=v41CurrentViewState();
 const url=new URL(window.location.href);
 url.searchParams.set('program',ACTIVE_PROGRAM_ID);
 url.searchParams.set('view',btoa(unescape(encodeURIComponent(JSON.stringify(state)))));
 navigator.clipboard.writeText(url.toString()).then(()=>alert('View link copied.'));
}
function v41LoadUrlView(){
 const raw=new URLSearchParams(location.search).get('view');
 if(!raw)return;
 try{
   const state=JSON.parse(decodeURIComponent(escape(atob(raw))));
   setTimeout(()=>v41ApplyViewState(state),350);
 }catch(e){console.warn('Could not load shared view',e)}
}
function v41SavedViews(){
 const views=JSON.parse(localStorage.getItem(V41_SAVED_VIEWS_KEY)||'[]');
 openModal('Saved Views',`
  <div class="tools"><button class="btn primary" onclick="window.v41SaveCurrentView()">Save Current View</button><button class="btn" onclick="window.v41CopyViewLink()">Copy Current Link</button></div>
  <div id="v41SavedViewList">${views.length?views.map((v,i)=>`<div class="v41-view-row"><span><b>${esc(v.name)}</b><br><small>${esc(v.programName)} · ${new Date(v.savedAt).toLocaleDateString()}</small></span><button class="btn" onclick="window.v41OpenSavedView(${i})">Open</button><button class="btn" onclick="window.v41DeleteSavedView(${i})">Delete</button></div>`).join(''):'<div class="callout">No saved views yet.</div>'}</div>
 `);
}
window.v41SaveCurrentView=()=>{
 const name=prompt('Name this view:');if(!name)return;
 const views=JSON.parse(localStorage.getItem(V41_SAVED_VIEWS_KEY)||'[]');
 views.push({name,programName:v4ProgramLabel(),savedAt:new Date().toISOString(),state:v41CurrentViewState()});
 localStorage.setItem(V41_SAVED_VIEWS_KEY,JSON.stringify(views));
 v41SavedViews();
};
window.v41OpenSavedView=i=>{
 const views=JSON.parse(localStorage.getItem(V41_SAVED_VIEWS_KEY)||'[]'),v=views[i];if(!v)return;
 if(v.state.program!==ACTIVE_PROGRAM_ID){
   localStorage.setItem('psp_v41_pending_view',JSON.stringify(v.state));
   const u=new URL(location.href);u.searchParams.set('program',v.state.program);u.searchParams.delete('view');location.href=u.toString();return;
 }
 $('modal').classList.remove('show');v41ApplyViewState(v.state);
};
window.v41DeleteSavedView=i=>{
 const views=JSON.parse(localStorage.getItem(V41_SAVED_VIEWS_KEY)||'[]');views.splice(i,1);
 localStorage.setItem(V41_SAVED_VIEWS_KEY,JSON.stringify(views));v41SavedViews();
};
window.v41CopyViewLink=v41CopyViewLink;

function v41DedicatedAnalysis(){
 if(ACTIVE_PROGRAM_ID!=='one-walmart'){
   openModal('Dedicated Team Exposure','<div class="callout">Dedicated P&G, Tyson, and Unilever overlays apply to the One Walmart program. Switch the program selector to One Walmart to use this tool.</div>');return;
 }
 const radius=Number($('radius').value),allRts=activeRTS();
 const teamKeys={'P&G':'PG_WALMART','Tyson':'TYSON_WALMART','Unilever':'UNILEVER_WALMART'};
 const teams=Object.keys(teamKeys).map(team=>{
   const teamStores=filtered.filter(s=>(s.dedicatedTeams||[]).includes(team));
   const eligible=allRts.filter(r=>(r.eligibility||[]).includes(teamKeys[team]));
   let covered=0,unique=0,shared=0;
   const gaps=[];
   teamStores.forEach(s=>{
     const covering=eligible.filter(r=>hav(s.lat,s.lng,r.lat,r.lng)<=radius);
     if(!covering.length)gaps.push(s);
     else{covered++;if(covering.length===1)unique++;else shared++}
   });
   return {team,stores:teamStores.length,eligible:eligible.length,covered,gaps,unique,shared,pct:teamStores.length?covered/teamStores.length*100:0};
 });
 openModal('Dedicated Team Exposure',`
  <div class="callout">P&G, Tyson, and Unilever are evaluated against the Acosta RTS eligibility pool using the same ${radius}-mile radius. These overlays do not duplicate physical stores in the core One Walmart total.</div>
  <div class="v41-parity-grid">
   ${teams.map(x=>`<div class="v41-parity-card"><small>${esc(x.team)}</small><b>${x.pct.toFixed(1)}%</b><span>${x.covered.toLocaleString()} covered · ${x.gaps.length.toLocaleString()} gaps</span></div>`).join('')}
  </div>
  ${teams.map(x=>`<div class="v41-ded-team"><h4>${esc(x.team)}</h4><p>${x.stores.toLocaleString()} overlay stores · ${x.eligible} eligible Acosta RTS · ${x.unique} unique · ${x.shared} shared · ${x.gaps.length} gaps.</p><div style="margin-top:6px"><button class="btn" onclick="window.v41ShowDedicatedTeam('${esc(x.team)}')">Show Gaps</button><button class="btn" onclick="window.v41ExportDedicated('${esc(x.team)}')">Export</button></div></div>`).join('')}
 `);
 window._v41Dedicated=teams;
}
window.v41ShowDedicatedTeam=team=>{
 const row=(window._v41Dedicated||[]).find(x=>x.team===team);if(!row)return;
 highlightLayer.clearLayers();row.gaps.forEach(s=>L.circleMarker([s.lat,s.lng],{radius:6,color:'#dc2626',weight:2,fillOpacity:.75}).addTo(highlightLayer));
 $('modal').classList.remove('show');if(row.gaps.length)map.fitBounds(row.gaps.map(s=>[s.lat,s.lng]),{padding:[30,30]});
};
window.v41ExportDedicated=team=>{
 const row=(window._v41Dedicated||[]).find(x=>x.team===team);if(!row)return;
 csv(row.gaps.map(s=>({DedicatedTeam:team,SiteID:s.siteId,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,Manager:s.manager,Market:s.market})),'dedicated_'+team.replace(/\W+/g,'_')+'_gaps.csv');
};

function v41DedicatedGapsQuick(){
 v41DedicatedAnalysis();
}
function v41OperationalFocus(){
 const scope=filtered,model=v4Model(scope),health=v4Health(scope),plan=v4Plan(scope,3);
 const gapIds=new Set(model.gaps.map(g=>g.siteId));
 const states=Object.values(scope.reduce((o,s)=>{
   const k=s.state||'Unknown';o[k]??={state:k,total:0,gaps:0};o[k].total++;
   if(gapIds.has(s.siteId))o[k].gaps++;return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);
 const workload=[...health].sort((a,b)=>b.count-a.count)[0];
 const summary={
   scope:scopeLabel(),
   gap:states[0]?`${states[0].state} · ${states[0].gaps.toLocaleString()} gaps`:'No gaps',
   workload:workload?`${workload.r.name} · ${workload.count} stores`:'No RTS',
   hire:plan[0]?`${plan[0].city}, ${plan[0].state||''} · +${plan[0].gain}`:'No qualifying cluster',
   action:model.gaps.length?`Review ${plan[0]?.city||states[0]?.state||'largest gap'}`:'Monitor workload and resiliency'
 };
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
 set('v41FocusScope',summary.scope);set('v41FocusGap',summary.gap);
 set('v41FocusWorkload',summary.workload);set('v41FocusHire',summary.hire);set('v41FocusAction',summary.action);
 return summary;
}
function v41OperationalFocusModal(){
 v41OperationalFocus();
 const model=v4Model(filtered),plan=v4Plan(filtered,5),health=v4Health(filtered);
 openModal('Operational Focus Areas',`
  <div class="callout">This restores the leadership workflow from the prior One Walmart command center: identify the strongest current risk signal, then move directly into gap, manager, RTS, or placement review.</div>
  <div class="v41-parity-grid">
   <div class="v41-parity-card"><small>Visible stores</small><b>${filtered.length.toLocaleString()}</b></div>
   <div class="v41-parity-card"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b></div>
   <div class="v41-parity-card"><small>RTS reviewed</small><b>${health.length}</b></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>Highest-value placements</h3>${plan.map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.city)}, ${esc(x.state||'')}</b><br>${esc(x.manager||'')} · ${esc(x.retailer||'')}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}</div>
   <div class="v4-panel"><h3>Service areas to review</h3>${health.slice(0,5).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.count} stores · ${x.uniqueCount} unique · score ${x.score.toFixed(0)}</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open</button></div>`).join('')}</div>
  </div>
 `);
}
function v41Help(){
 openModal('Platform Help / Workflow Guide',`
  <div class="v41-help-grid">
   <div class="v41-help-card primary"><h4>Recommended One Walmart workflow</h4><ol><li>Search or filter by store, city, state, manager, RTS, market, ZIP, MDM ID, or SiteID.</li><li>Use Operational Focus to identify the strongest visible risk.</li><li>Open Current Gap Finder for concentrated uncovered areas.</li><li>Use Manager Rollups to confirm ownership.</li><li>Use Dedicated Team Exposure for P&G, Tyson, and Unilever.</li><li>Model new RTS placement only after validating the gap story.</li></ol></div>
   <div class="v41-help-card"><h4>Coverage rules</h4><ul><li>All RTS rows on the applicable roster count in planning.</li><li>Both programs use the selected radius, normally 75 miles.</li><li>One Walmart core stores use the combined One Walmart team.</li><li>Dedicated overlays use the Acosta RTS team.</li><li>Stores may be unique, shared, or gaps.</li></ul></div>
   <div class="v41-help-card"><h4>Preserved planning tools</h4><ul><li>Current Gap Finder</li><li>Manager Rollups</li><li>Operational Focus Areas</li><li>Dedicated Team Exposure</li><li>Model New RTS Placement</li><li>RTS Territory Profiles</li><li>Resiliency Simulator</li><li>Leadership and printable reports</li></ul></div>
   <div class="v41-help-card"><h4>Views and exports</h4><ul><li>Copy View Link preserves filters, program, radius, and map location.</li><li>Saved Views are stored in this browser.</li><li>Current gaps, visible stores, territory reports, dedicated gaps, and planning recommendations can be exported.</li></ul></div>
  </div>
 `);
}
window.v41OperationalFocusModal=v41OperationalFocusModal;
window.v41DedicatedAnalysis=v41DedicatedAnalysis;
window.v41Help=v41Help;


/* ===== Version 5 production stabilization ===== */
function managerRollups(){
  return rollup('manager','Manager Rollups');
}
function retailerRollups(){
  return rollup('retailer','Retailer Rollups');
}
function gapFinder(){
  return openGapFinder();
}
function resiliencySimulator(){
  return resiliency();
}

function v5SafeBind(id, handler, label=id){
  const element=$(id);
  if(!element)return false;
  if(typeof handler!=='function'){
    console.warn(`[V5] Tool unavailable: ${label}`);
    element.disabled=true;
    element.title=`${label} is temporarily unavailable`;
    return false;
  }
  element.onclick=(event)=>{
    try{
      return handler(event);
    }catch(error){
      console.error(`[V5] ${label} failed`,error);
      setDataStatus('warning',`${label} encountered an error`);
      openModal('Tool Error',`
        <div class="data-error-panel">
          <b>${esc(label)} could not open.</b><br><br>
          ${esc(String(error.message||error))}
          <br><br>The map and all other tools remain available.
        </div>`);
    }
  };
  return true;
}

function v5StartupDiagnostics(){
  const required={
    program:ACTIVE_PROGRAM?.name,
    stores:Array.isArray(RAW_STORES)?RAW_STORES.length:0,
    rts:Array.isArray(RTS)?RTS.length:0,
    metadata:!!DATA_METADATA,
    map:!!map
  };
  const missing=[];
  if(!required.stores)missing.push('store data');
  if(!required.rts)missing.push('RTS data');
  if(!required.metadata)missing.push('metadata');
  if(!required.map)missing.push('map');
  if(missing.length){
    throw new Error(`Startup validation failed: ${missing.join(', ')}`);
  }
  console.info('[V5] Startup diagnostics passed',required);
}

window.addEventListener('error',event=>{
  console.error('[V5] Unhandled error',event.error||event.message);
  if(document.getElementById('status')?.style.display!=='flex'){
    setDataStatus('warning','A tool error occurred; core map remains available');
  }
});
window.addEventListener('unhandledrejection',event=>{
  console.error('[V5] Unhandled promise rejection',event.reason);
  setDataStatus('warning','A background task encountered an error');
});


/* ===== Version 6 Intelligence Workspaces ===== */
function v6ScopeModel(){return v4Model(filtered)}
function v6StateRows(){
 const model=v6ScopeModel();
 const gapIds=new Set(model.gaps.map(s=>s.siteId));
 return Object.values(filtered.reduce((o,s)=>{
   const key=s.state||'Unknown';
   o[key]??={name:key,total:0,covered:0,gaps:0,unique:0,shared:0,managers:new Set(),retailers:new Set()};
   const row=o[key];row.total++;
   if(gapIds.has(s.siteId))row.gaps++;else row.covered++;
   if(s.coverageType==='Unique')row.unique++;
   if(s.coverageType==='Shared')row.shared++;
   const area=v7OrgForStore(s).areaManager;if(area)row.managers.add(area);
   if(s.retailer)row.retailers.add(s.retailer);
   return o;
 },{})).map(r=>({...r,managerCount:r.managers.size,retailerCount:r.retailers.size,coverage:r.total?r.covered/r.total*100:0}))
   .sort((a,b)=>b.gaps-a.gaps||b.total-a.total);
}
function v6OpenStateIntelligence(){
 const rows=v6StateRows();
 openModal('State / Territory Intelligence',`
  <div class="callout">This view treats gaps as a network condition, not an RTS-owned problem. Select a state to move directly into its stores, gaps, managers, and placement opportunities.</div>
  <div class="tablewrap"><table><thead><tr><th>State</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>Unique</th><th>Shared</th><th>Managers</th><th>Retailers</th><th></th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="v78-drill-row" data-drill-type="state" data-drill-value="${esc(r.name)}"><td><b>${esc(r.name)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.unique}</td><td>${r.shared}</td><td>${r.managerCount}</td><td>${r.retailerCount}</td><td>↗</td></tr>`).join('')}
  </tbody></table></div>`);
}
window.v6FocusState=state=>{
 const el=$('fState');if(el){[...el.options].forEach(o=>o.selected=o.value===state);applyFilters()}
 $('modal').classList.remove('show');fitResults();
};

function v6ManagerRows(){
 const model=v6ScopeModel(),gapIds=new Set(model.gaps.map(s=>s.siteId));
 return Object.values(filtered.reduce((o,s)=>{
   const org=v7OrgForStore(s),key=org.areaManager||'Not listed';
   o[key]??={name:key,regionalManager:org.regionalManager,total:0,covered:0,gaps:0,unique:0,shared:0,states:new Set(),retailers:new Set()};
   const row=o[key];row.total++;
   if(gapIds.has(s.siteId))row.gaps++;else row.covered++;
   if(s.coverageType==='Unique')row.unique++;
   if(s.coverageType==='Shared')row.shared++;
   if(s.state)row.states.add(s.state);
   if(s.retailer)row.retailers.add(s.retailer);
   return o;
 },{})).map(r=>({...r,coverage:r.total?r.covered/r.total*100:0,stateCount:r.states.size,retailerCount:r.retailers.size}))
   .sort((a,b)=>b.gaps-a.gaps||b.total-a.total);
}

function v793ManagerRows(scope=stores){
 const model=v4Model(scope),gapIds=new Set(model.gaps.map(s=>s.siteId));
 const grouped={};
 for(const s of scope){
   const org=v7OrgForStore(s);
   const raw=org.areaManager||'Not listed';
   const key=v7145ManagerKey(raw)||raw.toLowerCase();
   grouped[key]??={
     key,
     name:v7145PreferredManagerName(raw),
     regionalManager:org.regionalManager||'Unaligned',
     total:0,covered:0,gaps:0,unique:0,shared:0,
     states:new Set(),retailers:new Set()
   };
   const row=grouped[key];
   if(row.name==='Not listed' && raw!=='Not listed')row.name=v7145PreferredManagerName(raw);
   row.total++;
   if(gapIds.has(s.siteId))row.gaps++;else row.covered++;
   if(s.coverageType==='Unique')row.unique++;
   if(s.coverageType==='Shared')row.shared++;
   if(s.state)row.states.add(s.state);
   if(s.retailer)row.retailers.add(s.retailer);
 }
 return Object.values(grouped)
   .map(r=>({...r,coverage:r.total?r.covered/r.total*100:0,stateCount:r.states.size,retailerCount:r.retailers.size}))
   .sort((a,b)=>a.name.localeCompare(b.name));
}
function v793RegionalRows(scope=stores){
 const model=v4Model(scope),gapIds=new Set(model.gaps.map(s=>s.siteId));
 const grouped={};
 for(const s of scope){
   const org=v7OrgForStore(s);
   const raw=org.regionalManager||'Unaligned';
   const key=v7145ManagerKey(raw)||raw.toLowerCase();
   grouped[key]??={key,name:v7145PreferredManagerName(raw),total:0,covered:0,gaps:0,managers:new Map(),states:new Set(),retailers:new Set()};
   const row=grouped[key];
   row.total++;
   if(gapIds.has(s.siteId))row.gaps++;else row.covered++;
   if(org.areaManager){
     const mk=v7145ManagerKey(org.areaManager);
     row.managers.set(mk,v7145PreferredManagerName(org.areaManager));
   }
   if(s.state)row.states.add(s.state);
   if(s.retailer)row.retailers.add(s.retailer);
 }
 return Object.values(grouped)
   .map(r=>({...r,coverage:r.total?r.covered/r.total*100:0,managerCount:r.managers.size,stateCount:r.states.size,retailerCount:r.retailers.size}))
   .sort((a,b)=>a.name.localeCompare(b.name));
}
function v793OpenRegionalProfileToken(token){window.v793OpenRegionalProfile(decodeURIComponent(token))}
function v793OpenManagerProfileToken(token){window.v79OpenManagerWorkspace(decodeURIComponent(token))}
window.v793OpenRegionalProfileToken=v793OpenRegionalProfileToken;
window.v793OpenManagerProfileToken=v793OpenManagerProfileToken;

function v713PortfolioPlan(){
 const plan=v714CachedSequentialPlan();
 v712DisambiguatePostingMarkets(plan.placements);
 window._v710Plan=plan;
 return plan;
}
function v713CandidateScopeImpact(p,scope){
 const radius=Number($('radius')?.value||75);
 const baseline=v4Model(scope), gapIds=new Set(baseline.gaps.map(s=>String(s.siteId)));
 const gained=scope.filter(s=>gapIds.has(String(s.siteId)) && hav(s.lat,s.lng,p.lat,p.lng)<=radius);
 const beforeCovered=scope.length-baseline.gaps.length, afterCovered=beforeCovered+gained.length;
 const managers=new Map();
 gained.forEach(s=>{const o=v7OrgForStore(s),n=o.areaManager||s.manager||'Not listed';managers.set(n,(managers.get(n)||0)+1)});
 return {gain:gained.length,gained,beforeCovered,afterCovered,beforePct:scope.length?beforeCovered/scope.length*100:0,afterPct:scope.length?afterCovered/scope.length*100:0,pointGain:scope.length?gained.length/scope.length*100:0,gapCapture:baseline.gaps.length?gained.length/baseline.gaps.length*100:0,managers:[...managers.entries()].sort((a,b)=>b[1]-a[1])};
}
function v713ScopePortfolioOpportunities(scope,limit=6){
 return v713PortfolioPlan().placements.map(p=>({...p,scopeImpact:v713CandidateScopeImpact(p,scope)}))
  .filter(p=>p.scopeImpact.gain>0)
  .sort((a,b)=>b.scopeImpact.gain-a.scopeImpact.gain||b.scopeImpact.pointGain-a.scopeImpact.pointGain||a.rank-b.rank)
  .slice(0,limit);
}
function v713OpportunityRows(scope,limit=6,kind='manager'){
 const rows=v713ScopePortfolioOpportunities(scope,limit);
 if(!rows.length)return `<div class="callout"><b>No qualifying portfolio placement currently improves this ${kind} footprint.</b><br>Smaller local gaps remain available in Gap and Simulation tools, but the authorized-position optimizer does not currently surface a staffing candidate that reaches this scope.</div>`;
 return rows.map((p,i)=>{const q=p.scopeImpact, mgr=q.managers.slice(0,3).map(([n,c])=>`${n} +${c}`).join(' · ');return `<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(p.postingMarket?.label||`${p.city}, ${p.state||''}`)}</b><br>${esc(p.tier)} · Portfolio #${p.rank} · +${p.netNew} network net-new · <b>+${q.gain} in this ${kind}</b> · ${q.beforePct.toFixed(1)}% → ${q.afterPct.toFixed(1)}% (+${q.pointGain.toFixed(1)} pts)<br><small>Modeled 75-mi center: ${esc(p.city||p.label)}, ${esc(p.state||'')}${mgr?` · Manager benefit: ${esc(mgr)}`:''}</small></span><button class="btn" onclick="window.v710SimulatePortfolioPlacement(${p.rank})">Simulate</button></div>`}).join('');
}
function v793OpenRegionalProfile(name){
 const scope=stores.filter(s=>v7OrgForStore(s).regionalManager===name);
 if(!scope.length){openModal('Regional Manager Intelligence',`<div class="callout">No stores were found for ${esc(name)}.</div>`);return}
 const model=v4Model(scope),covered=scope.length-model.gaps.length,pct=covered/scope.length*100;
 const mgrs=v793ManagerRows(scope);
 const opportunities=v713ScopePortfolioOpportunities(scope,8);
 const managerImpact=new Map();
 opportunities.forEach(p=>p.scopeImpact.managers.forEach(([m,c])=>managerImpact.set(m,Math.max(managerImpact.get(m)||0,c))));
 openModal('Regional Manager Intelligence',`
  <div class="v6-hero"><h2>${esc(name)}</h2><p>Regional Manager · ${mgrs.length} ${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers / RDMs'} · portfolio candidates may sit outside the region when their 75-mi radius materially improves stores inside it</p></div>
  <div class="v6-kpi-grid">
   <div class="v6-kpi"><small>Stores</small><b>${scope.length}</b></div>
   <div class="v6-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered} covered</span></div>
   <div class="v6-kpi"><small>Gaps</small><b>${model.gaps.length}</b></div>
   <div class="v6-kpi"><small>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers / RDMs'}</small><b>${mgrs.length}</b></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers / RDMs'}</h3>
    ${mgrs.sort((a,b)=>b.gaps-a.gaps).map((m,i)=>`<div class="v793-manager-row"><span class="v4-rank">${i+1}</span><button class="v793-text-link" onclick="window.v793OpenManagerProfileToken('${encodeURIComponent(m.name)}')"><b>${esc(m.name)}</b><br><small>${m.total} stores · ${m.coverage.toFixed(1)}% coverage · ${m.gaps} gaps${managerImpact.get(m.name)?` · best portfolio candidate +${managerImpact.get(m.name)}`:''}</small></button></div>`).join('')}
   </div>
   <div class="v4-panel"><h3>Portfolio opportunities affecting this region</h3>${v713OpportunityRows(scope,8,'region')}</div>
  </div>
  <div class="callout"><b>Cross-boundary rule:</b> RTS coverage is evaluated by the 75-mile service radius, not by management boundaries. A portfolio candidate can therefore appear here even when its modeled center is outside ${esc(name)}'s region, provided it materially improves stores inside the region.</div>
  <div class="actions"><button class="btn primary" onclick="window.v793ApplyRegionalScope('${encodeURIComponent(name)}')">View Region on Map</button></div>`);
}
window.v793OpenRegionalProfile=v793OpenRegionalProfile;
window.v793ApplyRegionalScope=function(token){
 const name=decodeURIComponent(token),el=$('fRegional');
 if(el){el.value=name;refreshCascadingFilters({preserve:true});applyFilters();}
 $('modal')?.classList.remove('show');fitResults();
};

function v714RenderRowsChunked(targetId,rows,renderer,chunkSize=30){
 const target=$(targetId); if(!target)return;
 target.innerHTML='';
 let i=0;
 const step=()=>{
   const frag=document.createDocumentFragment();
   const end=Math.min(i+chunkSize,rows.length);
   for(;i<end;i++){
     const wrap=document.createElement('tbody');
     wrap.innerHTML=renderer(rows[i]);
     if(wrap.firstElementChild)frag.appendChild(wrap.firstElementChild);
   }
   target.appendChild(frag);
   if(i<rows.length)requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}

function v6OpenManagerIntelligence(){
 const regionalRows=v714RegionalRowsCached();
 const managerRows=v714ManagerRowsCached();

 openModal('Manager Intelligence',`
  <div class="v6-hero"><h2>Manager Intelligence</h2><p>Browse the full organization without setting a map filter first. Profiles load on demand so the national list stays fast.</p></div>
  <div class="v793-tabs">
   <button id="v793RegionalTab" class="btn primary" onclick="window.v793ShowManagerTab('regional')">Regional Managers</button>
   <button id="v793DistrictTab" class="btn" onclick="window.v793ShowManagerTab('district')">${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers / RDMs'}</button>
  </div>
  <div id="v793RegionalPanel" class="tablewrap"><table><thead><tr><th>Regional Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>Managers</th><th>States</th><th></th></tr></thead><tbody id="v714RegionalBody"><tr><td colspan="7">Loading manager rows…</td></tr></tbody></table></div>
  <div id="v793DistrictPanel" class="tablewrap" style="display:none"><table><thead><tr><th>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager / RDM'}</th><th>Regional Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>States</th><th>Retailers</th><th></th></tr></thead><tbody id="v714ManagerBody"><tr><td colspan="8">Loading manager rows…</td></tr></tbody></table></div>
 `);

 v714RenderRowsChunked('v714RegionalBody',regionalRows,r=>`<tr class="v793-click-row v714-manager-drill" data-drill-type="regional" data-drill-token="${encodeURIComponent(r.name)}"><td><b class="v714-link-name">${esc(r.name)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.managerCount}</td><td>${r.stateCount}</td><td>↗</td></tr>`);
 v714RenderRowsChunked('v714ManagerBody',managerRows,r=>`<tr class="v793-click-row v714-manager-drill" data-drill-type="manager" data-drill-token="${encodeURIComponent(r.name)}"><td><b class="v714-link-name">${esc(r.name)}</b></td><td>${esc(r.regionalManager)}</td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.stateCount}</td><td>${r.retailerCount}</td><td>↗</td></tr>`);
 const modalEl=$('modal');
 if(modalEl && !modalEl.dataset.v714ManagerDelegation){
   modalEl.dataset.v714ManagerDelegation='1';
   modalEl.addEventListener('click',event=>{
     const row=event.target.closest('.v714-manager-drill');
     if(!row || !modalEl.contains(row))return;
     const token=row.dataset.drillToken;
     const type=row.dataset.drillType;
     if(!token)return;
     event.preventDefault();
     event.stopPropagation();
     if(type==='regional'){
       window.v793OpenRegionalProfileToken(token);
     }else if(type==='manager'){
       window.v793OpenManagerProfileToken(token);
     }
   });
 }

}

window.v793ShowManagerTab=function(tab){
 const regional=$('v793RegionalPanel'),district=$('v793DistrictPanel'),rt=$('v793RegionalTab'),dt=$('v793DistrictTab');
 const isRegional=tab==='regional';
 if(regional)regional.style.display=isRegional?'block':'none';
 if(district)district.style.display=isRegional?'none':'block';
 rt?.classList.toggle('primary',isRegional);dt?.classList.toggle('primary',!isRegional);
};

window.v6FocusManager=name=>{
 const el=$('fManager');if(el){[...el.options].forEach(o=>o.selected=o.value===name);applyFilters()}
 $('modal').classList.remove('show');fitResults();
};

function v6OpenStoreIntelligence(siteId){
 const s=stores.find(x=>String(x.siteId)===String(siteId));if(!s)return;
 const radius=Number($('radius').value),eligible=activeRTS().filter(r=>PROGRAM_ELIGIBILITY(s,r));
 const ranked=eligible.map(r=>({...r,distance:hav(s.lat,s.lng,r.lat,r.lng)})).sort((a,b)=>a.distance-b.distance);
 const inside=ranked.filter(r=>r.distance<=radius);
 const nearby=stores.filter(x=>x.siteId!==s.siteId&&hav(s.lat,s.lng,x.lat,x.lng)<=25).sort((a,b)=>hav(s.lat,s.lng,a.lat,a.lng)-hav(s.lat,s.lng,b.lat,b.lng));
 openModal('Store Intelligence',`
  <div class="v6-hero"><h2>${esc(s.retailer||s.storeName||'Store')} #${esc(s.storeNumber||'—')}</h2><p>${esc(s.address||'Address unavailable')} · ${esc(s.city)}, ${esc(s.state)} ${esc(s.zip)}</p></div>
  <div class="v6-kpi-grid">
   <div class="v6-kpi"><small>Coverage Type</small><b>${esc(s.coverageType||'Gap')}</b><span>${inside.length} eligible RTS inside ${radius} miles</span></div>
   <div class="v6-kpi"><small>Nearest RTS</small><b>${ranked[0]?esc(ranked[0].name):'None'}</b><span>${ranked[0]?ranked[0].distance.toFixed(1)+' miles':'No eligible RTS'}</span></div>
   <div class="v6-kpi"><small>Backup RTS</small><b>${inside[1]?esc(inside[1].name):'None'}</b><span>${inside[1]?inside[1].distance.toFixed(1)+' miles':'No second RTS in radius'}</span></div>
   <div class="v6-kpi"><small>Nearby Stores</small><b>${nearby.length}</b><span>Other stores within 25 miles</span></div>
   <div class="v6-kpi"><small>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager / RDM'}</small><b class="v78-inline-link" role="button" tabindex="0" onclick="window.v791OpenManagerToken('${v791ManagerToken(v7OrgForStore(s).areaManager||s.manager||'Not listed')}')">${esc(v7OrgForStore(s).areaManager||s.manager||'Not listed')}</b><span>${v7OrgForStore(s).regionalManager?`Regional: ${esc(v7OrgForStore(s).regionalManager)}`:esc(s.market||'Hierarchy not listed')}</span></div>
   <div class="v6-kpi"><small>Team Exposure</small><b>${esc((s.dedicatedTeams||[]).join(', ')||'Core')}</b><span>${esc(v4ProgramLabel())}</span></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>Eligible RTS ranking</h3>${ranked.slice(0,8).map((r,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(r.name)}</b><br>${esc(r.email||'')}</span><span>${r.distance.toFixed(1)} mi</span></div>`).join('')}</div>
   <div class="v4-panel"><h3>Nearby store concentration</h3>${nearby.slice(0,8).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.retailer)} #${esc(x.storeNumber)}</b><br>${esc(x.city)}, ${esc(x.state)}</span><span>${hav(s.lat,s.lng,x.lat,x.lng).toFixed(1)} mi</span></div>`).join('')||'<div class="callout">No nearby stores within 25 miles.</div>'}</div>
  </div>
  <div class="actions"><button class="btn primary" onclick="window.simulateAt(${s.lat},${s.lng});document.getElementById('modal').classList.remove('show')">Simulate RTS Here</button><button class="btn" onclick="window.v791OpenManagerToken('${v791ManagerToken(v7OrgForStore(s).areaManager||s.manager||'Not listed')}')">Open Manager</button></div>`);
}
window.v6OpenStoreIntelligence=v6OpenStoreIntelligence;


/* ===== v7.9.1 safe manager action tokens ===== */
function v791ManagerToken(value){
 try{return btoa(unescape(encodeURIComponent(String(value||''))))}catch(_){return ''}
}
function v791ManagerFromToken(token){
 try{return decodeURIComponent(escape(atob(String(token||''))))}catch(_){return ''}
}
window.v791OpenManagerToken=function(token){return window.v79OpenManagerWorkspace(v791ManagerFromToken(token))};
window.v791ApplyManagerToken=function(token){return window.v79ApplyManagerScope(v791ManagerFromToken(token))};
window.v791ShowManagerGapsToken=function(token){return window.v79ShowManagerGaps(v791ManagerFromToken(token))};

/* ===== v7.9 Manager Coverage & Placement Intelligence ===== */

function v714CandidateImpactForScope(scopeKey,scope){
 const key=`${v714CoverageVersionKey()}|${scopeKey}`;
 if(V714_CACHE.candidateImpact.has(key))return V714_CACHE.candidateImpact.get(key);

 const plan=v714CachedSequentialPlan();
 const radius=Number($('radius')?.value||75);
 const currentCovered=scope.filter(s=>s.covered).length;

 const impacts=plan.placements.map(p=>{
   const newly=scope.filter(s=>!s.covered && hav(s.lat,s.lng,p.lat,p.lng)<=radius);
   const allReached=scope.filter(s=>hav(s.lat,s.lng,p.lat,p.lng)<=radius);
   const projected=currentCovered+newly.length;
   return {
     ...p,
     scopeNetNew:newly.length,
     scopeReached:allReached.length,
     currentCoverage:scope.length?currentCovered/scope.length*100:0,
     projectedCoverage:scope.length?projected/scope.length*100:0,
     coveragePointGain:scope.length?newly.length/scope.length*100:0
   };
 }).filter(x=>x.scopeNetNew>0)
   .sort((a,b)=>b.scopeNetNew-a.scopeNetNew||b.score-a.score);

 V714_CACHE.candidateImpact.set(key,impacts);
 return impacts;
}

function v79ManagerScope(name){
 const target=v7145ManagerKey(name);
 return stores.filter(s=>{
   const org=v7OrgForStore(s);
   return v7145ManagerKey(org.areaManager||s.manager||'Not listed')===target;
 });
}
function v795PositionCapacity(){
 const cap=100;
 const active=(RTS||[]).filter(r=>r.active!==false).length;
 return {cap,active,remaining:Math.max(0,cap-active)};
}
function v795CandidateScore(x,scope){
 const gain=Number(x.gain||0), total=scope.length||1;
 const currentGaps=scope.filter(s=>!s.covered).length||1;
 const pctGain=gain/total*100;
 const gapCapture=gain/currentGaps*100;

 // Score rewards meaningful incremental coverage and concentration.
 // Existing RTS locations are fixed/protected and are never evaluated for relocation.
 const netNewScore=Math.min(100,gain/40*100);
 const footprintScore=Math.min(100,pctGain/30*100);
 const gapScore=Math.min(100,gapCapture/40*100);
 const score=Math.round(netNewScore*.50 + footprintScore*.25 + gapScore*.25);

 return {gain,pctGain,gapCapture,score};
}

function v795CapacitySummaryHTML(){
 const c=v795PositionCapacity();
 return `<div class="v795-capacity">
   <div><small>AUTHORIZED POSITIONS</small><b>${c.cap}</b></div>
   <div><small>ACTIVE RTS</small><b>${c.active}</b></div>
   <div><small>REMAINING CAPACITY</small><b>${c.remaining}</b></div>
   <div><small>PLANNING RULE</small><b>Existing roster protected</b><span>New positions only</span></div>
 </div>`;
}
window.v795CapacitySummaryHTML=v795CapacitySummaryHTML;
function v79ManagerPlacementPlan(scope,limit=6){
 const capacity=v795PositionCapacity();
 if(capacity.remaining<=0)return [];

 const base=v4Plan(scope,Math.max(limit*5,20));
 return base.map(x=>{
   const q=v795CandidateScore(x,scope);
   let tier='No Recommendation';
   let reason='Positive coverage impact, but not enough value to justify using a limited future RTS position.';

   // Hard gates prevent mathematically-positive but operationally weak recommendations.
   if(q.gain>=35 && q.pctGain>=20 && q.gapCapture>=25 && q.score>=75){
     tier='High Priority';
     reason='Large, concentrated uncovered-store impact makes this a competitive use of remaining authorized RTS capacity.';
   }else if(q.gain>=25 && q.pctGain>=15 && q.gapCapture>=20 && q.score>=60){
     tier='Competitive';
     reason='Meaningful concentrated coverage improvement. Validate against other open-position candidates before staffing.';
   }else if(q.gain>=20 && q.score>=45){
     tier='Monitor';
     reason='Useful improvement, but not currently strong enough to recommend consuming an authorized position.';
   }
   return {...x,...q,tier,reason};
 }).filter(x=>x.tier==='High Priority'||x.tier==='Competitive').sort((a,b)=>b.score-a.score||b.gain-a.gain).slice(0,Math.min(limit,capacity.remaining));
}
window.v79OpenManagerWorkspace=function(name){
 const scope=v79ManagerScope(name);
 if(!scope.length){openModal('Manager Intelligence',`<div class="callout">No stores were found for ${esc(name)}.</div>`);return}
 const model=v4Model(scope),covered=scope.length-model.gaps.length,pct=covered/scope.length*100;
 const orgs=scope.map(v7OrgForStore),regional=orgs.find(x=>x.regionalManager)?.regionalManager||'Unaligned';
 const states=[...new Set(scope.map(s=>s.state).filter(Boolean))].sort();
 const retailers=[...new Set(scope.map(s=>s.retailer).filter(Boolean))].sort();
 const rtsStats=activeRTS().map(r=>{
   const ds=scope.map(s=>({s,d:hav(s.lat,s.lng,r.lat,r.lng)})).filter(x=>x.d<=Number($('radius').value));
   return {r,count:ds.length,unique:ds.filter(x=>scope.filter(t=>hav(t.lat,t.lng,x.s.lat,x.s.lng)<0.01).length).length};
 }).filter(x=>x.count).sort((a,b)=>b.count-a.count);
 const placementHtml=v713OpportunityRows(scope,6,'manager');
 openModal('Manager Coverage & Placement Intelligence',`
  <div class="v6-hero"><h2>${esc(name)}</h2><p>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager / RDM'} · Regional Manager: <button class="v79-inline-hierarchy-link" onclick="window.v7146OpenRegionalToken('${encodeURIComponent(regional)}')">${esc(regional)}</button> · ${states.join(', ')}</p></div>
  <div class="v6-kpi-grid">
   <div class="v6-kpi"><small>Stores</small><b>${scope.length}</b><span>${retailers.length} retailer${retailers.length===1?'':'s'}</span></div>
   <div class="v6-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered} covered</span></div>
   <div class="v6-kpi"><small>Gaps</small><b>${model.gaps.length}</b><span>No eligible RTS in radius</span></div>
   <div class="v6-kpi"><small>RTS Supporting Area</small><b>${rtsStats.length}</b><span>At least one store in radius</span></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>RTS dependency</h3>${rtsStats.slice(0,10).map((x,i)=>`<div class="v78-drill-row v4-list-row" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')"><span class="v4-rank">${i+1}</span><span><b>${esc(x.r.name)}</b></span><span>${x.count} stores ↗</span></div>`).join('')||'<div class="callout">No active RTS currently reaches this manager footprint.</div>'}</div>
   <div class="v4-panel"><h3>Placement opportunities</h3>${placementHtml}</div>
  </div>
  <div class="callout"><b>Portfolio & cross-boundary rule:</b> existing RTS positions are fixed/protected and each program is capped at <b>100 RTS positions</b>. This panel consumes the same sequential candidates as Optimize Network, then shows which of those candidates improve this manager’s stores. The candidate center does <b>not</b> have to sit inside the manager footprint; the 75-mile RTS service radius determines impact.</div>
  <div class="actions"><button class="btn primary" onclick="window.v791ApplyManagerToken('${v791ManagerToken(name)}')">View Manager on Map</button><button class="btn" onclick="window.v791ShowManagerGapsToken('${v791ManagerToken(name)}')">Show Manager Gaps</button></div>`);
};
window.v79ApplyManagerScope=function(name){
 const sample=stores.find(s=>v7145ManagerKey(v7OrgForStore(s).areaManager||s.manager||'Not listed')===v7145ManagerKey(name));
 const org=sample?v7OrgForStore(sample):null;
 if($('fRegional'))$('fRegional').value=(org?.regionalManager&&org.regionalManager!=='Unaligned')?org.regionalManager:'';
 refreshCascadingFilters({preserve:true});
 const el=$('fManager');
 if(el){el.value=name;}
 refreshCascadingFilters({preserve:true});
 if(el){el.value=name;}
 applyFilters();
 $('modal')?.classList.remove('show'); fitResults();
};
window.v79ShowManagerGaps=function(name){
 window.v79ApplyManagerScope(name);
 const cov=$('fCoverage'); if(cov){cov.value='Gap'; applyFilters(); fitResults();}
};

function v6OpenExecutiveIntelligence(){
 const model=v6ScopeModel(),health=v4Health(filtered),plan=v4Plan(filtered,5);
 const covered=filtered.length-model.gaps.length,pct=filtered.length?covered/filtered.length*100:0;
 const avgHealth=health.length?health.reduce((a,x)=>a+x.score,0)/health.length:0;
 const avgWork=health.length?health.reduce((a,x)=>a+x.count,0)/health.length:0;
 const states=v6StateRows(),managers=v6ManagerRows();
 openModal('Executive Intelligence',`
  <div class="v6-hero"><h2>${esc(v4ProgramLabel())} Executive Intelligence</h2><p>Current network condition, operational risk, manager exposure, and modeled placement return for ${esc(scopeLabel())}.</p></div>
  <div class="v6-kpi-grid">
   <div class="v6-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} covered</span></div>
   <div class="v6-kpi"><small>Network Gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No eligible RTS in radius</span></div>
   <div class="v6-kpi"><small>Average Health</small><b>${avgHealth.toFixed(0)}</b><span>Across RTS service areas</span></div>
   <div class="v6-kpi"><small>Average Workload</small><b>${Math.round(avgWork)}</b><span>In-radius stores per RTS</span></div>
   <div class="v6-kpi"><small>Top Gap State</small><b>${esc(states[0]?.name||'—')}</b><span>${states[0]?.gaps||0} gaps</span></div>
   <div class="v6-kpi"><small>Top Manager Exposure</small><b>${esc(managers[0]?.name||'—')}</b><span>${managers[0]?.gaps||0} gaps</span></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>Top placement return</h3>${plan.map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.city)}, ${esc(x.state||'')}</b><br>${esc(x.manager||'')} · ${esc(x.retailer||'')}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}</div>
   <div class="v4-panel"><h3>Highest-risk RTS service areas</h3>${health.slice(0,5).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.count} stores · ${x.uniqueCount} unique</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">${x.score.toFixed(0)}</button></div>`).join('')}</div>
  </div>
  <div class="v6-trend-ready"><b>Historical trends:</b> Ready for monthly snapshot files. No trend line is shown until actual dated snapshots are supplied.</div>`);
}
function v6HistoricalReadiness(){
 openModal('Historical Trends',`<div class="v6-trend-ready"><h3>Historical analytics are ready, but no history has been invented.</h3><p>To enable month-over-month coverage, gap reduction, hiring impact, workload change, and before/after comparisons, add dated snapshots of the store and RTS datasets. The platform will then compare actual periods rather than estimating history.</p><p><b>Recommended cadence:</b> one snapshot at month-end and one whenever a major roster or store-universe change occurs.</p></div>`);
}
window.v6OpenExecutiveIntelligence=v6OpenExecutiveIntelligence;
window.v6OpenStateIntelligence=v6OpenStateIntelligence;
window.v6OpenManagerIntelligence=v6OpenManagerIntelligence;
window.v6HistoricalReadiness=v6HistoricalReadiness;


/* ===== Version 6.2 consolidated command center ===== */
const V62_SCENARIO_KEY='psp_v62_scenarios';

function v62ApplySingleFilter(id,value){
 const el=$(id);if(!el)return;
 [...el.options].forEach(o=>o.selected=(o.value===value));
 applyFilters();
 fitResults();
}
function v62FocusState(state){
 $('modal').classList.remove('show');
 if($('fState'))$('fState').value=state;
 refreshCascadingFilters({preserve:false});
 applyFilters();fitResults();
}
function v62FocusManager(manager){
 $('modal').classList.remove('show');
 const sample=stores.find(s=>v7OrgForStore(s).areaManager===manager);
 const regional=sample?v7OrgForStore(sample).regionalManager:'';
 if($('fRegional'))$('fRegional').value=regional&&regional!=='Unaligned'?regional:'';
 refreshCascadingFilters({preserve:true});
 if($('fManager'))$('fManager').value=manager;
 refreshCascadingFilters({preserve:true});
 applyFilters();fitResults();
}
function v62FocusRts(id){
 $('modal').classList.remove('show');
 openTerritory(id);
}
function v62FocusStore(siteId){
 $('modal').classList.remove('show');
 const s=stores.find(x=>String(x.siteId)===String(siteId));
 if(!s)return;
 map.setView([s.lat,s.lng],Math.max(map.getZoom(),10));
 const marker=storeMarkers.find(m=>String(m.store?.siteId)===String(siteId));
 marker?.openPopup();
}

function v62GapSummary(){
 const model=v4Model(filtered),gapIds=new Set(model.gaps.map(s=>s.siteId));
 const byState=Object.values(filtered.reduce((o,s)=>{
   const k=s.state||'Unknown';o[k]??={key:k,total:0,gaps:0,managers:new Set(),retailers:new Set()};
   const r=o[k];r.total++;if(gapIds.has(s.siteId))r.gaps++;
   const org=v7OrgForStore(s);if(org.areaManager)r.managers.add(org.areaManager);if(s.retailer)r.retailers.add(s.retailer);return o;
 },{})).map(r=>({...r,coverage:r.total?(r.total-r.gaps)/r.total*100:0})).sort((a,b)=>b.gaps-a.gaps);

 const byManager=Object.values(filtered.reduce((o,s)=>{
   const k=v7OrgForStore(s).areaManager||'Not listed';o[k]??={key:k,total:0,gaps:0,states:new Set(),retailers:new Set()};
   const r=o[k];r.total++;if(gapIds.has(s.siteId))r.gaps++;
   if(s.state)r.states.add(s.state);if(s.retailer)r.retailers.add(s.retailer);return o;
 },{})).map(r=>({...r,coverage:r.total?(r.total-r.gaps)/r.total*100:0})).sort((a,b)=>b.gaps-a.gaps);

 openModal('Gap Summary',`
  <div class="callout">Every row is clickable. Drill into a state or manager, then continue into stores, RTS coverage, or placement planning.</div>
  <div class="v62-summary-tabs">
   <button class="btn primary" data-v62-tab="state">By State</button>
   <button class="btn" data-v62-tab="manager">By Manager</button>
  </div>
  <div id="v62GapStatePane" class="v62-gap-pane">
   <div class="tablewrap"><table><thead><tr><th>State</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>Managers</th><th>Retailers</th></tr></thead><tbody>
    ${byState.map(r=>`<tr class="v78-drill-row" data-drill-type="state" data-drill-value="${esc(r.key)}"><td><b>${esc(r.key)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.managers.size}</td><td>${r.retailers.size}</td></tr>`).join('')}
   </tbody></table></div>
  </div>
  <div id="v62GapManagerPane" class="v62-gap-pane" hidden>
   <div class="tablewrap"><table><thead><tr><th>Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>States</th><th>Retailers</th></tr></thead><tbody>
    ${byManager.map(r=>`<tr class="v78-drill-row" data-drill-type="manager" data-drill-value="${esc(r.key)}"><td><b>${esc(r.key)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.states.size}</td><td>${r.retailers.size}</td></tr>`).join('')}
   </tbody></table></div>
  </div>
  <div class="actions"><button class="btn" onclick="window.v62ExportGapSummary()">Export Summary</button></div>`);
 window._v62GapSummary={byState,byManager};
 setTimeout(()=>{
   document.querySelectorAll('[data-v62-tab]').forEach(btn=>btn.onclick=()=>{
     const state=btn.dataset.v62Tab==='state';
     $('v62GapStatePane').hidden=!state;$('v62GapManagerPane').hidden=state;
     document.querySelectorAll('[data-v62-tab]').forEach(x=>x.classList.toggle('primary',x===btn));
   });
 },0);
}
window.v62ExportGapSummary=()=>{
 const d=window._v62GapSummary;if(!d)return;
 csv([
  ...d.byState.map(r=>({View:'State',Name:r.key,Stores:r.total,CoveragePercent:r.coverage.toFixed(1),Gaps:r.gaps})),
  ...d.byManager.map(r=>({View:'Manager',Name:r.key,Stores:r.total,CoveragePercent:r.coverage.toFixed(1),Gaps:r.gaps}))
 ],'gap_summary.csv');
};

function v62SaveScenario(){
 const name=prompt('Scenario name:');if(!name)return;
 const plan=v4Plan(filtered,10);
 const model=v4Model(filtered);
 const scenarios=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]');
 scenarios.push({
  name,savedAt:new Date().toISOString(),program:ACTIVE_PROGRAM_ID,radius:Number($('radius').value),
  scope:scopeLabel(),currentCoverage:filtered.length?(filtered.length-model.gaps.length)/filtered.length*100:0,
  placements:plan.map(x=>({rank:x.rank,city:x.city,state:x.state,gain:x.gain,lat:x.lat,lng:x.lng}))
 });
 localStorage.setItem(V62_SCENARIO_KEY,JSON.stringify(scenarios));
 v62SavedScenarios();
}
function v62SavedScenarios(){
 const scenarios=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]');
 openModal('Saved Placement Scenarios',`
  <div class="tools"><button class="btn primary" onclick="window.v62SaveScenario()">Save Current Top-10 Plan</button><button class="btn" onclick="window.v78CompareScenarios()">Compare Saved Plans</button></div>
  ${scenarios.length?scenarios.map((s,i)=>`<div class="v62-scenario-card">
   <h4>${esc(s.name)}</h4><p>${esc(s.scope)} · ${s.radius} miles · ${s.currentCoverage.toFixed(1)}% starting coverage · ${s.placements.length} placements</p>
   <div class="actions"><button class="btn" onclick="window.v62OpenScenario(${i})">Open on Map</button><button class="btn" onclick="window.v78ReviewScenario(${i})">Final Review</button><button class="btn" onclick="window.v62ExportScenario(${i})">Export</button><button class="btn" onclick="window.v62DeleteScenario(${i})">Delete</button></div>
  </div>`).join(''):'<div class="callout">No saved scenarios yet.</div>'}`);
}
window.v62SaveScenario=v62SaveScenario;
window.v62OpenScenario=i=>{
 const s=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]')[i];if(!s)return;
 simLayer.clearLayers();
 s.placements.forEach(p=>L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:`<div class="sim-icon">${p.rank}</div>`,iconSize:[24,24],iconAnchor:[12,12]})}).bindTooltip(`${p.city}, ${p.state||''} · +${p.gain}`).addTo(simLayer));
 $('modal').classList.remove('show');
 if(s.placements.length)map.fitBounds(s.placements.map(p=>[p.lat,p.lng]),{padding:[35,35],maxZoom:7});
};
window.v62ExportScenario=i=>{
 const s=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]')[i];if(!s)return;
 csv(s.placements.map(p=>({Scenario:s.name,Rank:p.rank,City:p.city,State:p.state,NetNewStores:p.gain,Latitude:p.lat,Longitude:p.lng})),`${s.name.replace(/\W+/g,'_')}.csv`);
};
window.v62DeleteScenario=i=>{
 const a=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]');a.splice(i,1);localStorage.setItem(V62_SCENARIO_KEY,JSON.stringify(a));v62SavedScenarios();
};

function v78FocusRegional(regional){
 $('modal')?.classList.remove('show');
 if($('fRegional'))$('fRegional').value=regional||'';
 refreshCascadingFilters({preserve:true});applyFilters();fitResults();
}
window.v78FocusRegional=v78FocusRegional;
window.v78ReviewScenario=i=>{
 const s=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]')[i];if(!s)return;
 openModal(`Final Placement Review — ${esc(s.name)}`,`<div class="callout">Planning-only review. Click a placement to open the detailed simulator and validate its impact against the current network.</div><div class="tablewrap"><table><thead><tr><th>Rank</th><th>Area</th><th>Modeled Net-New</th><th>Review</th></tr></thead><tbody>${s.placements.map(p=>`<tr class="v78-drill-row" data-drill-type="simulate" data-lat="${p.lat}" data-lng="${p.lng}"><td>${p.rank}</td><td><b>${esc(p.city)}, ${esc(p.state||'')}</b></td><td>+${p.gain}</td><td><select onclick="event.stopPropagation()"><option>Pending</option><option>Approve</option><option>Maybe</option><option>Replace</option></select></td></tr>`).join('')}</tbody></table></div>`);
};
window.v78CompareScenarios=()=>{
 const a=JSON.parse(localStorage.getItem(V62_SCENARIO_KEY)||'[]');
 if(a.length<2){openModal('Compare Saved Plans','<div class="callout">Save at least two placement scenarios before comparing them.</div>');return}
 openModal('Compare Saved Plans',`<div class="callout">Saved planning snapshots are compared side by side. Open either scenario on the map for geographic review.</div><div class="tablewrap"><table><thead><tr><th>Scenario</th><th>Saved</th><th>Scope</th><th>Radius</th><th>Starting Coverage</th><th>Placements</th><th>Modeled Net-New</th><th></th></tr></thead><tbody>${a.map((s,i)=>`<tr><td><b>${esc(s.name)}</b></td><td>${new Date(s.savedAt).toLocaleString()}</td><td>${esc(s.scope)}</td><td>${s.radius} mi</td><td>${Number(s.currentCoverage).toFixed(1)}%</td><td>${s.placements.length}</td><td>${s.placements.reduce((n,p)=>n+(Number(p.gain)||0),0)}</td><td><button class="btn" onclick="window.v62OpenScenario(${i})">Open</button></td></tr>`).join('')}</tbody></table></div>`);
};
function v62InstallClickableDrilldowns(){
 if(window.__v78DrillInstalled)return;window.__v78DrillInstalled=true;
 document.addEventListener('click',e=>{
   const row=e.target.closest('[data-drill-type]');if(!row)return;
   if(e.target.closest('button,a,input,select,textarea') && e.target!==row)return;
   e.preventDefault();e.stopPropagation();
   const type=row.dataset.drillType,value=row.dataset.drillValue;
   if(type==='state')return v62FocusState(value);
   if(type==='manager')return v62FocusManager(value);
   if(type==='regional')return v78FocusRegional(value);
   if(type==='retailer')return v78FocusRetailer(value);
   if(type==='rts')return v62FocusRts(value);
   if(type==='store')return v62FocusStore(value);
   if(type==='simulate'){
     const lat=Number(row.dataset.lat),lng=Number(row.dataset.lng);
     $('modal')?.classList.remove('show');if(Number.isFinite(lat)&&Number.isFinite(lng))simulateAt(lat,lng);
   }
 });
}
window.v62FocusState=v62FocusState;
window.v62FocusManager=v62FocusManager;
window.v62FocusRts=v62FocusRts;
window.v62FocusStore=v62FocusStore;
window.v62GapSummary=v62GapSummary;
window.v62SavedScenarios=v62SavedScenarios;


/* ===== Version 7 Organization Hierarchy ===== */
function v7NormalizeName(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase().replace(/\s+/g,' ');
}

/* ===== v7.14.5 Canonical Manager Identity ===== */
function v7145NameParts(raw){
  const s=String(raw||'').trim().replace(/\s+/g,' ');
  if(!s)return [];
  if(s.includes(',')){
    const [last,...rest]=s.split(',');
    const first=rest.join(' ').trim();
    return [last.trim(),first].filter(Boolean);
  }
  const bits=s.split(' ').filter(Boolean);
  if(bits.length>=2){
    const first=bits.slice(0,-1).join(' ');
    const last=bits[bits.length-1];
    return [last,first];
  }
  return [s];
}
function v7145ManagerKey(raw){
  return v7145NameParts(raw)
    .map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,''))
    .map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())
    .join('|');
}
function v7145PreferredManagerName(raw){
  const parts=v7145NameParts(raw);
  if(parts.length>=2){
    const title=x=>x.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
    return `${title(parts[0])}, ${title(parts.slice(1).join(' '))}`;
  }
  return String(raw||'').trim();
}
window.v7145ManagerKey=v7145ManagerKey;
window.v7145PreferredManagerName=v7145PreferredManagerName;

function v7OrgForStore(store){
 let area;
 if(ACTIVE_PROGRAM_ID==='premium-merchandising'){
   area=store.districtManager||store.areaManager||'';
 }else{
   area=store.areaManager||store.manager||'';
 }
 const lookupArea=area||store.manager||'';
 const regional=store.regionalManager||ORG_HIERARCHY.rdmToRegionalManager?.[v7NormalizeName(lookupArea)]||'Unaligned';
 if(!area && regional && regional!=='Unaligned')area='Unassigned District';
 if(!area)area=store.manager||'Not listed';
 return {regionalManager:regional,areaManager:area};
}
function v7StoresForRegional(rm){
 return stores.filter(s=>v7OrgForStore(s).regionalManager===rm);
}
function v7StoresForArea(rdm){
 return stores.filter(s=>v7OrgForStore(s).areaManager===rdm);
}
function v7ModelForStores(scope){
 return coverageModel(scope);
}
function v7MetricCard(label,value,detail=''){
 return `<div class="v7-metric"><small>${esc(label)}</small><b>${value??'—'}</b><span>${esc(detail||'')}</span></div>`;
}
function v7Breadcrumb(items){
 return `<div class="v7-breadcrumb">${items.map((x,i)=>`${i?'<span>›</span>':''}<button onclick="${x.action}">${esc(x.label)}</button>`).join('')}</div>`;
}

function v7146ResolveRegionalName(name){
 const target=v7145ManagerKey(name);
 const hierarchy=(ORG_HIERARCHY.regionalManagers||[]).find(r=>v7145ManagerKey(r.name)===target);
 if(hierarchy)return hierarchy.name;

 // Fallback to store hierarchy if operational hierarchy uses a different display variant.
 const row=v793RegionalRows(stores).find(r=>v7145ManagerKey(r.name)===target);
 return row?.name||name;
}
function v7146OpenRegionalManager(name){
 const resolved=v7146ResolveRegionalName(name);
 window.v7RegionalDashboard(resolved);
}
function v7146OpenRegionalToken(token){
 v7146OpenRegionalManager(decodeURIComponent(token));
}
window.v7146OpenRegionalManager=v7146OpenRegionalManager;
window.v7146OpenRegionalToken=v7146OpenRegionalToken;

function v7RegionalDashboard(rmName){
 const resolved=v7146ResolveRegionalName(rmName);
 const targetKey=v7145ManagerKey(resolved);
 const rm=(ORG_HIERARCHY.regionalManagers||[]).find(x=>v7145ManagerKey(x.name)===targetKey);

 const scope=stores.filter(s=>v7145ManagerKey(v7OrgForStore(s).regionalManager)===targetKey);
 const model=v7ModelForStores(scope),covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;

 const storeRows=v793ManagerRows(scope);
 const storeByKey=new Map(storeRows.map(r=>[v7145ManagerKey(r.name),r]));

 const hierarchyManagers=(rm?.areaManagers||[]).map(a=>({
   ...a,
   name:v7145PreferredManagerName(a.name)
 }));

 // Include any manager found in store data even if absent/mismatched in performance hierarchy.
 const merged=new Map();
 hierarchyManagers.forEach(a=>merged.set(v7145ManagerKey(a.name),{
   name:a.name,
   metrics:a.metrics||{},
   stores:0,coverage:0,gaps:0
 }));
 storeRows.forEach(sr=>{
   const key=v7145ManagerKey(sr.name);
   const existing=merged.get(key)||{name:sr.name,metrics:{},stores:0,coverage:0,gaps:0};
   existing.name=sr.name;
   existing.stores=sr.total;
   existing.coverage=sr.coverage;
   existing.gaps=sr.gaps;
   existing.unique=sr.unique;
   existing.shared=sr.shared;
   merged.set(key,existing);
 });

 const rdmRows=[...merged.values()].sort((a,b)=>b.gaps-a.gaps||b.stores-a.stores||a.name.localeCompare(b.name));
 const metrics=rm?.metrics||{};

 openModal(`Regional Manager — ${v7145PreferredManagerName(resolved)}`,`
  ${v7Breadcrumb([{label:'National',action:'window.v7OpenOrganizationNavigator()'},{label:v7145PreferredManagerName(resolved),action:'void(0)'}])}
  <div class="v7-hero"><h2>${esc(v7145PreferredManagerName(resolved))}</h2><p>${rdmRows.length} ${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers / RDMs'} · ${scope.length.toLocaleString()} stores · click a manager row for full coverage & placement intelligence</p></div>
  <div class="v7-metrics">
   ${v7MetricCard('Coverage',pct.toFixed(1)+'%',`${model.gaps.length} gaps`)}
   ${v7MetricCard('SO Executed',metrics.soExecuted!=null?metrics.soExecuted.toFixed(2)+'%':'—')}
   ${v7MetricCard('Compliance',metrics.compliance!=null?metrics.compliance.toFixed(2)+'%':'—')}
   ${v7MetricCard('Action Hours Utilized',metrics.actionHoursUtilized!=null?metrics.actionHoursUtilized.toFixed(2)+'%':'—')}
   ${v7MetricCard('Efficiency Gained',metrics.efficiencyGained!=null?metrics.efficiencyGained.toFixed(2)+'%':'—')}
  </div>
  <div class="tablewrap"><table><thead><tr><th>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager'}</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>SO Executed</th><th>Compliance</th></tr></thead><tbody>
   ${rdmRows.map(r=>`<tr class="v711-manager-drill-row" data-v714-manager-token="${encodeURIComponent(r.name)}" onclick="window.v793OpenManagerProfileToken(this.dataset.v714ManagerToken)"><td><b class="v711-link-name">${esc(r.name)}</b></td><td>${r.stores}</td><td>${Number(r.coverage||0).toFixed(1)}%</td><td>${r.gaps}</td><td>${r.metrics?.soExecuted!=null?r.metrics.soExecuted.toFixed(2)+'%':'—'}</td><td>${r.metrics?.compliance!=null?r.metrics.compliance.toFixed(2)+'%':'—'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="actions"><button class="btn primary" onclick="window.v7ApplyRegionalFilter(${JSON.stringify(resolved)})">Show Region on Map</button><button class="btn" onclick="window.v7ExportRegional(${JSON.stringify(resolved)})">Export</button></div>`);
}
function v7AreaDashboard(areaName){
 const metric=Object.values((ORG_HIERARCHY.regionalManagers||[]).flatMap(r=>r.areaManagers||[])).find?.(()=>false);
 const rm=(ORG_HIERARCHY.regionalManagers||[]).find(r=>(r.areaManagers||[]).some(a=>a.name===areaName));
 const area=rm?.areaManagers?.find(a=>a.name===areaName);
 const scope=v7StoresForArea(areaName),model=v7ModelForStores(scope),covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const eligibleRts=activeRTS().filter(r=>scope.some(s=>PROGRAM_ELIGIBILITY(s,r)&&hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value)));
 const rtsRows=eligibleRts.map(r=>{
   const s=scope.filter(x=>PROGRAM_ELIGIBILITY(x,r)&&hav(x.lat,x.lng,r.lat,r.lng)<=Number($('radius').value));
   return {r,count:s.length};
 }).sort((a,b)=>b.count-a.count);
 const m=area?.metrics||{};
 openModal(`Area Manager — ${areaName}`,`
  ${v7Breadcrumb([{label:'National',action:'window.v7OpenOrganizationNavigator()'},{label:rm?.name||'Region',action:`window.v7RegionalDashboard(${JSON.stringify(rm?.name||'')})`},{label:areaName,action:'void(0)'}])}
  <div class="v7-hero"><h2>${esc(areaName)}</h2><p>${esc(rm?.name||'Unaligned Region')} · ${scope.length.toLocaleString()} stores</p></div>
  <div class="v7-metrics">
   ${v7MetricCard('Coverage',pct.toFixed(1)+'%',`${model.gaps.length} gaps`)}
   ${v7MetricCard('RTS in Scope',rtsRows.length)}
   ${v7MetricCard('SO Executed',m.soExecuted!=null?m.soExecuted.toFixed(2)+'%':'—')}
   ${v7MetricCard('Compliance',m.compliance!=null?m.compliance.toFixed(2)+'%':'—')}
   ${v7MetricCard('Action Hours Utilized',m.actionHoursUtilized!=null?m.actionHoursUtilized.toFixed(2)+'%':'—')}
   ${v7MetricCard('Efficiency Gained',m.efficiencyGained!=null?m.efficiencyGained.toFixed(2)+'%':'—')}
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>RTS covering this area</h3>${rtsRows.slice(0,12).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${esc(x.r.email||'')}</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">${x.count}</button></div>`).join('')||'<div class="callout">No RTS currently cover stores in this area.</div>'}</div>
   <div class="v4-panel"><h3>Stores</h3>${scope.slice(0,12).map((s,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(s.retailer)} #${esc(s.storeNumber)}</b><br>${esc(s.city)}, ${esc(s.state)}</span><button class="btn" onclick="window.v6OpenStoreIntelligence('${esc(s.siteId)}')">${esc(s.coverageType||'Gap')}</button></div>`).join('')}</div>
  </div>
  <div class="actions"><button class="btn primary" onclick="window.v7ApplyAreaFilter(${JSON.stringify(areaName)})">Show Area on Map</button><button class="btn" onclick="window.v7ExportArea(${JSON.stringify(areaName)})">Export</button></div>`);
}
function v7OpenOrganizationNavigator(){
 const rows=(ORG_HIERARCHY.regionalManagers||[]).map(r=>{
   const scope=v7StoresForRegional(r.name),model=v7ModelForStores(scope),covered=scope.length-model.gaps.length;
   return {...r,stores:scope.length,gaps:model.gaps.length,coverage:scope.length?covered/scope.length*100:0};
 }).sort((a,b)=>b.gaps-a.gaps||b.stores-a.stores);
 openModal('Organization Navigator',`
  ${v7Breadcrumb([{label:'National',action:'void(0)'}])}
  <div class="v7-hero"><h2>${esc(v4ProgramLabel())} Organization</h2><p>National → Regional Manager → ${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager/RDM'} → RTS → Store</p></div>
  <div class="tablewrap"><table><thead><tr><th>Regional Manager</th><th>${ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Managers':'Area Managers'}</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>SO Executed</th><th>Compliance</th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="v62-click-row" onclick="window.v7RegionalDashboard(${JSON.stringify(r.name)})"><td><b>${esc(r.name)}</b></td><td>${r.areaManagers.length}</td><td>${r.stores}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.metrics?.soExecuted!=null?r.metrics.soExecuted.toFixed(2)+'%':'—'}</td><td>${r.metrics?.compliance!=null?r.metrics.compliance.toFixed(2)+'%':'—'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="actions"><button class="btn" onclick="window.v7ExportNational()">Export Hierarchy</button></div>`);
}
window.v7OpenOrganizationNavigator=v7OpenOrganizationNavigator;
window.v7RegionalDashboard=v7RegionalDashboard;
window.v7AreaDashboard=v7AreaDashboard;

window.v7ApplyRegionalFilter=rm=>{
 $('modal').classList.remove('show');
 if($('fRegional'))$('fRegional').value=rm;
 refreshCascadingFilters({preserve:true});
 applyFilters();
 if(filtered.length)map.fitBounds(filtered.map(s=>[s.lat,s.lng]),{padding:[30,30]});
};
window.v7ApplyAreaFilter=area=>{
 $('modal').classList.remove('show');
 const regional=stores.find(s=>s.areaManager===area)?.regionalManager||'';
 if($('fRegional'))$('fRegional').value=regional;
 refreshCascadingFilters({preserve:true});
 if($('fManager'))$('fManager').value=area;
 applyFilters();
 if(filtered.length)map.fitBounds(filtered.map(s=>[s.lat,s.lng]),{padding:[30,30]});
};
window.v7ExportRegional=rm=>csv(v7StoresForRegional(rm).map(s=>({RegionalManager:rm,AreaManager:s.areaManager,SiteID:s.siteId,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,Coverage:s.coverageType})),'regional_'+rm.replace(/\W+/g,'_')+'.csv');
window.v7ExportArea=area=>csv(v7StoresForArea(area).map(s=>({RegionalManager:s.regionalManager,AreaManager:area,SiteID:s.siteId,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,Coverage:s.coverageType})),'area_'+area.replace(/\W+/g,'_')+'.csv');
window.v7ExportNational=()=>csv((ORG_HIERARCHY.regionalManagers||[]).flatMap(r=>(r.areaManagers||[]).map(a=>({RegionalManager:r.name,AreaManager:a.name,SOExecuted:a.metrics?.soExecuted??'',Compliance:a.metrics?.compliance??'',ActionHoursUtilized:a.metrics?.actionHoursUtilized??'',EfficiencyGained:a.metrics?.efficiencyGained??''}))),`${ACTIVE_PROGRAM_ID.replace(/\W+/g,'_')}_hierarchy.csv`);


function cascadeBaseStores(){
 const c=$('fCoverage')?.value||'',ret=$('fRetailer')?.value||'',st=$('fState')?.value||'';
 return stores.filter(s=>
   (!c||(c==='covered'?s.covered:!s.covered))&&
   (!ret||s.retailer===ret)&&
   (!st||s.state===st)
 );
}
function v75RtsIdsForScope(scope){
 const radius=Number($('radius')?.value||75);
 const ids=new Set();
 scope.forEach(s=>{
   for(const r of (s._eligibleDistances||[])){
     if(r.distance<=radius)ids.add(String(r.id));
     else break;
   }
 });
 return ids;
}
function refreshCascadingFilters({preserve=true}={}){
 const regionalEl=$('fRegional'),managerEl=$('fManager'),rtsEl=$('fRts');
 if(!regionalEl||!managerEl||!rtsEl)return;

 const oldRegional=preserve?regionalEl.value:'';
 const oldManager=preserve?managerEl.value:'';
 const oldRts=preserve?rtsEl.value:'';

 const base=cascadeBaseStores();

 const regionalNames=uniq(base.map(s=>v7OrgForStore(s).regionalManager).filter(x=>x&&x!=='Unaligned'));
 options('fRegional',regionalNames);
 if(oldRegional&&regionalNames.includes(oldRegional))regionalEl.value=oldRegional;

 const selectedRegional=regionalEl.value||'';
 const districtScope=base.filter(s=>!selectedRegional||v7OrgForStore(s).regionalManager===selectedRegional);
 const managerNames=uniq(districtScope.map(s=>v7OrgForStore(s).areaManager).filter(Boolean));
 options('fManager',managerNames);
 if(oldManager&&managerNames.includes(oldManager))managerEl.value=oldManager;

 const selectedManager=managerEl.value||'';
 const rtsScope=districtScope.filter(s=>!selectedManager||v7OrgForStore(s).areaManager===selectedManager);
 const validIds=v75RtsIdsForScope(rtsScope);
 const rtsNames=uniq(activeRTS().filter(r=>validIds.has(String(r.id))).map(r=>r.name));
 options('fRts',rtsNames);
 if(oldRts&&rtsNames.includes(oldRts))rtsEl.value=oldRts;
}
function v72RefreshAreaManagers(){refreshCascadingFilters({preserve:true})}
function v72SetRegionalFilter(regional){
 if($('fRegional'))$('fRegional').value=regional||'';
 refreshCascadingFilters({preserve:true});
 applyFilters();
}
window.v72SetRegionalFilter=v72SetRegionalFilter;


/* ===== Version 7.6.1 restored planning/territory handlers ===== */
function modelPlacement(){
 const chosen=gapClustersV2(filtered,25);
 openModal('Model New RTS Placement',`
  <div class="callout">Fast radius-based planning model for the current filtered scope. Click a recommendation to simulate that placement.</div>
  <div class="tools"><button class="btn" onclick="window.exportModel()">Export Model</button></div>
  <div class="tablewrap"><table><thead><tr><th>Rank</th><th>Suggested Area</th><th>New Stores Covered</th><th></th></tr></thead><tbody>
   ${chosen.map(c=>`<tr class="v76-drill-row" onclick="window.simulateAt(${c.lat},${c.lng});document.getElementById('modal').classList.remove('show')"><td>${c.rank}</td><td><b>${esc(c.city)}, ${esc(c.state||'')}</b></td><td>${c.gain}</td><td>Simulate ↗</td></tr>`).join('')}
  </tbody></table></div>`);
 window._model=chosen;
}
function territoryProfiles(){
 const rows=territoryHealthV2(filtered).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
 openModal('RTS Territory Profiles',`
  <div class="callout">Current filtered scope. Click any row to open the full RTS service-area profile.</div>
  <div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores in Radius</th><th>Unique</th><th>Shared</th><th>Avg Distance</th><th></th></tr></thead><tbody>
   ${rows.map(x=>`<tr class="v76-drill-row" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')"><td><b>${esc(x.r.name)}</b></td><td>${x.count}</td><td>${x.uniqueCount}</td><td>${x.sharedCount}</td><td>${x.avgDistance.toFixed(1)} mi</td><td>↗</td></tr>`).join('')}
  </tbody></table></div>`);
}
function compareTerritories(){ return v4CompareRts(); }
function resiliency(){
 const model=coverageModel(currentScope());
 const rows=model.byRts.filter(x=>x.count>0).map(x=>({r:x.rts,count:x.count,backup:x.sharedCount,lost:x.uniqueCount,stores:x.stores})).sort((a,b)=>b.lost-a.lost||b.count-a.count);
 window._v78Resiliency=rows;
 openModal('RTS Resiliency Simulator',`<div class="callout">At Risk = stores for which this RTS is the only eligible RTS inside the selected radius. Click a row to highlight the at-risk stores; click the RTS name button to open its profile.</div><div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores in Radius</th><th>Backup-Covered</th><th>At Risk</th><th>Actions</th></tr></thead><tbody>${rows.map((x,i)=>`<tr class="v78-highlight-row" onclick="window.v78ShowResiliency(${i})"><td><b>${esc(x.r.name)}</b></td><td>${x.count}</td><td>${x.backup}</td><td>${x.lost}</td><td><button class="btn" onclick="event.stopPropagation();window.v62FocusRts('${esc(x.r.id)}')">RTS Profile</button></td></tr>`).join('')}</tbody></table></div>`);
}
window.v78ShowResiliency=i=>{
 const x=(window._v78Resiliency||[])[i];if(!x)return;
 const radius=Number($('radius')?.value||75);highlightLayer.clearLayers();
 x.stores.filter(s=>s.coverCount===1).forEach(s=>L.circleMarker([s.lat,s.lng],{radius:7,weight:3,fillOpacity:.8}).bindTooltip(`${s.retailer||'Store'} ${s.storeNumber||s.siteId||''} · At risk if ${x.r.name} unavailable`).addTo(highlightLayer));
 $('modal')?.classList.remove('show');if(x.stores.length)map.fitBounds(x.stores.map(s=>[s.lat,s.lng]),{padding:[35,35],maxZoom:8});
};

function v78CopyViewLink(){
 const u=new URL(location.href);u.searchParams.set('program',ACTIVE_PROGRAM_ID);u.searchParams.set('radius',$('radius')?.value||75);
 [['coverage','fCoverage'],['retailer','fRetailer'],['state','fState'],['regional','fRegional'],['manager','fManager'],['rts','fRts']].forEach(([k,id])=>{const v=$(id)?.value||'';if(v)u.searchParams.set(k,v);else u.searchParams.delete(k)});
 const c=map.getCenter();u.searchParams.set('lat',c.lat.toFixed(5));u.searchParams.set('lng',c.lng.toFixed(5));u.searchParams.set('zoom',map.getZoom());
 navigator.clipboard?.writeText(u.toString());setDataStatus('success','Current view link copied');
}
window.v78CopyViewLink=v78CopyViewLink;
function init(){
 initializeDataStatus();
 const regionalSelect=$('fRegional');
 const managerSelect=$('fManager');
 if(regionalSelect){
   const label=regionalSelect.closest('.field')?.querySelector('label');
   if(label)label.textContent='Regional Manager';
 }
 if(managerSelect){
   const label=managerSelect.closest('.field')?.querySelector('label');
   if(label)label.textContent=ACTIVE_PROGRAM_ID==='premium-merchandising'?'District Manager':'Area Manager / RDM';
 }

 stores=RAW_STORES.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))).map(s=>calculate({...s,lat:Number(s.lat),lng:Number(s.lng)}));
 stores.forEach(s=>markerById.set(s.siteId,storeMarker(s)));
 options('fRetailer',uniq(stores.map(s=>s.retailer)));
 options('fState',uniq(stores.map(s=>s.state)));
 refreshCascadingFilters({preserve:false});
 drawRts();applyFilters();drawTerritories();fit();$('status').style.display='none'
}

function installApplicationBindings(){
 let unavailable=0;
 const safe=(id,handler,label=id)=>{
  const el=$(id);
  if(!el){console.debug(`[V7.2] Optional control absent: ${label}`);return false}
  if(typeof handler!=='function'){
   console.warn(`[V7.2] Optional tool unavailable: ${label}`);
   el.disabled=true;el.title=`${label} is unavailable`;unavailable++;return false
  }
  try{
   el.onclick=(event)=>{
    try{return handler(event)}
    catch(error){
     console.error(`[V7.2] ${label} failed`,error);
     openModal('Tool Error',`<div class="data-error-panel"><b>${esc(label)} could not open.</b><br><br>${esc(String(error.message||error))}<br><br>The map remains available.</div>`)
    }
   };
   return true
  }catch(error){console.error(`[V7.2] Could not bind ${label}`,error);unavailable++;return false}
 };
 const on=(id,event,handler,label=id)=>{
  const el=$(id);if(!el){console.debug(`[V7.2] Optional control absent: ${label}`);return false}
  try{el.addEventListener(event,handler);return true}catch(error){console.error(`[V7.2] Could not bind ${label}`,error);unavailable++;return false}
 };

 ['cluster','heat','overlap','within','territories','territoryLabels'].forEach(id=>on(id,'change',applyFilters,id));
 ['fCoverage','fRetailer','fState'].forEach(id=>on(id,'change',()=>{refreshCascadingFilters({preserve:true});applyFilters()},id));
 on('fRegional','change',()=>{const keep=$('fRegional').value;refreshCascadingFilters({preserve:true});$('fRegional').value=keep;refreshCascadingFilters({preserve:true});applyFilters()},'Regional Manager filter');
 on('fManager','change',()=>{const keep=$('fManager').value;refreshCascadingFilters({preserve:true});$('fManager').value=keep;refreshCascadingFilters({preserve:true});applyFilters()},'District/Area Manager filter');
 on('fRts','change',applyFilters,'RTS filter');
 on('showRts','change',drawRts,'RTS visibility');
 on('territories','change',drawTerritories,'Territories');
 on('territoryLabels','change',drawTerritories,'Territory labels');
 on('showRings','change',drawRts,'Coverage rings');
 let radiusTimer=null;
 on('radius','input',()=>{
   $('radiusLbl').textContent=$('radius').value;
   clearTimeout(radiusTimer);
   radiusTimer=setTimeout(()=>recompute(),140);
 },'Radius');

 safe('fit',fit,'Fit Results');
 safe('home',()=>map.setView(HOME.center,HOME.zoom),'Home');
 safe('reset',()=>{
  ['fCoverage','fRetailer','fState','fRegional','fManager','fRts'].forEach(x=>{if($(x))$(x).value=''});
  refreshCascadingFilters({preserve:false});
  if($('cluster'))$('cluster').checked=true;
  ['heat','territories','territoryLabels','overlap','within','showRings'].forEach(x=>{if($(x))$(x).checked=false});
  if($('showRts'))$('showRts').checked=true;
  if($('radius'))$('radius').value=75;
  if($('radiusLbl'))$('radiusLbl').textContent=75;
  window.clearHighlight();simLayer.clearLayers();recompute();map.setView(HOME.center,HOME.zoom)
 },'Reset');
 safe('v78CopyViewBtn',v78CopyViewLink,'Copy View Link');
 safe('clearFilters',()=>{
  ['fCoverage','fRetailer','fState','fRegional','fManager','fRts'].forEach(x=>{if($(x))$(x).value=''});
  refreshCascadingFilters({preserve:false});applyFilters()
 },'Clear Filters');
 safe('gapsOnly',()=>{$('fCoverage').value='gap';applyFilters();fit()},'Current Gaps');
 safe('railGaps',()=>{$('fCoverage').value='gap';applyFilters();fit()},'Rail Gaps');
 safe('coveredOnly',()=>{$('fCoverage').value='covered';applyFilters();fit()},'Covered Stores');

 const bindings=[
  ['v7OrganizationBtn',v7OpenOrganizationNavigator,'Organization Navigator'],
  ['v62ExecutiveBtn',v6OpenExecutiveIntelligence,'Executive Overview'],
  ['v62ShowGapsBtn',()=>{$('gapsOnly').click();v41OperationalFocus()},'Show Uncovered'],
  ['v62OperationalBtn',v41OperationalFocusModal,'Operational Focus'],
  ['v62GapSummaryBtn',v62GapSummary,'Gap Summary'],
  ['v62StateBtn',v6OpenStateIntelligence,'State / Territory Intelligence'],
  ['v62ManagerBtn',v6OpenManagerIntelligence,'Manager Intelligence'],
  ['v62RtsBtn',v4RtsProfiles,'RTS Profiles'],
  ['v62StoreBtn',()=>{$('search').focus();openModal('Store Intelligence','<div class="callout">Search for a store, open its popup, and choose Store Intelligence.</div>')},'Store Intelligence'],
  ['v62DedicatedBtn',v41DedicatedAnalysis,'Dedicated Teams'],
  ['v62ResiliencyBtn',resiliencySimulator,'Resiliency'],
  ['v62SimulateBtn',startSimulation,'Simulate New RTS'],
  ['v62OptimizerBtn',networkOptimizer,'Optimize Network'],
  ['v62MultiHireBtn',multiHirePlanner,'Multi-Hire Plan'],
  ['v62CompareBtn',v4CompareRts,'Compare RTS'],
  ['v62TimelineBtn',v4CoverageTimeline,'Coverage Timeline'],
  ['v62SavedPlansBtn',v62SavedScenarios,'Saved Scenarios'],
  ['v62BriefBtn',v4ExecutiveBrief,'Executive Brief'],
  ['v62LeadershipBtn',leadershipReport,'Leadership Report'],
  ['v62TerritoryReportBtn',v4TerritoryReport,'Territory Report'],
  ['v62HealthBtn',territoryHealthScores,'Coverage Health'],
  ['v62BalancerBtn',territoryBalancer,'Territory Balancer'],
  ['v62RetailerBtn',retailerRollups,'Retailer Rollups'],
  ['v62SavedViewsBtn',v41SavedViews,'Saved Views'],
  ['v62HelpBtn',v41Help,'Help / Guide'],
  ['v4ExecutiveHomeBtn',v4OpenExecutive,'Executive Home'],
  ['executiveModeBtn',executiveMode,'Executive Mode'],
  ['networkOptimizerBtn',networkOptimizer,'Network Optimizer'],
  ['multiHireBtn',multiHirePlanner,'Multi-Hire Planner'],
  ['healthBtn',territoryHealthScores,'Coverage Health'],
  ['rtmDashboardBtn',rtmDashboard,'RTM Dashboard'],
  ['executiveBtn',executiveDashboard,'Executive Dashboard'],
  ['leadershipReportBtn',leadershipReport,'Leadership Report'],
  ['balanceBtn',territoryBalancer,'Territory Balancer'],
  ['hiringPlanBtn',hiringRecommendationPlan,'Hiring Recommendation Plan'],
  ['simulateBtn',startSimulation,'Simulate'],
  ['railSim',startSimulation,'Rail Simulate'],
  ['modelBtn',modelPlacement,'Model Placement'],
  ['railModel',modelPlacement,'Rail Model'],
  ['railExecutive',executiveMode,'Rail Executive'],
  ['gapFinderBtn',openGapFinder,'Gap Finder'],
  ['territoryBtn',territoryProfiles,'Territory Profiles'],
  ['railTerritory',territoryProfiles,'Rail Territory'],
  ['compareBtn',compareTerritories,'Compare Territories'],
  ['resiliencyBtn',resiliency,'Resiliency'],
  ['managerBtn',()=>rollup('manager','Manager Rollups'),'Manager Rollups'],
  ['retailerBtn',()=>rollup('retailer','Retailer Rollups'),'Retailer Rollups'],
  ['exportStores',()=>csv(storeRows(filtered),'visible_stores.csv'),'Export Visible Stores'],
  ['exportGaps',()=>csv(storeRows(stores.filter(s=>!s.covered)),'current_coverage_gaps.csv'),'Export Gaps'],
  ['panelBtn',()=>{$('workspace').classList.toggle('closed');setTimeout(()=>map.invalidateSize(),220)},'Controls'],
  ['hidePanel',()=>{$('workspace').classList.toggle('closed');setTimeout(()=>map.invalidateSize(),220)},'Hide Panel'],
  ['drawerClose',()=>{$('drawer').classList.remove('show');window.clearHighlight()},'Close Drawer'],
  ['modalClose',()=>{$('modal').classList.remove('show')},'Close Modal'],
  ['clearSearch',()=>{$('search').value='';$('results').classList.remove('show')},'Clear Search']
 ];
 bindings.forEach(([id,handler,label])=>safe(id,handler,label));
 on('search','input',search,'Search');
 on('search','keydown',e=>{if(e.key==='Enter'&&($('search')._hits||[]).length){e.preventDefault();selectHit(($('search')._hits||[])[0])}},'Search Enter');
 document.addEventListener('click',e=>{if(!e.target.closest('.search'))$('results').classList.remove('show')});
 v62InstallClickableDrilldowns();
 v5StartupDiagnostics();

 if(unavailable===0){
  setDataStatus('ready',`${ACTIVE_PROGRAM.name} · all tools loaded`);
  setTimeout(()=>{if($('dataStatus'))$('dataStatus').textContent=`${ACTIVE_PROGRAM.name} · ${stores.length.toLocaleString()} stores · ${RTS.length.toLocaleString()} roster RTS`},100);
 }else{
  setDataStatus('warning',`Map loaded; ${unavailable} optional tool${unavailable===1?'':'s'} unavailable`);
 }
 console.info(`[V7.2] Bindings installed; unavailable tools: ${unavailable}`);
}

initializeProgramSwitcher({
  programs: listPrograms(),
  activeProgramId: ACTIVE_PROGRAM_ID,
  onProgramSelected(program) {
    if (!program || program.id === ACTIVE_PROGRAM_ID) return;
    localStorage.setItem("psp_active_program", program.id);
    const url = new URL(window.location.href);
    url.searchParams.set("program", program.id);
    window.location.href = url.toString();
  }
});

try {
  init();

(function(){
 const search=document.getElementById('search')||document.getElementById('searchBox')||document.querySelector('input[placeholder*="Search store"]');
 if(!search || search.dataset.v7142ExactSearch)return;
 search.dataset.v7142ExactSearch='1';

 search.addEventListener('keydown',event=>{
   if(event.key!=='Enter')return;
   const exact=v7142ExactStoreMatch(search.value);
   if(!exact)return;
   event.preventDefault();
   event.stopImmediatePropagation();
   v7142OpenStoreDirect(exact);
 },true);

 // Also make exact-number searches visually prioritize the exact store.
 search.addEventListener('input',()=>{
   const exact=v7142ExactStoreMatch(search.value);
   if(!exact)return;
   setTimeout(()=>{
     const results=document.getElementById('searchResults')||document.querySelector('.search-results');
     if(!results)return;
     const rows=[...results.querySelectorAll('[data-store-id],.search-result,.search-item,li,button')];
     const exactId=String(exact.siteId??exact.id??'');
     const row=rows.find(r=>String(r.dataset?.storeId||r.dataset?.id||'')===exactId)
       || rows.find(r=>{
         const t=(r.textContent||'').toLowerCase();
         return t.includes(`#${v7142StoreNumber(exact)}`.toLowerCase());
       });
     if(row && row.parentElement){
       row.parentElement.insertBefore(row,row.parentElement.firstChild);
       row.classList.add('v7142-exact-store-result');
     }
   },0);
 });
})();

  installApplicationBindings();
  setTimeout(()=>{
    try{
      v41OperationalFocus();
      v41LoadUrlView();
      const pending=localStorage.getItem('psp_v41_pending_view');
      if(pending){
        localStorage.removeItem('psp_v41_pending_view');
        v41ApplyViewState(JSON.parse(pending));
      }
    }catch(error){
      console.warn('[V7.1] Deferred startup task failed',error);
    }
  },500);
} catch (error) {
  console.error('[V7.1] Core startup failed',error);
  setDataStatus('error','Core startup failed');
  const status=document.getElementById('status');
  if(status){
    status.style.display='flex';
    status.innerHTML=`<div class="data-error-panel">
      <b>Core map startup failed.</b><br><br>
      ${String(error.message||error)}
      <br><br>
      The browser console includes the exact file and line.
    </div>`;
  }
}
