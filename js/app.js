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
const HOME = ACTIVE_PROGRAM.home;
const $=x=>document.getElementById(x), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map=L.map('map',{zoomControl:true,inertia:true}).setView(HOME.center,HOME.zoom);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
const clusterLayer=L.markerClusterGroup({disableClusteringAtZoom:12,chunkedLoading:true,showCoverageOnHover:false}),plainLayer=L.layerGroup(),rtsLayer=L.layerGroup().addTo(map),ringLayer=L.layerGroup().addTo(map),highlightLayer=L.layerGroup().addTo(map),simLayer=L.layerGroup().addTo(map),territoryLayer=L.layerGroup().addTo(map),territoryLabelLayer=L.layerGroup().addTo(map);
map.addLayer(clusterLayer);let heatLayer=null,stores=[],filtered=[],markerById=new Map(),simMarker=null,simMode=false,selectedSearch=-1;
function hav(a,b,c,d){return haversineMiles(a,b,c,d)}
function activeRTS(){return RTS.filter(r=>r.active)}
function calculate(s){const near=activeRTS().map(r=>({...r,distance:hav(s.lat,s.lng,r.lat,r.lng)})).sort((a,b)=>a.distance-b.distance);s.nearest=near.slice(0,3);s.coverCount=near.filter(r=>r.distance<=Number($('radius')?.value||75)).length;s.covered=s.coverCount>0;return s}
function recompute(){stores.forEach(calculate);applyFilters();drawRts();updateMetrics();drawTerritories()}
function uniq(a){return [...new Set(a.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function options(id,vals){const e=$(id);vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;e.appendChild(o)})}
function storeMarker(s){const color=s.covered?'#16a34a':'#dc2626',icon=L.divIcon({className:'',html:`<div class="store-dot" style="background:${color}"></div>`,iconSize:[11,11],iconAnchor:[5,5]});const m=L.marker([s.lat,s.lng],{icon}).bindPopup(()=>storePopup(s),{maxWidth:440,autoPanPadding:[80,80]});m.on('click',()=>{map.flyTo([s.lat,s.lng],Math.max(11,map.getZoom()),{duration:.55})});return m}
function storePopup(s){
 const addr=s.address?esc(s.address):'<span style="color:#94a3b8">Street address unavailable in matched master list</span>';
 const nearest=s.nearest.map((r,i)=>`<div class="s2-near-row ${i===0?'primary':''}">
   <span class="s2-rank">${i+1}</span>
   <span><span class="s2-near-name">${esc(r.name)}</span><span class="s2-near-email">${esc(r.email)}</span></span>
   <span class="s2-near-dist">${r.distance.toFixed(1)} mi</span>
 </div>`).join('');
 const nearestName=s.nearest[0]?.name||'No active RTS';
 const nearestDistance=s.nearest[0]?.distance;
 return `<div class="popup sprint2-popup">
   <div class="s2-popup-head">
     <div class="s2-popup-headline">
       <div class="s2-popup-title">${esc(s.retailer)} #${esc(s.storeNumber||'—')}</div>
       <span class="badge ${s.covered?'covered':'gap'}">${s.covered?'Covered':'Gap'}</span>
     </div>
     <div class="s2-popup-address">📍 ${addr}<br>${esc(s.city)}, ${esc(s.state)} ${esc(s.zip)}</div>
     <div class="s2-popup-meta">Store # ${esc(s.storeNumber||'—')} · SiteID ${esc(s.siteId)}</div>
   </div>
   <div class="s2-popup-scroll">
     <div class="s2-grid">
       <div class="s2-card">
         <span class="s2-label">Manager</span>
         <div class="s2-value">${esc(s.manager||'Not listed')}${s.managerEmail?`<br>${esc(s.managerEmail)}`:''}</div>
       </div>
       <div class="s2-card">
         <span class="s2-label">Coverage status</span>
         <div class="s2-value">${s.covered?`Within ${$('radius').value} miles`:'Outside current radius'}${Number.isFinite(nearestDistance)?`<br>${nearestDistance.toFixed(1)} mi to ${esc(nearestName)}`:''}</div>
       </div>
       <div class="s2-card full">
         <span class="s2-label">Nearest Premium Merchandising RTS</span>
         <div class="s2-nearest">${nearest}</div>
       </div>
     </div>
   </div>
   <div class="s2-popup-actions">
     <button class="btn primary" onclick="window.openTerritory('${esc(s.nearest[0]?.id||'')}')">Open RTS Territory</button>
     <button class="btn" onclick="window.simulateAt(${s.lat},${s.lng})">Simulate RTS Here</button>
     <button class="btn" onclick="window.showNearbyStores('${esc(s.siteId)}')">View Nearby Stores</button>
   </div>
 </div>`;
}
function drawRts(){
 rtsLayer.clearLayers();
 ringLayer.clearLayers();
 if($('showRts').checked)activeRTS().forEach(r=>{
   const owned=stores.filter(s=>s.nearest[0]?.id===r.id);
   const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value));
   const coveredOwned=owned.filter(s=>s.covered).length;
   const coveragePct=owned.length?coveredOwned/owned.length*100:0;
   const icon=L.divIcon({className:'',html:'<div class="rts-icon"></div>',iconSize:[22,22],iconAnchor:[11,11]});
   const hover=`<div class="s2-hover">
     <b>${esc(r.name)}</b>
     <span>Premium Merchandising RTS</span>
     <div class="s2-hover-grid">
       <div><small>In-radius stores</small><strong>${owned.length}</strong></div>
       <div><small>Inside radius</small><strong>${inside.length}</strong></div>
       <div><small>Coverage</small><strong>${coveragePct.toFixed(1)}%</strong></div>
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

function init(){initializeDataStatus();stores=RAW_STORES.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))).map(s=>calculate({...s,lat:Number(s.lat),lng:Number(s.lng)}));stores.forEach(s=>markerById.set(s.siteId,storeMarker(s)));options('fRetailer',uniq(stores.map(s=>s.retailer)));options('fState',uniq(stores.map(s=>s.state)));options('fManager',uniq(stores.map(s=>s.manager)));options('fRts',uniq(activeRTS().map(r=>r.name)));drawRts();applyFilters();drawTerritories();fit();$('status').style.display='none'}
['fCoverage','fRetailer','fState','fManager','fRts','cluster','heat','overlap','within','territories','territoryLabels'].forEach(id=>$(id).addEventListener('change',applyFilters));$('showRts').onchange=drawRts;$('territories').onchange=drawTerritories;$('territoryLabels').onchange=drawTerritories;$('showRings').onchange=drawRts;$('radius').oninput=()=>{$('radiusLbl').textContent=$('radius').value;recompute()};
$('fit').onclick=fit;$('home').onclick=()=>map.setView(HOME.center,HOME.zoom);$('reset').onclick=()=>{['fCoverage','fRetailer','fState','fManager','fRts'].forEach(x=>$(x).value='');$('cluster').checked=true;$('heat').checked=$('territories').checked=$('territoryLabels').checked=$('overlap').checked=$('within').checked=$('showRings').checked=false;$('showRts').checked=true;$('radius').value=75;$('radiusLbl').textContent=75;window.clearHighlight();simLayer.clearLayers();recompute();map.setView(HOME.center,HOME.zoom)};$('clearFilters').onclick=()=>{['fCoverage','fRetailer','fState','fManager','fRts'].forEach(x=>$(x).value='');applyFilters()};$('gapsOnly').onclick=$('railGaps').onclick=()=>{$('fCoverage').value='gap';applyFilters();fit()};$('coveredOnly').onclick=()=>{$('fCoverage').value='covered';applyFilters();fit()};
$('executiveModeBtn').onclick=executiveMode;$('networkOptimizerBtn').onclick=networkOptimizer;$('multiHireBtn').onclick=multiHirePlanner;$('healthBtn').onclick=territoryHealthScores;$('rtmDashboardBtn').onclick=rtmDashboard;$('executiveBtn').onclick=executiveDashboard;$('leadershipReportBtn').onclick=leadershipReport;$('balanceBtn').onclick=territoryBalancer;$('hiringPlanBtn').onclick=hiringRecommendationPlan;$('simulateBtn').onclick=$('railSim').onclick=startSimulation;$('modelBtn').onclick=$('railModel').onclick=modelPlacement;if($('railExecutive'))$('railExecutive').onclick=executiveMode;$('gapFinderBtn').onclick=openGapFinder;$('territoryBtn').onclick=$('railTerritory').onclick=territoryProfiles;$('compareBtn').onclick=compareTerritories;$('resiliencyBtn').onclick=resiliency;$('managerBtn').onclick=()=>rollup('manager','Manager Rollups');$('retailerBtn').onclick=()=>rollup('retailer','Retailer Rollups');
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
  console.error(error);
  setDataStatus('error','Data failed to load');
  const status = document.getElementById("status");
  if (status) {
    status.style.display = "flex";
    status.innerHTML = `<div class="data-error-panel"><b>Map startup failed.</b><br>${String(error.message || error)}<br><br>Confirm that <code>data/stores.json</code>, <code>data/rts.json</code>, and <code>data/metadata.json</code> exist in the GitHub repository and contain valid JSON.</div>`;
  }
}
