/* ===================== CONFIG & DATA =====================
   Replace `nodes` with the array exported from the Node Builder.
   - pano: URL of a real equirectangular photo (leave out to use a placeholder)
   - yaw:  degrees to rotate a photo so its "north" matches the map (default 0)
   - cat/desc: shown in the Places list and info card */
const METERS_PER_MAP_UNIT = 0.6;   // calibrate to your map scale
const WALK_SPEED_MPS = 1.3;
const nodes = [
  {id:"entrance", name:"Main Entrance", cat:"Entrance", icon:"🚪", desc:"Start here: security, visitor sign-in and the front gate.", x:60, y:230, links:["quad"]},
  {id:"quad", name:"Central Quad", cat:"Outdoors", icon:"🌳", desc:"The social heart of campus, with seating and shade.", x:150, y:190, links:["entrance","library","cafeteria","hallA"]},
  {id:"library", name:"Library", cat:"Academic", icon:"📚", desc:"Study floors, group rooms and the print station.", x:120, y:110, links:["quad","lab"]},
  {id:"cafeteria", name:"Cafeteria", cat:"Food", icon:"☕", desc:"Meals, coffee and a relaxed place to meet friends.", x:230, y:120, links:["quad","hallB"]},
  {id:"hallA", name:"Lecture Hall A", cat:"Academic", icon:"🎓", desc:"Large lecture venue for first-year modules.", x:150, y:270, links:["quad","hallB"]},
  {id:"hallB", name:"Lecture Hall B", cat:"Academic", icon:"🎓", desc:"Tiered seating and presentation facilities.", x:250, y:250, links:["hallA","cafeteria","parking"]},
  {id:"lab", name:"Computer Lab", cat:"Academic", icon:"💻", desc:"Open-access PCs, software and tech support.", x:90, y:40, links:["library"]},
  {id:"parking", name:"Parking & Sports Field", cat:"Facilities", icon:"⚽", desc:"Student parking and the sports field.", x:330, y:210, links:["hallB"]}
];
const byId = Object.fromEntries(nodes.map(n=>[n.id,n]));
const $ = id => document.getElementById(id);
let cur = "entrance", prev = null, routeIds = [], routeIdx = -1, catFilter = "All";

/* ===================== ROUTING =====================
   Shortest path over the node graph (Dijkstra, map distance).
   To use the walkable-grid A* instead, replace this function. */
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function routeBetween(from,to){
  const d={},p={},q=new Set(nodes.map(n=>n.id));
  nodes.forEach(n=>d[n.id]=Infinity); d[from]=0;
  while(q.size){
    let u=null; q.forEach(id=>{if(u===null||d[id]<d[u])u=id;});
    if(d[u]===Infinity)break; q.delete(u); if(u===to)break;
    byId[u].links.forEach(v=>{ if(!byId[v])return; const nd=d[u]+dist(byId[u],byId[v]); if(nd<d[v]){d[v]=nd;p[v]=u;} });
  }
  if(d[to]===Infinity)return null;
  const path=[to]; while(path[0]!==from)path.unshift(p[path[0]]);
  return {path, meters:d[to]*METERS_PER_MAP_UNIT};
}

/* ===================== 360 VIEWER ===================== */
const scene=new THREE.Scene(), cam=new THREE.PerspectiveCamera(80,1,1,1100);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputEncoding=THREE.sRGBEncoding;
$('viewer').appendChild(renderer.domElement);
const geo=new THREE.SphereGeometry(500,60,40); geo.scale(-1,1,1);
const sphere=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x1b2a30})); scene.add(sphere);
let lon=180,lat=0,tLon=180,tLat=0,fov=80,tFov=80,auto=false,vel=0,lastInput=0;
function resize(){const w=$('viewer').clientWidth,h=$('viewer').clientHeight;renderer.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix();}
addEventListener('resize',resize);

const texCache={};
function placeholder(n){
  const w=1024,h=512,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  let g=x.createLinearGradient(0,0,0,h*.55);g.addColorStop(0,'#7fb3c4');g.addColorStop(1,'#d8e8e4');x.fillStyle=g;x.fillRect(0,0,w,h*.58);
  g=x.createLinearGradient(0,h*.55,0,h);g.addColorStop(0,'#8f9c6f');g.addColorStop(1,'#5f6a45');x.fillStyle=g;x.fillRect(0,h*.55,w,h*.45);
  let s=0;for(const ch of n.id)s+=ch.charCodeAt(0);const r=m=>{s=(s*9301+49297)%233280;return s/233280*m;};
  const cols=['#274b52','#33636b','#1e3a40','#3c5c46'];
  for(let px=0;px<w;){const bw=60+r(80),bh=30+r(90);x.fillStyle=cols[Math.floor(r(4))];x.fillRect(px,h*.58-bh,bw,bh);px+=bw+10+r(20);}
  x.fillStyle='rgba(210,200,170,.9)';x.beginPath();x.moveTo(0,h*.86);x.quadraticCurveTo(w*.5,h*.78,w,h*.88);x.lineTo(w,h);x.lineTo(0,h);x.fill();
  x.font='bold 26px sans-serif';x.fillStyle='rgba(20,30,25,.4)';x.textAlign='center';x.fillText(n.name.toUpperCase(),w/2,h*.95);
  return c.toDataURL('image/jpeg',.85);
}
const loader=new THREE.TextureLoader();
function getTex(n){
  if(texCache[n.id])return texCache[n.id];
  texCache[n.id]=new Promise((resolve,reject)=>loader.load(
    n.pano||placeholder(n),
    t=>{t.encoding=THREE.sRGBEncoding;resolve(t);},
    undefined,
    ()=>{delete texCache[n.id];reject(new Error(`Unable to load panorama for ${n.name}.`));}
  ));
  return texCache[n.id];
}
const bearing=(a,b)=>(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+360)%360;
const lonFor=(a,b)=>(450-bearing(a,b)+(a.yaw||0)+360)%360;

function frame(){
  requestAnimationFrame(frame);
  if(auto&&performance.now()-lastInput>1500)tLon+=.12;
  if(!drag){tLon+=vel;vel*=.94;}
  lon+=((((tLon-lon+540)%360)-180))*.14; lat+=(tLat-lat)*.14; lat=Math.max(-85,Math.min(85,lat)); tLat=Math.max(-85,Math.min(85,tLat));
  fov+=(tFov-fov)*.15; cam.fov=fov; cam.updateProjectionMatrix();
  const ph=(90-lat)*Math.PI/180,th=lon*Math.PI/180;
  cam.lookAt(500*Math.sin(ph)*Math.cos(th),500*Math.cos(ph),500*Math.sin(ph)*Math.sin(th));
  renderer.render(scene,cam); placeHotspots();
  $('needle').style.transform=`rotate(${-(lon-(180+(byId[cur].yaw||0)))}deg)`;
}
let drag=false,sx=0,sy=0,sl=0,st=0,lx=0;
const vw=$('viewer');
vw.addEventListener('pointerdown',e=>{drag=true;vel=0;lastInput=performance.now();vw.classList.add('drag');vw.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;sl=tLon;st=tLat;lx=e.clientX;});
vw.addEventListener('pointermove',e=>{if(!drag)return;lastInput=performance.now();const k=cam.fov/80*.2;tLon=sl-(e.clientX-sx)*k;tLat=st+(e.clientY-sy)*k;vel=-(e.clientX-lx)*k*.4;lx=e.clientX;});
['pointerup','pointercancel'].forEach(t=>vw.addEventListener(t,()=>{drag=false;vw.classList.remove('drag');}));
vw.addEventListener('wheel',e=>{e.preventDefault();tFov=Math.max(35,Math.min(100,tFov+e.deltaY*.04));},{passive:false});
$('zi').onclick=()=>tFov=Math.max(35,tFov-10); $('zo').onclick=()=>tFov=Math.min(100,tFov+10);
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  const m={ArrowLeft:()=>tLon-=8,ArrowRight:()=>tLon+=8,ArrowUp:()=>tLat+=6,ArrowDown:()=>tLat-=6,'+':()=>tFov=Math.max(35,tFov-8),'=':()=>tFov=Math.max(35,tFov-8),'-':()=>tFov=Math.min(100,tFov+8),Escape:()=>{$('help').classList.add('hide');}}[e.key];
  if(m){m();lastInput=performance.now();}
});

/* ===================== HOTSPOTS ===================== */
let hs=[];
function buildHotspots(){
  $('hotspots').innerHTML=''; hs=[];
  const nextId=routeIdx>=0?routeIds[routeIdx+1]:null;
  byId[cur].links.forEach(id=>{
    const t=byId[id]; if(!t)return;
    const el=document.createElement('button'); el.type='button'; el.className='hs'+(id===nextId?' next':'');
    el.setAttribute('aria-label',`Move to ${t.name}`);
    el.innerHTML=`<span class="a" aria-hidden="true">➜</span><span class="t">${t.name}</span>`;
    el.onclick=()=>{ if(id===nextId)routeIdx++; else if(routeIdx>=0&&routeIds[routeIdx-1]===id)routeIdx--; goTo(id); };
    $('hotspots').appendChild(el); hs.push({el,l:lonFor(byId[cur],t)});
  });
}
function placeHotspots(){
  const w=$('viewer').clientWidth,h=$('viewer').clientHeight;
  hs.forEach(({el,l})=>{
    const th=l*Math.PI/180,v=new THREE.Vector3(480*Math.cos(th),-25,480*Math.sin(th)).project(cam);
    if(v.z>1){el.style.display='none';return;}
    el.style.display='flex'; el.style.left=((v.x+1)/2*w)+'px'; el.style.top=((1-v.y)/2*h)+'px';
  });
}

/* ===================== NAVIGATION ===================== */
async function goTo(id,faceTo){
  const n=byId[id]; if(!n)return;
  $('fade').classList.add('on'); await new Promise(r=>setTimeout(r,240));
  try{
    const t=await getTex(n); sphere.material.map=t; sphere.material.color.set(0xffffff); sphere.material.needsUpdate=true;
    const from=byId[cur]; prev=(id!==cur)?from:prev; cur=id;
    const nextId=faceTo||(routeIdx>=0?routeIds[routeIdx+1]:null);
    if(nextId&&byId[nextId])tLon=lon=lonFor(n,byId[nextId]);
    else if(prev&&prev!==n)tLon=lon=(lonFor(prev,n)+0)%360;
    tLat=lat=0; vel=0;
    buildHotspots(); drawMap(); updateInfo(); markPlace(); markStep();
  }catch(error){
    console.error(error);
    toast(`Unable to load the panorama for ${n.name}. Check the image URL and try again.`);
  }finally{
    $('fade').classList.remove('on');
  }
}
function updateInfo(){ const n=byId[cur]; $('iName').textContent=n.name; $('iDesc').textContent=n.desc||''; }
function toast(m){ const t=$('toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),2600); }

/* ===================== MINIMAP ===================== */
function drawMap(){
  const s=$('map'); let h='';
  const seen=new Set();
  nodes.forEach(n=>n.links.forEach(l=>{
    const k=[n.id,l].sort().join('|'); if(seen.has(k)||!byId[l])return; seen.add(k);
    const i=routeIds.indexOf(n.id),j=routeIds.indexOf(l);
    const onRoute=i>=0&&j>=0&&Math.abs(i-j)===1;
    h+=`<line class="mp${onRoute?' route':''}" x1="${n.x}" y1="${n.y}" x2="${byId[l].x}" y2="${byId[l].y}"/>`;
  }));
  nodes.forEach(n=>{
    const c=n.id===cur;
    if(c)h+=`<circle class="pulse" cx="${n.x}" cy="${n.y}" r="9"/>`;
    h+=`<g class="mn${c?' cur':''}" data-id="${n.id}" role="button" tabindex="0" aria-label="View ${n.name}"><circle cx="${n.x}" cy="${n.y}" r="${c?9:6}"/><text x="${n.x}" y="${n.y-12}" text-anchor="middle">${n.name}</text></g>`;
  });
  s.innerHTML=h;
  s.querySelectorAll('.mn').forEach(g=>{
    const navigate=()=>{routeIds=[];routeIdx=-1;goTo(g.dataset.id);};
    g.onclick=navigate;
    g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate();}};
  });
}
$('mapHead').onclick=()=>{
  const b=$('mapBox'); if(b.classList.contains('min')){b.classList.remove('min');}
  else if(!b.classList.contains('big')){b.classList.add('big');} else {b.classList.remove('big');b.classList.add('min');}
  $('mapHead').setAttribute('aria-expanded',String(!b.classList.contains('min')));
  $('mapChev').textContent=b.classList.contains('min')?'▴':'▾';
};

/* ===================== PANEL: PLACES ===================== */
const cats=['All',...new Set(nodes.map(n=>n.cat))];
$('chips').innerHTML=cats.map(c=>`<button class="chip${c==='All'?' on':''}" data-c="${c}">${c}</button>`).join('');
$('chips').onclick=e=>{ if(!e.target.dataset.c)return; catFilter=e.target.dataset.c; document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.c===catFilter)); renderList(); };
$('q').oninput=renderList;
function renderList(){
  const q=$('q').value.trim().toLowerCase();
  const items=nodes.filter(n=>(catFilter==='All'||n.cat===catFilter)&&(!q||(n.name+n.cat+(n.desc||'')).toLowerCase().includes(q)));
  $('list').innerHTML=items.length?items.map(n=>`<button class="place${n.id===cur?' on':''}" data-id="${n.id}"><span class="ic">${n.icon||'📍'}</span><span><b>${n.name}</b><small>${n.cat}</small></span></button>`).join(''):'<div class="empty">No places match your search.</div>';
}
$('list').onclick=e=>{ const b=e.target.closest('.place'); if(!b)return; routeIds=[];routeIdx=-1; goTo(b.dataset.id); if(innerWidth<=720)$('panel').classList.add('hide'); };
function markPlace(){ document.querySelectorAll('.place').forEach(p=>p.classList.toggle('on',p.dataset.id===cur)); }

/* ===================== PANEL: DIRECTIONS ===================== */
const opts=nodes.map(n=>`<option value="${n.id}">${n.name}</option>`).join('');
$('from').innerHTML=opts; $('to').innerHTML=opts; $('to').value=nodes[nodes.length-1].id;
$('swap').onclick=()=>{const a=$('from').value;$('from').value=$('to').value;$('to').value=a;};
$('findBtn').onclick=()=>{
  const f=$('from').value,t=$('to').value;
  if(f===t){$('routeOut').innerHTML='<div class="empty">You’re already there! Pick a different destination.</div>';return;}
  const r=routeBetween(f,t);
  if(!r){$('routeOut').innerHTML='<div class="empty">No walkable route was found between those places.</div>';return;}
  routeIds=r.path; routeIdx=0;
  const mins=Math.max(1,Math.round(r.meters/WALK_SPEED_MPS/60));
  const steps=r.path.map((id,i)=>{
    const n=byId[id];
    const txt=i===0?`Start at <b>${n.name}</b>`:(i===r.path.length-1?`Arrive at <b>${n.name}</b>`:`Continue to <b>${n.name}</b>`);
    return `<div class="step" data-i="${i}"><span class="n">${i+1}</span><span>${txt}</span></div>`;
  }).join('');
  $('routeOut').innerHTML=`<div class="sum">${r.path.length-1} stop${r.path.length>2?'s':''} · about ${Math.round(r.meters)} m · ~${mins} min walk</div>
    <div class="row" style="margin:10px 0"><button class="pbtn go" id="tourBtn" style="flex:1">▶ Walk me there</button><button class="pbtn alt" id="clearBtn">Clear</button></div>${steps}`;
  $('tourBtn').onclick=toggleTour; $('clearBtn').onclick=clearRoute;
  goTo(f,r.path[1]); toast('Route ready: follow the pulsing arrow');
};
$('routeOut').onclick=e=>{ const s=e.target.closest('.step'); if(!s)return; routeIdx=+s.dataset.i; goTo(routeIds[routeIdx]); };
function markStep(){ document.querySelectorAll('.step').forEach(s=>s.classList.toggle('on',+s.dataset.i===routeIdx)); }
function clearRoute(){ stopTour(); routeIds=[];routeIdx=-1; $('routeOut').innerHTML='<div class="empty">Route cleared.</div>'; buildHotspots(); drawMap(); }
let tour=null;
function toggleTour(){ tour?stopTour():startTour(); }
function startTour(){
  if(routeIdx<0||routeIdx>=routeIds.length-1)routeIdx=0;
  $('tourBtn').textContent='❚❚ Pause'; if(cur!==routeIds[routeIdx])goTo(routeIds[routeIdx]);
  tour=setInterval(()=>{
    if(routeIdx>=routeIds.length-1){stopTour();toast('You’ve arrived!');return;}
    routeIdx++; goTo(routeIds[routeIdx]);
  },3200);
}
function stopTour(){ clearInterval(tour); tour=null; const b=$('tourBtn'); if(b)b.textContent='▶ Walk me there'; }

/* ===================== UI WIRING ===================== */
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  $('p-places').classList.toggle('on',t.dataset.t==='places'); $('p-dir').classList.toggle('on',t.dataset.t==='dir');
});
$('menuBtn').onclick=()=>$('panel').classList.toggle('hide');
$('autoBtn').onclick=()=>{auto=!auto;$('autoBtn').classList.toggle('on',auto);toast(auto?'Auto-rotate on':'Auto-rotate off');};
$('fsBtn').onclick=()=>{ if(!document.fullscreenElement)($('app').requestFullscreen||(()=>{})).call($('app')); else document.exitFullscreen(); };
$('helpBtn').onclick=()=>$('help').classList.remove('hide'); $('helpClose').onclick=()=>$('help').classList.add('hide');
$('startBtn').onclick=()=>$('welcome').classList.add('hide');

resize(); renderList(); drawMap(); updateInfo(); frame();
if(innerWidth<=720)$('panel').classList.add('hide');
goTo(cur);
