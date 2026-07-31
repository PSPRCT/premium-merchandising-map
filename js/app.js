import { loadData } from "./data.js";

const {stores:RAW_STORES,rts:RTS,metadata:DATA_METADATA,warnings:DATA_WARNINGS}=await loadData();const HOME={center:[39.5,-98.35],zoom:5};
const $=x=>document.getElementById(x), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map=L.map('map',{zoomControl:true,inertia:true}).setView(HOME.center,HOME.zoom);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
const clusterLayer=L.markerClusterGroup({disableClusteringAtZoom:12,chunkedLoading:true,showCoverageOnHover:false}),plainLayer=L.layerGroup(),rtsLayer=L.layerGroup().addTo(map),ringLayer=L.layerGroup().addTo(map),highlightLayer=L.layerGroup().addTo(map),simLayer=L.layerGroup().addTo(map),territoryLayer=L.layerGroup().addTo(map),territoryLabelLayer=L.layerGroup().addTo(map);
map.addLayer(clusterLayer);let heatLayer=null,stores=[],filtered=[],markerById=new Map(),simMarker=null,simMode=false,selectedSearch=-1;
function hav(a,b,c,d){const R=3958.7613,t=x=>x*Math.PI/180,dl=t(c-a),dn=t(d-b),q=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
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
       <div><small>Nearest-owned</small><strong>${owned.length}</strong></div>
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
   }).bindTooltip(`<div class="boundary-tooltip"><b>${esc(r.name)}</b><br>${owned.length} nearest-owned stores<br>Click to review territory</div>`,{sticky:true,className:''})
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
 const r=activeRTS().find(x=>String(x.id)===String(id));
 if(!r)return;
 const rad=Number($('radius').value);
 const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad);
 const owned=stores.filter(s=>s.nearest[0]?.id===r.id);
 const ownedCovered=owned.filter(s=>s.covered).length;
 const avg=inside.length?inside.reduce((a,s)=>a+hav(s.lat,s.lng,r.lat,r.lng),0)/inside.length:0;
 const farthestObj=[...inside].sort((a,b)=>hav(b.lat,b.lng,r.lat,r.lng)-hav(a.lat,a.lng,r.lat,r.lng))[0];
 const farthest=farthestObj?hav(farthestObj.lat,farthestObj.lng,r.lat,r.lng):0;
 const overlapCount=inside.filter(s=>s.coverCount>=2).length;
 const q=territoryQuality(owned,inside,avg,farthest,overlapCount);
 const retailers=Object.entries(inside.reduce((o,s)=>(o[s.retailer]=(o[s.retailer]||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const managers=Object.entries(inside.reduce((o,s)=>(o[s.manager||'Not listed']=(o[s.manager||'Not listed']||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const maxRetail=Math.max(1,...retailers.map(x=>x[1])),maxMgr=Math.max(1,...managers.map(x=>x[1]));
 const avgTerritory=stores.length/Math.max(1,activeRTS().length);
 const workloadDelta=avgTerritory?((owned.length-avgTerritory)/avgTerritory*100):0;

 document.body.classList.add('territory-focus');
 highlightLayer.clearLayers();
 inside.forEach(s=>{
   const cm=L.circleMarker([s.lat,s.lng],{
     radius:s.nearest[0]?.id===r.id?6:4,
     color:s.nearest[0]?.id===r.id?'#2563eb':'#16a34a',
     weight:s.nearest[0]?.id===r.id?2.5:1.5,
     fillOpacity:s.nearest[0]?.id===r.id?.82:.52,
     className:'territory-focus-marker'
   }).addTo(highlightLayer);
 });
 map.flyTo([r.lat,r.lng],7,{duration:.6});

 showDrawer(`RTS Territory — ${r.name}`,`
   <div class="s2-drawer-hero">
     <div class="s2-drawer-title">${esc(r.name)}</div>
     <div class="s2-drawer-sub">${esc(r.email)}${r.rtm?`<br>RTM: ${esc(r.rtm)}`:''}</div>
     <span class="s2-score ${q.cls}">Territory quality: ${q.label}</span>
   </div>
   <div class="help-term">
     <b>How to read these territory metrics</b>
     <details>
       <summary>Nearest-owned stores and owned coverage</summary>
       <div style="margin-top:5px">
         <b>Nearest-owned stores</b> are stores for which this RTS is geographically the closest active Premium Merchandising RTS, regardless of whether the store falls inside 75 miles.<br><br>
         <b>Owned coverage</b> is the share of those nearest-owned stores that are also within the selected coverage radius. For example, 80 covered of 102 nearest-owned stores means 22 stores are closest to this RTS but remain outside the current 75-mile routeable radius.
       </div>
     </details>
   </div>
   <div class="s2-kpi-grid">
     <div class="s2-kpi"><small>Nearest-owned stores</small><b>${owned.length}</b><span>${workloadDelta>=0?'▲':'▼'} ${Math.abs(workloadDelta).toFixed(1)}% vs team average</span></div>
     <div class="s2-kpi"><small>Inside ${rad} miles</small><b>${inside.length}</b><span>All stores within radius</span></div>
     <div class="s2-kpi"><small>Owned coverage</small><b>${owned.length?(ownedCovered/owned.length*100).toFixed(1):'0.0'}%</b><span>${ownedCovered} covered of ${owned.length}</span></div>
     <div class="s2-kpi"><small>Average drive</small><b>${avg.toFixed(1)} mi</b><span>Average to stores in radius</span></div>
     <div class="s2-kpi"><small>Farthest store</small><b>${farthest.toFixed(1)} mi</b><span>${farthestObj?`${esc(farthestObj.city)}, ${esc(farthestObj.state)}`:'—'}</span></div>
     <div class="s2-kpi"><small>Overlap stores</small><b>${overlapCount}</b><span>Covered by 2+ RTS</span></div>
   </div>
   <div class="s2-list-card">
     <h4>Retailer mix</h4>
     ${retailers.map(x=>`<div class="s2-bar-row"><span class="s2-bar-label">${esc(x[0])}</span><span class="s2-bar"><span style="width:${x[1]/maxRetail*100}%"></span></span><b>${x[1]}</b></div>`).join('')}
   </div>
   <div class="s2-list-card">
     <h4>Manager mix</h4>
     ${managers.map(x=>`<div class="s2-bar-row"><span class="s2-bar-label">${esc(x[0])}</span><span class="s2-bar"><span style="width:${x[1]/maxMgr*100}%"></span></span><b>${x[1]}</b></div>`).join('')}
   </div>
   <div class="actions">
     <button class="btn primary" onclick="window.exportTerritory('${esc(r.id)}')">Export Territory</button>
     <button class="btn" onclick="window.print()">Print</button>
     <button class="btn" onclick="window.clearHighlight()">Clear Highlight</button>
   </div>
   <div class="tablewrap"><table class="s2-mini-table"><thead><tr><th>Store</th><th>Location</th><th>Distance</th></tr></thead><tbody>
   ${inside.sort((a,b)=>hav(a.lat,a.lng,r.lat,r.lng)-hav(b.lat,b.lng,r.lat,r.lng)).slice(0,500).map(s=>`<tr><td>${esc(s.retailer)} #${esc(s.storeNumber)}</td><td>${esc(s.city)}, ${esc(s.state)}</td><td>${hav(s.lat,s.lng,r.lat,r.lng).toFixed(1)} mi</td></tr>`).join('')}
   </tbody></table></div>
 `);
}
window.openTerritory=openTerritory;window.clearHighlight=()=>{highlightLayer.clearLayers();document.body.classList.remove('territory-focus')};window.exportTerritory=id=>{const r=activeRTS().find(x=>String(x.id)===String(id)),rad=Number($('radius').value);csv(storeRows(stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=rad)),`territory_${r.name.replace(/\W+/g,'_')}.csv`)}
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
function territoryProfiles(){const rows=activeRTS().map(r=>{const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value)),nearest=stores.filter(s=>s.nearest[0]?.id===r.id),avg=inside.length?inside.reduce((a,s)=>a+hav(s.lat,s.lng,r.lat,r.lng),0)/inside.length:0;return {r,inside:inside.length,nearest:nearest.length,avg}}).sort((a,b)=>b.inside-a.inside);openModal('RTS Territory Profiles',`<div class="tablewrap"><table><thead><tr><th>RTS</th><th>Stores in Radius</th><th>Nearest-Owned</th><th>Avg Distance</th><th>Review</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.inside}</td><td>${x.nearest}</td><td>${x.avg.toFixed(1)} mi</td><td><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open</button></td></tr>`).join('')}</tbody></table></div>`)}
function compareTerritories(){const opts=activeRTS().map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');openModal('Compare RTS Territories',`<div class="tools"><label>RTS A <select id="cmpA">${opts}</select></label><label>RTS B <select id="cmpB">${opts}</select></label><button class="btn" onclick="window.runCompare()">Compare</button></div><div id="cmpResults"></div>`)}
window.runCompare=()=>{const a=activeRTS().find(r=>String(r.id)==$('cmpA').value),b=activeRTS().find(r=>String(r.id)==$('cmpB').value),rad=Number($('radius').value),A=stores.filter(s=>hav(s.lat,s.lng,a.lat,a.lng)<=rad),B=stores.filter(s=>hav(s.lat,s.lng,b.lat,b.lng)<=rad),idsA=new Set(A.map(s=>s.siteId)),shared=B.filter(s=>idsA.has(s.siteId));$('cmpResults').innerHTML=`<div class="grid2"><div class="metric"><small>${esc(a.name)}</small><b>${A.length}</b></div><div class="metric"><small>${esc(b.name)}</small><b>${B.length}</b></div><div class="metric"><small>Shared stores</small><b>${shared.length}</b></div><div class="metric"><small>Combined unique</small><b>${new Set([...A,...B].map(s=>s.siteId)).size}</b></div></div>`}
function resiliency(){const rows=activeRTS().map(r=>{const owned=stores.filter(s=>s.nearest[0]?.id===r.id),lost=owned.filter(s=>!s.nearest[1]||s.nearest[1].distance>Number($('radius').value));return {r,owned:owned.length,lost:lost.length,backup:owned.length-lost.length}}).sort((a,b)=>b.lost-a.lost);openModal('RTS Resiliency Simulator',`<div class="callout">Shows what happens if an RTS becomes unavailable. “At risk” stores have no second RTS within the selected radius.</div><div class="tablewrap"><table><thead><tr><th>RTS</th><th>Nearest-Owned</th><th>Backup-Covered</th><th>At Risk</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.r.name)}</td><td>${x.owned}</td><td>${x.backup}</td><td>${x.lost}</td></tr>`).join('')}</tbody></table></div>`)}


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
 const serving=activeRTS().filter(r=>scope.some(s=>s.nearest[0]?.id===r.id));
 const avg=scope.length/Math.max(1,serving.length);
 return serving.map(r=>{
   const owned=scope.filter(s=>s.nearest[0]?.id===r.id);
   const covered=owned.filter(s=>s.covered).length,outside=owned.length-covered;
   const avgDist=owned.length?owned.reduce((a,s)=>a+(s.nearest[0]?.distance||0),0)/owned.length:0;
   const ratio=owned.length/Math.max(1,avg);
   const backupRisk=owned.filter(s=>!s.nearest[1]||s.nearest[1].distance>Number($('radius').value)).length;
   let level='good',action='Balanced — continue monitoring.';
   if(ratio>=1.5||outside>=80||backupRisk>=70){level='high';action='Evaluate added RTS capacity, boundary adjustment, or a new placement near the largest uncovered concentration.'}
   else if(ratio>=1.2||outside>=35||backupRisk>=30){level='watch';action='Review uncovered edge stores and neighboring RTS capacity before the next staffing decision.'}
   else if(ratio<=.5){level='watch';action='Light territory: review whether this RTS can absorb nearby stores or support a neighboring high-load territory.'}
   return {r,owned:owned.length,covered,outside,coverage:owned.length?covered/owned.length*100:0,avgDist,ratio,backupRisk,level,action};
 }).sort((a,b)=>({high:2,watch:1,good:0}[b.level]-{high:2,watch:1,good:0}[a.level])||b.outside-a.outside);
}
function territoryBalancer(){
 const rows=territoryBalanceRows(),high=rows.filter(x=>x.level==='high').length,watch=rows.filter(x=>x.level==='watch').length;
 const avg=rows.length?rows.reduce((a,x)=>a+x.owned,0)/rows.length:0;
 openModal('Territory Balancer',`
 <div class="callout"><b>Scope:</b> ${esc(scopeLabel())}. Workload uses nearest-owned stores in the filtered scope. Recommendations are planning guidance only.</div>
 <div class="balance-grid">
  <div class="balance-card"><small>Serving RTS</small><b>${rows.length}</b><span>RTS represented in scope</span></div>
  <div class="balance-card"><small>Average territory</small><b>${Math.round(avg)}</b><span>Nearest-owned stores</span></div>
  <div class="balance-card"><small>High priority</small><b>${high}</b><span>Capacity or gap review</span></div>
  <div class="balance-card"><small>Watch list</small><b>${watch}</b><span>Monitor or rebalance</span></div>
 </div>
 <div class="tools"><button class="btn" onclick="window.exportBalance()">Export Balance Review</button></div>
 ${rows.map(x=>`<div class="balance-rec ${x.level}"><h4>${esc(x.r.name)} — ${x.owned} nearest-owned stores</h4><p><b>${x.coverage.toFixed(1)}% owned coverage</b> · ${x.outside} outside radius · ${x.avgDist.toFixed(1)} mi average distance · ${x.backupRisk} without backup RTS inside radius.</p><p>${esc(x.action)}</p><div style="margin-top:6px"><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">Open Territory</button></div></div>`).join('')}`);
 window._balanceRows=rows;
}
window.exportBalance=()=>csv((window._balanceRows||[]).map(x=>({RTS:x.r.name,Email:x.r.email,NearestOwned:x.owned,Covered:x.covered,OutsideRadius:x.outside,CoveragePercent:x.coverage.toFixed(1),AverageDistanceMiles:x.avgDist.toFixed(1),BackupRiskStores:x.backupRisk,Priority:x.level,Recommendation:x.action})),'premium_merchandising_territory_balance.csv');

function buildHiringPlan(scope=currentScope(),limit=20){
 let uncovered=scope.filter(s=>!s.covered),chosen=[];
 for(let i=0;i<limit&&uncovered.length;i++){
   let best=null;
   for(const c of uncovered){const gain=uncovered.filter(s=>hav(c.lat,c.lng,s.lat,s.lng)<=75);if(!best||gain.length>best.gain.length)best={c,gain}}
   if(!best||best.gain.length<5)break;
   const managers=Object.entries(best.gain.reduce((o,s)=>(o[s.manager||'Not listed']=(o[s.manager||'Not listed']||0)+1,o),{})).sort((a,b)=>b[1]-a[1]);
   const retailers=Object.entries(best.gain.reduce((o,s)=>(o[s.retailer||'Unknown']=(o[s.retailer||'Unknown']||0)+1,o),{})).sort((a,b)=>b[1]-a[1]);
   chosen.push({rank:i+1,lat:best.c.lat,lng:best.c.lng,city:best.c.city,state:best.c.state,gain:best.gain.length,topManager:managers[0]?.[0]||'',topRetailer:retailers[0]?.[0]||''});
   const ids=new Set(best.gain.map(s=>s.siteId));uncovered=uncovered.filter(s=>!ids.has(s.siteId));
 }
 return chosen;
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
 const scope=currentScope(),covered=scope.filter(s=>s.covered).length,gaps=scope.length-covered,pct=scope.length?covered/scope.length*100:0;
 const high=territoryBalanceRows(scope).filter(x=>x.level==='high').slice(0,8);
 const states=Object.values(scope.reduce((o,s)=>{const k=s.state||'Unknown';o[k]??={name:k,total:0,gaps:0};o[k].total++;if(!s.covered)o[k].gaps++;return o},{})).sort((a,b)=>b.gaps-a.gaps).slice(0,8);
 const plan=buildHiringPlan(scope,8),serving=new Set(scope.map(s=>s.nearest[0]?.id).filter(Boolean)).size;
 openModal('Printable Leadership Report',`
 <div class="report-actions"><button class="btn primary" onclick="window.print()">Print / Save as PDF</button><button class="btn" onclick="window.exportLeadershipSummary()">Export Summary CSV</button></div>
 <div class="report-shell">
  <div class="report-header"><h1>Premium Merchandising RTS Coverage Summary</h1><p>Scope: ${esc(scopeLabel())} · Coverage radius: ${$('radius').value} miles</p></div>
  <div class="exec-grid"><div class="exec-kpi"><small>Stores reviewed</small><b>${scope.length.toLocaleString()}</b><span>Current filtered scope</span></div><div class="exec-kpi"><small>Coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} covered</span></div><div class="exec-kpi"><small>Current gaps</small><b>${gaps.toLocaleString()}</b><span>Outside selected radius</span></div><div class="exec-kpi"><small>Serving RTS</small><b>${serving}</b><span>Nearest RTS in scope</span></div></div>
  <section class="report-section"><h2>Leadership interpretation</h2><div class="report-callout">${pct>=80?'Coverage is broadly stable. Focus on isolated edge gaps, backup coverage, and workload balance.':pct>=60?'Coverage is mixed. Target concentrated gaps and high-load territories.':'Coverage is materially constrained. Prioritize concentrated hiring opportunities and high-load RTS territories.'}</div></section>
  <section class="report-section"><h2>Highest-gap states</h2><table><thead><tr><th>State</th><th>Stores</th><th>Gaps</th><th>Coverage</th></tr></thead><tbody>${states.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.total}</td><td>${x.gaps}</td><td>${((x.total-x.gaps)/x.total*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></section>
  <section class="report-section"><h2>RTS territories requiring review</h2>${high.length?high.map(x=>`<div class="balance-rec ${x.level}"><h4>${esc(x.r.name)}</h4><p>${x.owned} nearest-owned stores · ${x.coverage.toFixed(1)}% owned coverage · ${x.outside} outside radius. ${esc(x.action)}</p></div>`).join(''):'<p>No high-priority territories were identified in this scope.</p>'}</section>
  <section class="report-section"><h2>Top hiring opportunities</h2><table><thead><tr><th>Rank</th><th>Suggested Area</th><th>Net-New Stores</th><th>Primary Manager</th><th>Primary Retailer</th></tr></thead><tbody>${plan.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.city)}, ${esc(x.state)}</td><td>${x.gain}</td><td>${esc(x.topManager)}</td><td>${esc(x.topRetailer)}</td></tr>`).join('')}</tbody></table></section>
 </div>`);
 window._leadershipSummary=[{Scope:scopeLabel(),Stores:scope.length,Covered:covered,Gaps:gaps,CoveragePercent:pct.toFixed(1),ServingRTS:serving,HighPriorityTerritories:high.length,TopHiringArea:plan[0]?`${plan[0].city}, ${plan[0].state}`:'',TopHiringNetNew:plan[0]?.gain||0}];
}
window.exportLeadershipSummary=()=>csv(window._leadershipSummary||[],'premium_merchandising_leadership_summary.csv');

function executiveDashboard(){
 const total=stores.length,covered=stores.filter(s=>s.covered).length,gaps=total-covered,pct=total?covered/total*100:0;
 const territories=activeRTS().map(r=>{
   const owned=stores.filter(s=>s.nearest[0]?.id===r.id);
   const inside=stores.filter(s=>hav(s.lat,s.lng,r.lat,r.lng)<=Number($('radius').value));
   const ownedCovered=owned.filter(s=>s.covered).length;
   const coverage=owned.length?ownedCovered/owned.length*100:0;
   const avg=inside.length?inside.reduce((a,s)=>a+hav(s.lat,s.lng,r.lat,r.lng),0)/inside.length:0;
   const farthest=inside.length?Math.max(...inside.map(s=>hav(s.lat,s.lng,r.lat,r.lng))):0;
   const q=territoryQuality(owned,inside,avg,farthest,inside.filter(s=>s.coverCount>=2).length);
   return {r,owned:owned.length,inside:inside.length,coverage,avg,farthest,q};
 }).sort((a,b)=>b.owned-a.owned);

 const states=Object.values(stores.reduce((o,s)=>{
   const k=s.state||'Unknown';
   o[k]??={name:k,total:0,gaps:0};
   o[k].total++;if(!s.covered)o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);

 const retailers=Object.values(stores.reduce((o,s)=>{
   const k=s.retailer||'Unknown';
   o[k]??={name:k,total:0,gaps:0};
   o[k].total++;if(!s.covered)o[k].gaps++;
   return o;
 },{})).sort((a,b)=>b.gaps-a.gaps);

 const model=gapClusters(stores.filter(s=>!s.covered),75,10).slice(0,5);
 const avgOwned=territories.length?territories.reduce((a,x)=>a+x.owned,0)/territories.length:0;
 const riskTerr=territories.filter(x=>x.q.cls==='weak'||x.q.cls==='fair').length;

 openModal('Executive Coverage Dashboard',`
   <div class="callout"><b>Leadership view:</b> Current production coverage uses active Premium Merchandising RTS and the selected ${$('radius').value}-mile radius. Territory boundaries represent nearest-RTS ownership; they do not guarantee routeable coverage.</div>
   <div class="exec-grid">
     <div class="exec-kpi"><small>National coverage</small><b>${pct.toFixed(1)}%</b><span>${covered.toLocaleString()} of ${total.toLocaleString()} stores</span></div>
     <div class="exec-kpi"><small>Current gaps</small><b>${gaps.toLocaleString()}</b><span>Outside active RTS radius</span></div>
     <div class="exec-kpi"><small>Average territory</small><b>${Math.round(avgOwned)}</b><span>Nearest-owned stores per RTS</span></div>
     <div class="exec-kpi"><small>Territories to review</small><b>${riskTerr}</b><span>Fair or weak quality score</span></div>
   </div>
   <div class="exec-two">
     <div class="exec-section"><h3>Highest-gap states</h3>
       ${states.slice(0,8).map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.name)}</b><br>${x.total.toLocaleString()} stores</span><span class="exec-chip ${x.gaps/x.total>.65?'risk':x.gaps/x.total>.4?'watch':'good'}">${x.gaps.toLocaleString()} gaps</span></div>`).join('')}
     </div>
     <div class="exec-section"><h3>Highest-gap retailers</h3>
       ${retailers.slice(0,8).map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.name)}</b><br>${x.total.toLocaleString()} stores</span><span class="exec-chip ${x.gaps/x.total>.65?'risk':x.gaps/x.total>.4?'watch':'good'}">${x.gaps.toLocaleString()} gaps</span></div>`).join('')}
     </div>
     <div class="exec-section"><h3>Largest RTS workloads</h3>
       ${territories.slice(0,8).map((x,i)=>{
         const ratio=x.owned/Math.max(1,avgOwned);
         return `<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.r.name)}</b><br>${x.coverage.toFixed(1)}% owned coverage<div class="workload-meter ${ratio>1.45?'high':ratio>1.15?'watch':''}"><span style="width:${Math.min(100,ratio/1.6*100)}%"></span></div></span><button class="btn" onclick="window.openTerritory('${esc(x.r.id)}');document.getElementById('modal').classList.remove('show')">${x.owned}</button></div>`;
       }).join('')}
     </div>
     <div class="exec-section"><h3>Top placement opportunities</h3>
       ${model.map((x,i)=>`<div class="exec-priority"><span class="exec-rank">${i+1}</span><span><b>${esc(x.city)}, ${esc(x.state)}</b><br>Planning-only gap cluster</span><button class="btn" onclick="window.simulateAt(${x.lat},${x.lng});document.getElementById('modal').classList.remove('show')">+${x.count}</button></div>`).join('')}
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
 const activeCount=RTS.filter(r=>r.active).length;
 const base=`Updated ${updated} · ${RAW_STORES.length.toLocaleString()} stores · ${activeCount.toLocaleString()} active RTS`;
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
$('executiveBtn').onclick=executiveDashboard;$('leadershipReportBtn').onclick=leadershipReport;$('balanceBtn').onclick=territoryBalancer;$('hiringPlanBtn').onclick=hiringRecommendationPlan;$('simulateBtn').onclick=$('railSim').onclick=startSimulation;$('modelBtn').onclick=$('railModel').onclick=modelPlacement;$('gapFinderBtn').onclick=openGapFinder;$('territoryBtn').onclick=$('railTerritory').onclick=territoryProfiles;$('compareBtn').onclick=compareTerritories;$('resiliencyBtn').onclick=resiliency;$('managerBtn').onclick=()=>rollup('manager','Manager Rollups');$('retailerBtn').onclick=()=>rollup('retailer','Retailer Rollups');
$('exportStores').onclick=()=>csv(storeRows(filtered),'visible_stores.csv');$('exportGaps').onclick=()=>csv(storeRows(stores.filter(s=>!s.covered)),'current_coverage_gaps.csv');
$('panelBtn').onclick=$('hidePanel').onclick=()=>{$('workspace').classList.toggle('closed');setTimeout(()=>map.invalidateSize(),220)};$('drawerClose').onclick=()=>{$('drawer').classList.remove('show');window.clearHighlight()};$('modalClose').onclick=()=>$('modal').classList.remove('show');$('search').oninput=search;$('clearSearch').onclick=()=>{$('search').value='';$('results').classList.remove('show')};$('search').onkeydown=e=>{if(e.key==='Enter'&&($('search')._hits||[]).length){e.preventDefault();selectHit(($('search')._hits||[])[0])}};document.addEventListener('click',e=>{if(!e.target.closest('.search'))$('results').classList.remove('show')});try {
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
