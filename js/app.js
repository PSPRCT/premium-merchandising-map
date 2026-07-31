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
if(ACTIVE_PROGRAM_ID==='one-walmart'){
 try{
  const response=await fetch('./data/one-walmart/organization.json',{cache:'no-store'});
  if(response.ok)ORG_HIERARCHY=await response.json();
 }catch(error){console.warn('Organization hierarchy could not be loaded',error)}
}

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
 const near=eligible.map(r=>({...r,distance:hav(s.lat,s.lng,r.lat,r.lng)})).sort((a,b)=>a.distance-b.distance);
 s.nearest=near.slice(0,3);
 s.coverCount=near.filter(r=>r.distance<=Number($('radius')?.value||75)).length;
 s.covered=s.coverCount>0;
 s.coverageType=s.coverCount===0?'Gap':s.coverCount===1?'Unique':'Shared';
 s.eligibleRtsCount=eligible.length;
 return s
}
function recompute(){stores.forEach(calculate);applyFilters();drawRts();updateMetrics();drawTerritories()}
function uniq(a){return [...new Set(a.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function options(id,vals){const e=$(id);vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;e.appendChild(o)})}
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
   const inside=stores.filter(s=>PROGRAM_ELIGIBILITY(s,r)&&hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value));
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

function applyFilters(){const c=$('fCoverage').value,ret=$('fRetailer').value,st=$('fState').value,mgr=$('fManager').value,rr=$('fRts').value,rad=Number($('radius').value);filtered=stores.filter(s=>(!c||(c==='covered'?s.covered:!s.covered))&&(!ret||s.retailer===ret)&&(!st||s.state===st)&&(!mgr||s.manager===mgr)&&(!rr||s.nearest[0]?.name===rr)&&(!$('within').checked||s.nearest.some(r=>r.distance<=rad)));renderStores();updateMetrics();drawTerritories()}
function renderStores(){clusterLayer.clearLayers();plainLayer.clearLayers();const ms=filtered.map(s=>markerById.get(s.siteId));if($('cluster').checked){clusterLayer.addLayers(ms);if(!map.hasLayer(clusterLayer))map.addLayer(clusterLayer);if(map.hasLayer(plainLayer))map.removeLayer(plainLayer)}else{ms.forEach(m=>plainLayer.addLayer(m));if(!map.hasLayer(plainLayer))map.addLayer(plainLayer);if(map.hasLayer(clusterLayer))map.removeLayer(clusterLayer)}drawHeat();drawOverlap()}
function updateMetrics(){
 const scope=filtered;
 const covered=scope.filter(s=>s.covered).length;
 const gaps=scope.length-covered;
 const pct=scope.length?covered/scope.length*100:0;
 const avg=scope.length?scope.reduce((a,s)=>a+(s.nearest[0]?.distance||0),0)/scope.length:0;
 const servingRts=activeRTS().filter(r=>scope.some(s=>s.nearest[0]?.id===r.id));
 const territoryCounts=servingRts.map(r=>scope.filter(s=>s.nearest[0]?.id===r.id).length).filter(Boolean).sort((a,b)=>a-b);
 const avgTerr=territoryCounts.length?territoryCounts.reduce((a,b)=>a+b,0)/territoryCounts.length:0;
 const medianTerr=territoryCounts.length?(territoryCounts.length%2?territoryCounts[(territoryCounts.length-1)/2]:(territoryCounts[territoryCounts.length/2-1]+territoryCounts[territoryCounts.length/2])/2):0;
 $('kStores').textContent=scope.length.toLocaleString();
 $('kRts').textContent=servingRts.length.toLocaleString();
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
 const rad=Number($('radius').value),active=activeRTS();
 const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad);
 const unique=inside.filter(s=>active.filter(x=>hav(s.lat,s.lng,x.lat,x.lng)<=rad).length===1);
 const shared=inside.filter(s=>active.filter(x=>hav(s.lat,s.lng,x.lat,x.lng)<=rad).length>=2);
 const distances=inside.map(s=>hav(s.lat,s.lng,r.lat,r.lng));
 const avg=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;
 const farthest=distances.length?Math.max(...distances):0;
 const farthestObj=inside.length?[...inside].sort((a,b)=>hav(b.lat,b.lng,r.lat,r.lng)-hav(a.lat,a.lng,r.lat,r.lng))[0]:null;
 const teamCounts=active.map(x=>stores.filter(s=>hav(s.lat,s.lng,x.lat,x.lng)<=rad).length);
 const teamAvg=teamCounts.length?teamCounts.reduce((a,b)=>a+b,0)/teamCounts.length:0;
 const delta=teamAvg?((inside.length-teamAvg)/teamAvg*100):0;
 const retailers=Object.entries(inside.reduce((o,s)=>(o[s.retailer]=(o[s.retailer]||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const managers=Object.entries(inside.reduce((o,s)=>(o[s.manager||'Not listed']=(o[s.manager||'Not listed']||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
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
function simulateAt(lat,lng){simLayer.clearLayers();const icon=L.divIcon({className:'',html:'<div class="sim-icon"></div>',iconSize:[24,24],iconAnchor:[12,12]});simMarker=L.marker([lat,lng],{icon,draggable:true}).addTo(simLayer);simMarker.on('drag',updateSimulation);simMarker.on('dragend',updateSimulation);updateSimulation();simMode=false}
window.simulateAt=simulateAt;
function updateSimulation(){if(!simMarker)return;const p=simMarker.getLatLng(),rad=Number($('radius').value),gaps=stores.filter(s=>!s.covered),gained=gaps.filter(s=>hav(s.lat,s.lng,p.lat,p.lng)<=rad),current=stores.filter(s=>s.covered).length,after=current+gained.length;showDrawer('Simulated New RTS',`<div class="callout">Drag the blue RTS marker to test another location. This planning result does not alter production coverage.</div><div class="grid2"><div class="metric"><small>Current coverage</small><b>${(current/stores.length*100).toFixed(1)}%</b></div><div class="metric"><small>After placement</small><b>${(after/stores.length*100).toFixed(1)}%</b></div><div class="metric"><small>New stores covered</small><b>${gained.length}</b></div><div class="metric"><small>Gaps remaining</small><b>${stores.length-after}</b></div></div><div class="popcard"><strong>Proposed coordinates</strong>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div><button class="btn" onclick="window.exportSimulation()">Export Impact</button>`);window._simGained=gained}
window.exportSimulation=()=>csv(storeRows(window._simGained||[]),'simulated_rts_impact.csv');

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

function startSimulation(){simMode=true;showDrawer('Simulate New RTS','<div class="callout">Click anywhere on the map to place a draggable simulated RTS marker.</div>')}
map.on('click',e=>{if(simMode)simulateAt(e.latlng.lat,e.latlng.lng)});
function openModal(title,html){$('modalTitle').textContent=title;$('modalContent').innerHTML=html;$('modal').classList.add('show')}
function gapClusters(base=stores.filter(s=>!s.covered),rad=75,min=10){const remaining=new Set(base.map(s=>s.siteId)),out=[];for(const seed of base){if(!remaining.has(seed.siteId))continue;const group=base.filter(s=>remaining.has(s.siteId)&&hav(seed.lat,seed.lng,s.lat,s.lng)<=rad);group.forEach(s=>remaining.delete(s.siteId));if(group.length>=min){const lat=group.reduce((a,s)=>a+s.lat,0)/group.length,lng=group.reduce((a,s)=>a+s.lng,0)/group.length;out.push({lat,lng,count:group.length,city:seed.city,state:seed.state,stores:group})}}return out.sort((a,b)=>b.count-a.count)}
function openGapFinder(){const clusters=gapClusters(stores.filter(s=>!s.covered),75,10);openModal('Current Gap Finder',`<div class="callout">Concentrated uncovered store groups based on the current ${$('radius').value}-mile RTS coverage model.</div><div class="tools"><button class="btn" onclick="window.exportGapClusters()">Export Gap Clusters</button></div><div class="tablewrap"><table><thead><tr><th>Rank</th><th>Area</th><th>Uncovered Stores</th><th>Action</th></tr></thead><tbody>${clusters.slice(0,200).map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.city)}, ${esc(c.state)}</td><td>${c.count}</td><td><button class="btn" onclick="window.simulateAt(${c.lat},${c.lng});document.getElementById('modal').classList.remove('show')">Simulate Here</button></td></tr>`).join('')}</tbody></table></div>`);window._clusters=clusters}
window.exportGapClusters=()=>csv((window._clusters||[]).map((c,i)=>({Rank:i+1,City:c.city,State:c.state,Latitude:c.lat,Longitude:c.lng,UncoveredStores:c.count})),'gap_clusters.csv');
function modelPlacement(){let uncovered=stores.filter(s=>!s.covered),chosen=[];for(let i=0;i<25&&uncovered.length;i++){let best=null;for(const c of uncovered){const gain=uncovered.filter(s=>hav(c.lat,c.lng,s.lat,s.lng)<=75);if(!best||gain.length>best.gain.length)best={c,gain}}if(!best||best.gain.length<5)break;chosen.push({lat:best.c.lat,lng:best.c.lng,city:best.c.city,state:best.c.state,gain:best.gain.length});const ids=new Set(best.gain.map(s=>s.siteId));uncovered=uncovered.filter(s=>!ids.has(s.siteId))}openModal('Model New RTS Placement',`<div class="callout">Greedy planning model: each proposed location is selected to cover the largest remaining uncovered store group within 75 miles. Planning only.</div><div class="tools"><button class="btn" onclick="window.exportModel()">Export Model</button></div><div class="tablewrap"><table><thead><tr><th>Rank</th><th>Suggested Area</th><th>New Stores Covered</th><th>Action</th></tr></thead><tbody>${chosen.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.city)}, ${esc(c.state)}</td><td>${c.gain}</td><td><button class="btn" onclick="window.simulateAt(${c.lat},${c.lng});document.getElementById('modal').classList.remove('show')">Simulate</button></td></tr>`).join('')}</tbody></table></div>`);window._model=chosen}
window.exportModel=()=>csv((window._model||[]).map((c,i)=>({Rank:i+1,City:c.city,State:c.state,Latitude:c.lat,Longitude:c.lng,NewStoresCovered:c.gain})),'modeled_rts_placements.csv');
function rollup(key,title){const d={};stores.forEach(s=>{const k=s[key]||'Not listed';d[k]??={name:k,total:0,covered:0,gaps:0};d[k].total++;s.covered?d[k].covered++:d[k].gaps++});const rows=Object.values(d).sort((a,b)=>b.gaps-a.gaps);openModal(title,`<div class="tools"><button class="btn" onclick="window.exportRollup()">Export Rollup</button></div><div class="tablewrap"><table><thead><tr><th>${title.replace(' Rollups','')}</th><th>Stores</th><th>Covered</th><th>Gaps</th><th>Coverage</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${r.covered}</td><td>${r.gaps}</td><td>${(r.covered/r.total*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>`);window._rollup=rows}
window.exportRollup=()=>csv(window._rollup||[],'coverage_rollup.csv');
function territoryProfiles(){const rows=activeRTS().map(r=>{const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value)),nearest=stores.filter(s=>s.nearest[0]?.id===r.id),avg=inside.length?inside.reduce((a,s)=>a+hav(s.lat,s.lng,r.lat,r.lng),0)/inside.length:0;return {r,inside:inside.length,nearest:nearest.length,avg}}).sort((a,b)=>b.inside-a.inside);openModal('RTS Territory Profiles',`<div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores in Radius</th><th>In-Radius</th><th>Avg Distance</th><th>Review</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.inside}</td><td>${x.nearest}</td><td>${x.avg.toFixed(1)} mi</td><td><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open</button></td></tr>`).join('')}</tbody></table></div>`)}
function compareTerritories(){const opts=activeRTS().map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');openModal('Compare RTS Territories',`<div class="tools"><label>RTS A <select id="cmpA">${opts}</select></label><label>RTS B <select id="cmpB">${opts}</select></label><button class="btn" onclick="window.runCompare()">Compare</button></div><div id="cmpResults"></div>`)}
window.runCompare=()=>{const a=activeRTS().find(r=>String(r.id)==$('cmpA').value),b=activeRTS().find(r=>String(r.id)==$('cmpB').value),rad=Number($('radius').value),A=stores.filter(s=>hav(s.lat,s.lng,a.lat,a.lng)<=rad),B=stores.filter(s=>hav(s.lat,s.lng,b.lat,b.lng)<=rad),idsA=new Set(A.map(s=>s.siteId)),shared=B.filter(s=>idsA.has(s.siteId));$('cmpResults').innerHTML=`<div class="grid2"><div class="metric"><small>${esc(a.name)}</small><b>${A.length}</b></div><div class="metric"><small>${esc(b.name)}</small><b>${B.length}</b></div><div class="metric"><small>Shared stores</small><b>${shared.length}</b></div><div class="metric"><small>Combined unique</small><b>${new Set([...A,...B].map(s=>s.siteId)).size}</b></div></div>`}
function resiliency(){const rows=activeRTS().map(r=>{const owned=stores.filter(s=>s.nearest[0]?.id===r.id),lost=owned.filter(s=>!s.nearest[1]||s.nearest[1].distance>Number($('radius').value));return {r,owned:owned.length,lost:lost.length,backup:owned.length-lost.length}}).sort((a,b)=>b.lost-a.lost);openModal('RTS Resiliency Simulator',`<div class="callout">Shows what happens if an RTS becomes unavailable. “At risk” stores have no second RTS within the selected radius.</div><div class="tablewrap"><table><thead><tr><th>RTS</th><th>In-Radius</th><th>Backup-Covered</th><th>At Risk</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.owned}</td><td>${x.backup}</td><td>${x.lost}</td></tr>`).join('')}</tbody></table></div>`)}


function currentScope(){return filtered}
function scopeLabel(){
 const p=[];
 if($('fCoverage').value)p.push($('fCoverage').value==='covered'?'Covered':'Gaps');
 if($('fRetailer').value)p.push($('fRetailer').value);
 if($('fState').value)p.push($('fState').value);
 if($('fManager').value)p.push($('fManager').value);
 if($('fRts').value)p.push($('fRts').value);
 return p.length?p.join(' · '):'All Premium Merchandising stores';
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
 const scope=currentScope();
 const model=coverageModel(scope);
 const covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const health=territoryHealthV2(scope);
 const high=health.filter(x=>x.score<68).slice(0,8);

 const states=Object.values(scope.reduce((o,s)=>{
   const k=s.state||'Unknown';o[k]??={name:k,total:0,gaps:0};o[k].total++;
   if(model.gaps.some(g=>g.siteId===s.siteId))o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps).slice(0,8);

 const plan=gapClustersV2(scope,8);

 openModal('Printable Leadership Report',`
 <div class="report-actions"><button class="btn primary" onclick="window.print()">Print / Save as PDF</button><button class="btn" onclick="window.exportLeadershipSummary()">Export Summary CSV</button></div>
 <div class="report-shell">
  <div class="report-header"><h1>Premium Merchandising RTS Coverage Summary</h1><p>Scope: ${esc(scopeLabel())} · Radius: ${model.rad} miles · Coverage Model v2</p></div>
  <div class="exec-grid">
   <div class="exec-kpi"><small>Stores reviewed</small><b>${scope.length.toLocaleString()}</b><span>Current filtered scope</span></div>
   <div class="exec-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} covered</span></div>
   <div class="exec-kpi"><small>Network gaps</small><b>${model.gaps.length.toLocaleString()}</b><span>No RTS in range</span></div>
   <div class="exec-kpi"><small>Shared stores</small><b>${model.sharedStores.length.toLocaleString()}</b><span>Two or more RTS in range</span></div>
  </div>
  <section class="report-section"><h2>Leadership interpretation</h2><div class="report-callout">${pct>=80?'Coverage is broadly stable. Focus on workload balance, unique dependency, and isolated remaining gaps.':pct>=60?'Coverage is mixed. Target concentrated network gaps and high in-radius workloads.':'Coverage is materially constrained. Prioritize new RTS placement in the highest-value gap clusters.'}</div></section>
  <section class="report-section"><h2>Highest-gap states</h2><table><thead><tr><th>State</th><th>Stores</th><th>Gaps</th><th>Coverage</th></tr></thead><tbody>${states.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.total}</td><td>${x.gaps}</td><td>${((x.total-x.gaps)/x.total*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></section>
  <section class="report-section"><h2>RTS service areas requiring review</h2>${high.length?high.map(x=>`<div class="balance-rec ${x.cls==='critical'?'high':'watch'}"><h4>${esc(x.r.name)}</h4><p>${x.count} stores within radius · ${x.uniqueCount} unique · ${x.sharedCount} shared · ${x.avgDistance.toFixed(1)} mi average drive.</p></div>`).join(''):'<p>No service areas were flagged under the current scope.</p>'}</section>
  <section class="report-section"><h2>Top hiring opportunities</h2><table><thead><tr><th>Rank</th><th>Suggested Area</th><th>Net-New Stores</th><th>Primary Manager</th><th>Primary Retailer</th></tr></thead><tbody>${plan.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.city)}, ${esc(x.state)}</td><td>${x.gain}</td><td>${esc(x.manager)}</td><td>${esc(x.retailer)}</td></tr>`).join('')}</tbody></table></section>
 </div>`);
 window._leadershipSummary=[{
   Scope:scopeLabel(),Stores:scope.length,Covered:covered,NetworkGaps:model.gaps.length,
   CoveragePercent:pct.toFixed(1),UniqueStores:model.uniqueStores.length,SharedStores:model.sharedStores.length,
   TopHiringArea:plan[0]?`${plan[0].city}, ${plan[0].state}`:'',TopHiringNetNew:plan[0]?.gain||0
 }];
}
window.exportLeadershipSummary=()=>csv(window._leadershipSummary||[],'premium_merchandising_leadership_summary.csv');



function coverageModel(scope=stores){
 return buildCoverageModel({
   stores: scope,
   rts: RTS,
   radiusMiles: Number($('radius').value),
   isRtsEligibleForStore: PROGRAM_ELIGIBILITY
 });
}

function territoryHealthV2(scope=filtered){
 return buildTerritoryHealth({
   stores: scope,
   rts: RTS,
   radiusMiles: Number($('radius').value),
   isRtsEligibleForStore: PROGRAM_ELIGIBILITY
 }).map(item=>({
   ...item,
   r:item.rts,
   avgDistance:item.averageDistance,
   farthest:item.farthestDistance,
   ratio:item.workloadRatio,
   cls:item.className
 }));
}

function gapClustersV2(scope=filtered,limit=25){
 return buildGapPlacementPlan({
   stores: scope,
   rts: RTS,
   radiusMiles: Number($('radius').value),
   limit,
   isRtsEligibleForStore: PROGRAM_ELIGIBILITY
 });
}

function s6Scope(){return filtered}
function s6ScopeName(){return scopeLabel ? scopeLabel() : 'Current filtered scope'}

function s6TerritoryData(scope=s6Scope()){
 const rad=Number($('radius').value),active=activeRTS();
 const counts=active.map(r=>scope.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad).length);
 const avgCount=counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:0;
 return active.map(r=>{const inside=scope.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad);const unique=inside.filter(s=>active.filter(x=>hav(s.lat,s.lng,x.lat,x.lng)<=rad).length===1);const shared=inside.filter(s=>active.filter(x=>hav(s.lat,s.lng,x.lat,x.lng)<=rad).length>=2);const d=inside.map(s=>hav(s.lat,s.lng,r.lat,r.lng));const avgDistance=d.length?d.reduce((a,b)=>a+b,0)/d.length:0;const farthest=d.length?Math.max(...d):0;const ratio=inside.length/Math.max(1,avgCount);let score=100;if(avgDistance>48)score-=22;else if(avgDistance>38)score-=12;else if(avgDistance>28)score-=6;if(ratio>1.6)score-=18;else if(ratio>1.3)score-=10;if(ratio<.45)score-=6;if(unique.length>inside.length*.75&&unique.length>80)score-=12;score=Math.max(0,Math.min(100,score));let health='Excellent',cls='excellent';if(score<50){health='Needs Attention';cls='critical'}else if(score<68){health='Fair';cls='watch'}else if(score<84){health='Good';cls='good'}return {r,inside,owned:inside,ownedCount:inside.length,covered:inside.length,gaps:0,coverage:inside.length?100:0,avgDistance,farthest,backupRisk:unique.length,overlap:shared.length,ratio,score,health,cls,uniqueCount:unique.length,sharedCount:shared.length}}).sort((a,b)=>a.score-b.score||b.ownedCount-a.ownedCount);
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
  ${rows.map(x=>`<div class="s6-rec ${x.cls==='critical'?'high':x.cls==='watch'?'watch':'good'}">
    <h4>${esc(x.r.name)} <span class="s6-tag ${x.cls}">${x.health} · ${x.score.toFixed(0)}/100</span></h4>
    <p>${x.count} stores within radius · ${x.uniqueCount} unique · ${x.sharedCount} shared · ${x.avgDistance.toFixed(1)} mi average distance.</p>
    <div class="s6-health-bar"><span style="width:${x.score}%;background:${x.score>=82?'#16a34a':x.score>=65?'#2563eb':x.score>=45?'#f59e0b':'#dc2626'}"></span></div>
    <div style="margin-top:6px"><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open Territory</button></div>
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

function networkOptimizer(){
 const scope=s6Scope(),health=s6TerritoryData(scope),plan=s6CandidatePlan(scope,8);
 const overloaded=health.filter(x=>x.ratio>=1.3||x.uniqueCount>=120).slice(0,8);
 openModal('Network Optimizer',`<div class="s6-hero"><h2>Recommended Network Actions</h2><p><b>Scope:</b> ${esc(s6ScopeName())}. Each RTS service area is every store within the selected ${$('radius').value}-mile radius. Stores outside all active RTS radii are network gaps requiring added placement.</p></div><div class="s6-two"><div class="s6-section"><h3>Priority new-hire locations</h3>${plan.slice(0,8).map(x=>`<div class="s6-row"><span class="s6-rank">${x.rank}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>${esc(x.manager)} · ${esc(x.retailer)}</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.gain}</button></div>`).join('')}</div><div class="s6-section"><h3>High in-radius workloads</h3>${overloaded.length?overloaded.map((x,i)=>`<div class="s6-row"><span class="s6-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.ownedCount} stores in radius · ${x.uniqueCount} uniquely dependent</span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Review</button></div>`).join(''):'<div class="callout">No unusually high in-radius workloads were identified.</div>'}</div></div><div class="s6-section"><h3>Network interpretation</h3><div class="callout">Out-of-radius stores are not assigned to the nearest RTS. They remain network gaps and are addressed through new placement. Shared stores may legitimately appear in more than one RTS service area.</div></div>`);
 window._optimizerPlan=plan;
}
window.exportTransfer=i=>{
 const m=(window._optimizerMoves||[])[i];if(!m)return;
 csv(m.stores.map(s=>({FromRTS:m.from.r.name,ToRTS:m.to.r.name,SiteID:s.siteId,Retailer:s.retailer,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,DistanceToReceivingRTS:hav(s.lat,s.lng,m.to.r.lat,m.to.r.lng).toFixed(1)})),`transfer_${m.from.r.name.replace(/\W+/g,'_')}_to_${m.to.r.name.replace(/\W+/g,'_')}.csv`);
};

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

function search(){
 const raw=$('search').value.trim(),q=raw.toLowerCase();
 selectedSearch=-1;
 if(!q){$('results').classList.remove('show');return}

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
   map.flyTo([h.obj.lat,h.obj.lng],12,{duration:.7});
   setTimeout(()=>markerById.get(h.obj.siteId)?.openPopup(),450);
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
 const rows=v4Health(stores);
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
  ${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.count}</td><td>${x.uniqueCount}</td><td>${x.sharedCount}</td><td>${x.avgDistance.toFixed(1)}</td><td>${x.farthest.toFixed(1)}</td><td>${x.score.toFixed(0)} · ${esc(x.health)}</td></tr>`).join('')}
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
 const states=Object.values(scope.reduce((o,s)=>{
   const k=s.state||'Unknown';o[k]??={state:k,total:0,gaps:0};o[k].total++;
   if(model.gaps.some(g=>g.siteId===s.siteId))o[k].gaps++;return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);
 const workload=[...health].sort((a,b)=>b.count-a.count)[0];
 $('v41FocusScope').textContent=scopeLabel();
 $('v41FocusGap').textContent=states[0]?`${states[0].state} · ${states[0].gaps.toLocaleString()} gaps`:'No gaps';
 $('v41FocusWorkload').textContent=workload?`${workload.r.name} · ${workload.count} stores`:'No RTS';
 $('v41FocusHire').textContent=plan[0]?`${plan[0].city}, ${plan[0].state||''} · +${plan[0].gain}`:'No qualifying cluster';
 $('v41FocusAction').textContent=model.gaps.length?`Review ${plan[0]?.city||states[0]?.state||'largest gap'}`:'Monitor workload and resiliency';
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
   if(s.manager)row.managers.add(s.manager);
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
   ${rows.map(r=>`<tr class="v62-click-row" onclick="window.v62FocusState(${JSON.stringify(r.name)})"><td><b>${esc(r.name)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.unique}</td><td>${r.shared}</td><td>${r.managerCount}</td><td>${r.retailerCount}</td><td>↗</td></tr>`).join('')}
  </tbody></table></div>`);
}
window.v6FocusState=state=>{
 const el=$('fState');if(el){[...el.options].forEach(o=>o.selected=o.value===state);applyFilters()}
 $('modal').classList.remove('show');fitResults();
};

function v6ManagerRows(){
 const model=v6ScopeModel(),gapIds=new Set(model.gaps.map(s=>s.siteId));
 return Object.values(filtered.reduce((o,s)=>{
   const key=s.manager||'Not listed';
   o[key]??={name:key,total:0,covered:0,gaps:0,unique:0,shared:0,states:new Set(),retailers:new Set()};
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
function v6OpenManagerIntelligence(){
 const rows=v6ManagerRows();
 openModal('Manager Intelligence',`
  <div class="v6-hero"><h2>Manager Coverage Overview</h2><p>Coverage, gap exposure, unique dependency, retailer complexity, and geographic breadth for the selected scope.</p></div>
  <div class="tablewrap"><table><thead><tr><th>Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>Unique</th><th>Shared</th><th>States</th><th>Retailers</th><th></th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="v62-click-row" onclick="window.v62FocusManager(${JSON.stringify(r.name)})"><td><b>${esc(r.name)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.unique}</td><td>${r.shared}</td><td>${r.stateCount}</td><td>${r.retailerCount}</td><td>↗</td></tr>`).join('')}
  </tbody></table></div>`);
}
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
   <div class="v6-kpi"><small>Manager</small><b>${esc(s.manager||'Not listed')}</b><span>${esc(s.market||'Market not listed')}</span></div>
   <div class="v6-kpi"><small>Team Exposure</small><b>${esc((s.dedicatedTeams||[]).join(', ')||'Core')}</b><span>${esc(v4ProgramLabel())}</span></div>
  </div>
  <div class="v4-two">
   <div class="v4-panel"><h3>Eligible RTS ranking</h3>${ranked.slice(0,8).map((r,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(r.name)}</b><br>${esc(r.email||'')}</span><span>${r.distance.toFixed(1)} mi</span></div>`).join('')}</div>
   <div class="v4-panel"><h3>Nearby store concentration</h3>${nearby.slice(0,8).map((x,i)=>`<div class="v4-list-row"><span class="v4-rank">${i+1}</span><span><b>${esc(x.retailer)} #${esc(x.storeNumber)}</b><br>${esc(x.city)}, ${esc(x.state)}</span><span>${hav(s.lat,s.lng,x.lat,x.lng).toFixed(1)} mi</span></div>`).join('')||'<div class="callout">No nearby stores within 25 miles.</div>'}</div>
  </div>
  <div class="actions"><button class="btn primary" onclick="window.simulateAt(${s.lat},${s.lng});document.getElementById('modal').classList.remove('show')">Simulate RTS Here</button><button class="btn" onclick="window.v6FocusManager(${JSON.stringify(s.manager||'Not listed')})">Open Manager</button></div>`);
}
window.v6OpenStoreIntelligence=v6OpenStoreIntelligence;

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
 v62ApplySingleFilter('fState',state);
}
function v62FocusManager(manager){
 $('modal').classList.remove('show');
 v62ApplySingleFilter('fManager',manager);
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
   if(s.manager)r.managers.add(s.manager);if(s.retailer)r.retailers.add(s.retailer);return o;
 },{})).map(r=>({...r,coverage:r.total?(r.total-r.gaps)/r.total*100:0})).sort((a,b)=>b.gaps-a.gaps);

 const byManager=Object.values(filtered.reduce((o,s)=>{
   const k=s.manager||'Not listed';o[k]??={key:k,total:0,gaps:0,states:new Set(),retailers:new Set()};
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
    ${byState.map(r=>`<tr class="v62-click-row" onclick="window.v62FocusState(${JSON.stringify(r.key)})"><td><b>${esc(r.key)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.managers.size}</td><td>${r.retailers.size}</td></tr>`).join('')}
   </tbody></table></div>
  </div>
  <div id="v62GapManagerPane" class="v62-gap-pane" hidden>
   <div class="tablewrap"><table><thead><tr><th>Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>States</th><th>Retailers</th></tr></thead><tbody>
    ${byManager.map(r=>`<tr class="v62-click-row" onclick="window.v62FocusManager(${JSON.stringify(r.key)})"><td><b>${esc(r.key)}</b></td><td>${r.total}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.states.size}</td><td>${r.retailers.size}</td></tr>`).join('')}
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
  <div class="tools"><button class="btn primary" onclick="window.v62SaveScenario()">Save Current Top-10 Plan</button></div>
  ${scenarios.length?scenarios.map((s,i)=>`<div class="v62-scenario-card">
   <h4>${esc(s.name)}</h4><p>${esc(s.scope)} · ${s.radius} miles · ${s.currentCoverage.toFixed(1)}% starting coverage · ${s.placements.length} placements</p>
   <div class="actions"><button class="btn" onclick="window.v62OpenScenario(${i})">Open on Map</button><button class="btn" onclick="window.v62ExportScenario(${i})">Export</button><button class="btn" onclick="window.v62DeleteScenario(${i})">Delete</button></div>
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

function v62InstallClickableDrilldowns(){
 document.addEventListener('click',e=>{
   const card=e.target.closest('[data-drill-type]');
   if(!card)return;
   const type=card.dataset.drillType,value=card.dataset.drillValue;
   if(type==='state')v62FocusState(value);
   if(type==='manager')v62FocusManager(value);
   if(type==='rts')v62FocusRts(value);
   if(type==='store')v62FocusStore(value);
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
function v7OrgForStore(store){
 const area=store.areaManager||store.manager||'Not listed';
 const regional=store.regionalManager||ORG_HIERARCHY.rdmToRegionalManager?.[v7NormalizeName(area)]||'Unaligned';
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
function v7RegionalDashboard(rmName){
 const rm=(ORG_HIERARCHY.regionalManagers||[]).find(x=>x.name===rmName);
 const scope=v7StoresForRegional(rmName),model=v7ModelForStores(scope),covered=scope.length-model.gaps.length;
 const pct=scope.length?covered/scope.length*100:0;
 const rdmRows=(rm?.areaManagers||[]).map(r=>{
   const s=v7StoresForArea(r.name),m=v7ModelForStores(s),c=s.length-m.gaps.length;
   return {...r,stores:s.length,gaps:m.gaps.length,coverage:s.length?c/s.length*100:0};
 }).sort((a,b)=>b.gaps-a.gaps||b.stores-a.stores);
 const metrics=rm?.metrics||{};
 openModal(`Regional Manager — ${rmName}`,`
  ${v7Breadcrumb([{label:'National',action:'window.v7OpenOrganizationNavigator()'},{label:rmName,action:'void(0)'}])}
  <div class="v7-hero"><h2>${esc(rmName)}</h2><p>${rdmRows.length} Area Managers · ${scope.length.toLocaleString()} stores</p></div>
  <div class="v7-metrics">
   ${v7MetricCard('Coverage',pct.toFixed(1)+'%',`${model.gaps.length} gaps`)}
   ${v7MetricCard('SO Executed',metrics.soExecuted!=null?metrics.soExecuted.toFixed(2)+'%':'—')}
   ${v7MetricCard('Compliance',metrics.compliance!=null?metrics.compliance.toFixed(2)+'%':'—')}
   ${v7MetricCard('Action Hours Utilized',metrics.actionHoursUtilized!=null?metrics.actionHoursUtilized.toFixed(2)+'%':'—')}
   ${v7MetricCard('Efficiency Gained',metrics.efficiencyGained!=null?metrics.efficiencyGained.toFixed(2)+'%':'—')}
  </div>
  <div class="tablewrap"><table><thead><tr><th>Area Manager</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>SO Executed</th><th>Compliance</th></tr></thead><tbody>
   ${rdmRows.map(r=>`<tr class="v62-click-row" onclick="window.v7AreaDashboard(${JSON.stringify(r.name)})"><td><b>${esc(r.name)}</b></td><td>${r.stores}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.metrics?.soExecuted!=null?r.metrics.soExecuted.toFixed(2)+'%':'—'}</td><td>${r.metrics?.compliance!=null?r.metrics.compliance.toFixed(2)+'%':'—'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="actions"><button class="btn primary" onclick="window.v7ApplyRegionalFilter(${JSON.stringify(rmName)})">Show Region on Map</button><button class="btn" onclick="window.v7ExportRegional(${JSON.stringify(rmName)})">Export</button></div>`);
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
 if(ACTIVE_PROGRAM_ID!=='one-walmart'){
  openModal('Organization Navigator','<div class="callout">The Regional Manager / Area Manager hierarchy supplied is for One Walmart. Switch to One Walmart to use this navigator.</div>');return;
 }
 const rows=(ORG_HIERARCHY.regionalManagers||[]).map(r=>{
   const scope=v7StoresForRegional(r.name),model=v7ModelForStores(scope),covered=scope.length-model.gaps.length;
   return {...r,stores:scope.length,gaps:model.gaps.length,coverage:scope.length?covered/scope.length*100:0};
 }).sort((a,b)=>b.gaps-a.gaps||b.stores-a.stores);
 openModal('Organization Navigator',`
  ${v7Breadcrumb([{label:'National',action:'void(0)'}])}
  <div class="v7-hero"><h2>One Walmart Organization</h2><p>National → Regional Manager → Area Manager/RDM → RTS → Store</p></div>
  <div class="tablewrap"><table><thead><tr><th>Regional Manager</th><th>Area Managers</th><th>Stores</th><th>Coverage</th><th>Gaps</th><th>SO Executed</th><th>Compliance</th></tr></thead><tbody>
   ${rows.map(r=>`<tr class="v62-click-row" onclick="window.v7RegionalDashboard(${JSON.stringify(r.name)})"><td><b>${esc(r.name)}</b></td><td>${r.areaManagers.length}</td><td>${r.stores}</td><td>${r.coverage.toFixed(1)}%</td><td>${r.gaps}</td><td>${r.metrics?.soExecuted!=null?r.metrics.soExecuted.toFixed(2)+'%':'—'}</td><td>${r.metrics?.compliance!=null?r.metrics.compliance.toFixed(2)+'%':'—'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="actions"><button class="btn" onclick="window.v7ExportNational()">Export Hierarchy</button></div>`);
}
window.v7OpenOrganizationNavigator=v7OpenOrganizationNavigator;
window.v7RegionalDashboard=v7RegionalDashboard;
window.v7AreaDashboard=v7AreaDashboard;

window.v7ApplyRegionalFilter=rm=>{
 const subset=v7StoresForRegional(rm);filtered=[...subset];renderAll();$('modal').classList.remove('show');if(filtered.length)map.fitBounds(filtered.map(s=>[s.lat,s.lng]),{padding:[30,30]});
};
window.v7ApplyAreaFilter=area=>{
 const subset=v7StoresForArea(area);filtered=[...subset];renderAll();$('modal').classList.remove('show');if(filtered.length)map.fitBounds(filtered.map(s=>[s.lat,s.lng]),{padding:[30,30]});
};
window.v7ExportRegional=rm=>csv(v7StoresForRegional(rm).map(s=>({RegionalManager:rm,AreaManager:s.areaManager,SiteID:s.siteId,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,Coverage:s.coverageType})),'regional_'+rm.replace(/\W+/g,'_')+'.csv');
window.v7ExportArea=area=>csv(v7StoresForArea(area).map(s=>({RegionalManager:s.regionalManager,AreaManager:area,SiteID:s.siteId,StoreNumber:s.storeNumber,Address:s.address,City:s.city,State:s.state,ZIP:s.zip,Coverage:s.coverageType})),'area_'+area.replace(/\W+/g,'_')+'.csv');
window.v7ExportNational=()=>csv((ORG_HIERARCHY.regionalManagers||[]).flatMap(r=>(r.areaManagers||[]).map(a=>({RegionalManager:r.name,AreaManager:a.name,SOExecuted:a.metrics?.soExecuted??'',Compliance:a.metrics?.compliance??'',ActionHoursUtilized:a.metrics?.actionHoursUtilized??'',EfficiencyGained:a.metrics?.efficiencyGained??''}))),'one_walmart_hierarchy.csv');

function init(){initializeDataStatus();stores=RAW_STORES.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))).map(s=>calculate({...s,lat:Number(s.lat),lng:Number(s.lng)}));stores.forEach(s=>markerById.set(s.siteId,storeMarker(s)));options('fRetailer',uniq(stores.map(s=>s.retailer)));options('fState',uniq(stores.map(s=>s.state)));options('fManager',uniq(stores.map(s=>s.manager)));options('fRts',uniq(activeRTS().map(r=>r.name)));drawRts();applyFilters();drawTerritories();fit();$('status').style.display='none'}
['fCoverage','fRetailer','fState','fManager','fRts','cluster','heat','overlap','within','territories','territoryLabels'].forEach(id=>$(id).addEventListener('change',applyFilters));$('showRts').onchange=drawRts;$('territories').onchange=drawTerritories;$('territoryLabels').onchange=drawTerritories;$('showRings').onchange=drawRts;$('radius').oninput=()=>{$('radiusLbl').textContent=$('radius').value;recompute()};
$('fit').onclick=fit;$('home').onclick=()=>map.setView(HOME.center,HOME.zoom);$('reset').onclick=()=>{['fCoverage','fRetailer','fState','fManager','fRts'].forEach(x=>$(x).value='');$('cluster').checked=true;$('heat').checked=$('territories').checked=$('territoryLabels').checked=$('overlap').checked=$('within').checked=$('showRings').checked=false;$('showRts').checked=true;$('radius').value=75;$('radiusLbl').textContent=75;window.clearHighlight();simLayer.clearLayers();recompute();map.setView(HOME.center,HOME.zoom)};$('clearFilters').onclick=()=>{['fCoverage','fRetailer','fState','fManager','fRts'].forEach(x=>$(x).value='');applyFilters()};$('gapsOnly').onclick=$('railGaps').onclick=()=>{$('fCoverage').value='gap';applyFilters();fit()};$('coveredOnly').onclick=()=>{$('fCoverage').value='covered';applyFilters();fit()};
$('executiveModeBtn').onclick=executiveMode;$('networkOptimizerBtn').onclick=networkOptimizer;$('multiHireBtn').onclick=multiHirePlanner;$('healthBtn').onclick=territoryHealthScores;$('rtmDashboardBtn').onclick=rtmDashboard;$('executiveBtn').onclick=executiveDashboard;
if($('v4ExecutiveHomeBtn'))$('v4ExecutiveHomeBtn').onclick=v4OpenExecutive;
if($('v4ExecutiveBtn'))$('v4ExecutiveBtn').onclick=v4OpenExecutive;
if($('v4BriefBtn'))$('v4BriefBtn').onclick=v4ExecutiveBrief;
if($('v4LeadershipBtn'))$('v4LeadershipBtn').onclick=leadershipReport;
if($('v4RtmBtn'))$('v4RtmBtn').onclick=rtmDashboard;
if($('v4GapHeatBtn'))$('v4GapHeatBtn').onclick=()=>{v4ToggleGapHeat(true);};
if($('v4ProfilesBtn'))$('v4ProfilesBtn').onclick=v4RtsProfiles;
if($('v4HealthBtn'))$('v4HealthBtn').onclick=territoryHealthScores;
if($('v4CompareBtn'))$('v4CompareBtn').onclick=v4CompareRts;
if($('v4HiringBtn'))$('v4HiringBtn').onclick=multiHirePlanner;
if($('v4TimelineBtn'))$('v4TimelineBtn').onclick=v4CoverageTimeline;
if($('v4OptimizerBtn'))$('v4OptimizerBtn').onclick=networkOptimizer;
if($('v4BalancerBtn'))$('v4BalancerBtn').onclick=territoryBalancer;
if($('v4TerritoryReportBtn'))$('v4TerritoryReportBtn').onclick=v4TerritoryReport;
if($('v4ExportSummaryBtn'))$('v4ExportSummaryBtn').onclick=()=>csv([{
 Program:v4ProgramLabel(),Scope:scopeLabel(),Stores:filtered.length,
 CoveragePercent:(filtered.length?(filtered.length-v4Model(filtered).gaps.length)/filtered.length*100:0).toFixed(1),
 NetworkGaps:v4Model(filtered).gaps.length,UniqueStores:v4Model(filtered).uniqueStores.length,
 SharedStores:v4Model(filtered).sharedStores.length
}],'psp_executive_summary.csv');
if($('v4GapHeatToggle'))$('v4GapHeatToggle').onchange=e=>v4ToggleGapHeat(e.target.checked);

v5SafeBind('v7OrganizationBtn',v7OpenOrganizationNavigator,'Organization Navigator');
v5SafeBind('v62ExecutiveBtn',v6OpenExecutiveIntelligence,'Executive Overview');
v5SafeBind('v62ShowGapsBtn',()=>{$('gapsOnly').click();v41OperationalFocus()},'Show Uncovered');
v5SafeBind('v62OperationalBtn',v41OperationalFocusModal,'Operational Focus');
v5SafeBind('v62GapSummaryBtn',v62GapSummary,'Gap Summary');
v5SafeBind('v62StateBtn',v6OpenStateIntelligence,'State / Territory Intelligence');
v5SafeBind('v62ManagerBtn',v6OpenManagerIntelligence,'Manager Intelligence');
v5SafeBind('v62RtsBtn',v4RtsProfiles,'RTS Profiles');
v5SafeBind('v62StoreBtn',()=>{$('search').focus();openModal('Store Intelligence','<div class="callout">Search for a store, open its popup, and choose Store Intelligence.</div>')},'Store Intelligence');
v5SafeBind('v62DedicatedBtn',v41DedicatedAnalysis,'Dedicated Teams');
v5SafeBind('v62ResiliencyBtn',resiliencySimulator,'Resiliency');
v5SafeBind('v62SimulateBtn',simulate,'Simulate New RTS');
v5SafeBind('v62OptimizerBtn',networkOptimizer,'Optimize Network');
v5SafeBind('v62MultiHireBtn',multiHirePlanner,'Multi-Hire Plan');
v5SafeBind('v62CompareBtn',v4CompareRts,'Compare RTS');
v5SafeBind('v62TimelineBtn',v4CoverageTimeline,'Coverage Timeline');
v5SafeBind('v62SavedPlansBtn',v62SavedScenarios,'Saved Scenarios');
v5SafeBind('v62BriefBtn',v4ExecutiveBrief,'Executive Brief');
v5SafeBind('v62LeadershipBtn',leadershipReport,'Leadership Report');
v5SafeBind('v62TerritoryReportBtn',v4TerritoryReport,'Territory Report');
v5SafeBind('v62HealthBtn',territoryHealthScores,'Coverage Health');
v5SafeBind('v62BalancerBtn',territoryBalancer,'Territory Balancer');
v5SafeBind('v62RetailerBtn',retailerRollups,'Retailer Rollups');
v5SafeBind('v62SavedViewsBtn',v41SavedViews,'Saved Views');
v5SafeBind('v62HelpBtn',v41Help,'Help / Guide');
v62InstallClickableDrilldowns();
v5SafeBind('v6ExecutiveIntelligenceBtn',v6OpenExecutiveIntelligence,'Executive Intelligence');
v5SafeBind('v6StateIntelligenceBtn',v6OpenStateIntelligence,'State / Territory Intelligence');
v5SafeBind('v6ManagerIntelligenceBtn',v6OpenManagerIntelligence,'Manager Intelligence');
v5SafeBind('v6StoreFinderBtn',()=>{$('search').focus();openModal('Store Intelligence',`<div class="callout">Search by store number, address, city, ZIP, SiteID, or MDM ID. Select a store result, then choose <b>Store Intelligence</b> from its popup.</div>`)},'Store Intelligence');
v5SafeBind('v6HistoricalBtn',v6HistoricalReadiness,'Historical Trends');
v5SafeBind('v41ShowGapsBtn',()=>{$('gapsOnly').click();v41OperationalFocus()},'Show Uncovered');
v5SafeBind('v41ShowCoveredBtn',()=>{$('coveredOnly').click();v41OperationalFocus()},'Show Covered');
v5SafeBind('v41DedicatedGapsBtn',v41DedicatedGapsQuick,'Dedicated Gaps');
v5SafeBind('v41OperationalFocusBtn',v41OperationalFocusModal,'Operational Focus');
v5SafeBind('v41CopyViewBtn',v41CopyViewLink,'Copy View Link');
v5SafeBind('v41SavedViewsBtn',v41SavedViews,'Saved Views');
v5SafeBind('v41DedicatedExposureBtn',v41DedicatedAnalysis,'Dedicated Team Exposure');
v5SafeBind('v41ManagerRollupBtn',managerRollups,'Manager Rollups');
v5SafeBind('v41GapFinderBtn',gapFinder,'Current Gap Finder');
v5SafeBind('v41PlacementBtn',modelPlacement,'Model New RTS Placement');
v5SafeBind('v41ResiliencyBtn',resiliencySimulator,'RTS Resiliency');
v5SafeBind('v41HelpBtn',v41Help,'Help / Workflow Guide');
v5SafeBind('v41FocusRefresh',v41OperationalFocus,'Refresh Operational Focus');
v5SafeBind('v41FocusGapCard',gapFinder,'Largest Gap Signal');
v5SafeBind('v41FocusWorkloadCard',territoryHealthScores,'Highest RTS Workload');
v5SafeBind('v41FocusHireCard',modelPlacement,'Top Placement Opportunity');
v5SafeBind('v41FocusActionCard',v41OperationalFocusModal,'Recommended Action');
setTimeout(()=>{v41OperationalFocus();v41LoadUrlView();const p=localStorage.getItem('psp_v41_pending_view');if(p){localStorage.removeItem('psp_v41_pending_view');v41ApplyViewState(JSON.parse(p));}},500);

if($('v4CoverageRingsToggle'))$('v4CoverageRingsToggle').onchange=e=>v4ToggleRings(e.target.checked);
$('leadershipReportBtn').onclick=leadershipReport;$('balanceBtn').onclick=territoryBalancer;$('hiringPlanBtn').onclick=hiringRecommendationPlan;$('simulateBtn').onclick=$('railSim').onclick=startSimulation;$('modelBtn').onclick=$('railModel').onclick=modelPlacement;if($('railExecutive'))$('railExecutive').onclick=executiveMode;$('gapFinderBtn').onclick=openGapFinder;$('territoryBtn').onclick=$('railTerritory').onclick=territoryProfiles;$('compareBtn').onclick=compareTerritories;$('resiliencyBtn').onclick=resiliency;$('managerBtn').onclick=()=>rollup('manager','Manager Rollups');$('retailerBtn').onclick=()=>rollup('retailer','Retailer Rollups');
v5StartupDiagnostics();
$('exportStores').onclick=()=>csv(storeRows(filtered),'visible_stores.csv');$('exportGaps').onclick=()=>csv(storeRows(stores.filter(s=>!s.covered)),'current_coverage_gaps.csv');
$('panelBtn').onclick=$('hidePanel').onclick=()=>{$('workspace').classList.toggle('closed');setTimeout(()=>map.invalidateSize(),220)};$('drawerClose').onclick=()=>{$('drawer').classList.remove('show');window.clearHighlight()};$('modalClose').onclick=()=>$('modal').classList.remove('show');$('search').oninput=search;$('clearSearch').onclick=()=>{$('search').value='';$('results').classList.remove('show')};$('search').onkeydown=e=>{if(e.key==='Enter'&&($('search')._hits||[]).length){e.preventDefault();selectHit(($('search')._hits||[])[0])}};document.addEventListener('click',e=>{if(!e.target.closest('.search'))$('results').classList.remove('show')});initializeProgramSwitcher({
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
} catch (error) {
  console.error('[V5] Startup failed',error);
  setDataStatus('error','Startup failed');
  const status=document.getElementById('status');
  if(status){
    status.style.display='flex';
    status.innerHTML=`<div class="data-error-panel">
      <b>Platform startup failed.</b><br><br>
      ${String(error.message||error)}
      <br><br>
      Open the browser console for the exact file and line. The most common causes are an incomplete upload or an older cached JavaScript file.
    </div>`;
  }
}
