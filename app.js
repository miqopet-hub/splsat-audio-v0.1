import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const HF='https://huggingface.co/cakewalk/splat-data/resolve/main/';
const SCENES=[
  ['garden','Garden · 187 MB'],['room','Room · 51 MB'],['truck','Truck · 81 MB'],['train','Train · 33 MB'],
  ['bicycle','Bicycle · 196 MB'],['stump','Stump · 159 MB'],['treehill','Treehill · 121 MB'],['nike','Nike · 9 MB'],['plush','Plush · 9 MB']
].map(([id,label])=>({id,label,url:HF+id+'.splat'}));

const stage=document.querySelector('#stage');
const enter=document.querySelector('#enter');
const status=document.querySelector('#status');
const sceneSelect=document.querySelector('#sceneSelect');
const resetViewButton=document.querySelector('#resetView');
const movePad=document.querySelector('#movePad');
const moveKnob=document.querySelector('#moveKnob');
const lookPad=document.querySelector('#lookPad');
SCENES.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.label;sceneSelect.appendChild(o)});

const isMobile=()=>matchMedia('(pointer:coarse)').matches||innerWidth<800;
const camera=new THREE.PerspectiveCamera(isMobile()?67:62,innerWidth/innerHeight,.05,2000);
camera.up.set(0,1,0);
const scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:isMobile()?'low-power':'high-performance'});
renderer.setClearColor(0x000000,1);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobile()?.8:1.35));
renderer.setSize(innerWidth,innerHeight);
stage.appendChild(renderer.domElement);
const spark=new SparkRenderer({renderer});
scene.add(spark);
const canvas=renderer.domElement;

let currentScene=SCENES[0],currentSplat=null,splatReady=false,loadToken=0;
let bounds=new THREE.Box3(new THREE.Vector3(-5,-2,-5),new THREE.Vector3(5,2,5));
let sceneInfo='';

canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();status.textContent='graphics memory reset · restoring…'});
canvas.addEventListener('webglcontextrestored',()=>{status.textContent='graphics restored';loadScene(currentScene)});

const pressed=new Set();
let yaw=0,pitch=0,targetYaw=0,targetPitch=0;
let mouseDragging=false,lastMouseX=0,lastMouseY=0,wheelVelocity=0;
let moveTouch={x:0,y:0},movePointer=null,lookPointer=null,lastLookX=0,lastLookY=0;

addEventListener('keydown',e=>pressed.add(e.code));
addEventListener('keyup',e=>pressed.delete(e.code));
addEventListener('blur',()=>{pressed.clear();mouseDragging=false;moveTouch={x:0,y:0}});

function lookDelta(dx,dy,sensitivity){
  targetYaw-=dx*sensitivity;
  targetPitch-=dy*sensitivity;
  targetPitch=THREE.MathUtils.clamp(targetPitch,-THREE.MathUtils.degToRad(70),THREE.MathUtils.degToRad(70));
}

canvas.addEventListener('pointerdown',e=>{
  if(isMobile()||e.pointerType==='touch')return;
  mouseDragging=true;lastMouseX=e.clientX;lastMouseY=e.clientY;
  canvas.classList.add('dragging');canvas.setPointerCapture?.(e.pointerId);
  if(audio?.ctx.state==='suspended')audio.ctx.resume();
});
canvas.addEventListener('pointermove',e=>{
  if(!mouseDragging||isMobile()||e.pointerType==='touch')return;
  lookDelta(e.clientX-lastMouseX,e.clientY-lastMouseY,.002);
  lastMouseX=e.clientX;lastMouseY=e.clientY;
});
const stopDrag=e=>{mouseDragging=false;canvas.classList.remove('dragging');try{canvas.releasePointerCapture?.(e.pointerId)}catch{}};
canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);
canvas.addEventListener('wheel',e=>{if(isMobile())return;e.preventDefault();wheelVelocity+=THREE.MathUtils.clamp(e.deltaY,-140,140)*.0022},{passive:false});

if(movePad&&lookPad){
  movePad.addEventListener('pointerdown',e=>{movePointer=e.pointerId;movePad.setPointerCapture(e.pointerId);updateMovePad(e);if(audio?.ctx.state==='suspended')audio.ctx.resume()});
  movePad.addEventListener('pointermove',e=>{if(e.pointerId===movePointer)updateMovePad(e)});
  movePad.addEventListener('pointerup',releaseMovePad);movePad.addEventListener('pointercancel',releaseMovePad);
  function updateMovePad(e){
    const r=movePad.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
    const max=r.width*.34,l=Math.hypot(x,y);if(l>max){x=x/l*max;y=y/l*max}
    moveTouch={x:x/max,y:y/max};moveKnob.style.transform=`translate(${x}px,${y}px)`;
  }
  function releaseMovePad(e){if(e.pointerId!==movePointer)return;movePointer=null;moveTouch={x:0,y:0};moveKnob.style.transform='translate(0,0)'}

  lookPad.addEventListener('pointerdown',e=>{lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;lookPad.setPointerCapture(e.pointerId);if(audio?.ctx.state==='suspended')audio.ctx.resume()});
  lookPad.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;lookDelta(e.clientX-lastLookX,e.clientY-lastLookY,.003);lastLookX=e.clientX;lastLookY=e.clientY});
  const releaseLook=e=>{if(e.pointerId===lookPointer)lookPointer=null};
  lookPad.addEventListener('pointerup',releaseLook);lookPad.addEventListener('pointercancel',releaseLook);
}

function updateNavigation(dt){
  const smooth=1-Math.exp(-14*dt);
  yaw=THREE.MathUtils.lerp(yaw,targetYaw,smooth);pitch=THREE.MathUtils.lerp(pitch,targetPitch,smooth);
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;camera.rotation.z=0;
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const up=new THREE.Vector3(0,1,0),move=new THREE.Vector3();
  if(pressed.has('KeyW'))move.add(forward);if(pressed.has('KeyS'))move.sub(forward);
  if(pressed.has('KeyD'))move.add(right);if(pressed.has('KeyA'))move.sub(right);
  if(pressed.has('KeyE'))move.add(up);if(pressed.has('KeyQ'))move.sub(up);
  if(Math.abs(moveTouch.x)>.03)move.addScaledVector(right,moveTouch.x);
  if(Math.abs(moveTouch.y)>.03)move.addScaledVector(forward,-moveTouch.y);
  const base=THREE.MathUtils.clamp(sceneExtent()*.055,.65,2.4);
  if(move.lengthSq()){
    const fast=pressed.has('ShiftLeft')||pressed.has('ShiftRight');
    move.normalize().multiplyScalar(base*(fast?2.8:1)*dt*(isMobile()?.92:1));camera.position.add(move);
  }
  if(!isMobile()&&Math.abs(wheelVelocity)>.0001){camera.position.addScaledVector(forward,-wheelVelocity*base*2);wheelVelocity*=Math.exp(-10*dt)}
}

sceneSelect.addEventListener('change',async()=>{const s=SCENES.find(x=>x.id===sceneSelect.value);if(s)await loadScene(s)});
resetViewButton.addEventListener('click',()=>{resetOverview();resetViewButton.blur()});

async function disposeCurrentSplat(){
  if(!currentSplat)return;
  try{scene.remove(currentSplat)}catch{}
  try{currentSplat.dispose()}catch(e){console.warn('splat dispose',e)}
  currentSplat=null;
  if(isMobile())await new Promise(r=>setTimeout(r,100));
}

function transformedBox(localBox,matrix){
  const out=new THREE.Box3().makeEmpty();
  const min=localBox.min,max=localBox.max;
  for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z])
    out.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(matrix));
  return out;
}

function centerSplat(splat,localBox){
  splat.quaternion.set(1,0,0,0);
  splat.position.set(0,0,0);
  splat.updateMatrixWorld(true);
  const center=localBox.getCenter(new THREE.Vector3()).applyQuaternion(splat.quaternion);
  splat.position.copy(center).multiplyScalar(-1);
  splat.updateMatrixWorld(true);
  bounds.copy(transformedBox(localBox,splat.matrixWorld));
}

async function loadScene(s){
  const token=++loadToken;
  splatReady=false;sceneSelect.disabled=true;resetViewButton.disabled=true;currentScene=s;
  status.textContent=`loading ${s.label}…`;
  await disposeCurrentSplat();
  if(token!==loadToken)return;
  try{
    let lastPct=-1;
    const splat=new SplatMesh({
      url:s.url,
      editable:false,
      raycastable:false,
      onProgress:e=>{
        if(token!==loadToken)return;
        if(e.total){const pct=Math.floor(e.loaded/e.total*100);if(pct!==lastPct){lastPct=pct;status.textContent=`loading ${s.label} · ${pct}%`;}}
      }
    });
    currentSplat=splat;
    scene.add(splat);
    await splat.initialized;
    if(token!==loadToken){scene.remove(splat);splat.dispose();return;}

    const local=splat.getBoundingBox(true);
    if(!local||local.isEmpty()||![local.min.x,local.min.y,local.min.z,local.max.x,local.max.y,local.max.z].every(Number.isFinite))throw new Error('invalid splat bounds');
    centerSplat(splat,local);
    const size=bounds.getSize(new THREE.Vector3());
    sceneInfo=`box ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} · ${splat.numSplats?.toLocaleString?.()||'?'} splats`;
    resetOverview();
    updateSoundLayout();
    splatReady=true;
    status.textContent=`${s.label} · ${sceneInfo}`;
  }catch(e){
    console.error(e);status.textContent=`${s.label} failed: ${e?.message||e}`;
  }finally{
    if(token===loadToken){sceneSelect.disabled=false;resetViewButton.disabled=false;}
  }
}

function resetOverview(){
  const c=bounds.getCenter(new THREE.Vector3()),s=bounds.getSize(new THREE.Vector3());
  const radius=Math.max(s.x,s.y,s.z,2);
  camera.position.set(c.x,c.y+radius*.08,c.z+radius*.9);
  camera.lookAt(c);
  const d=new THREE.Vector3();camera.getWorldDirection(d);
  yaw=targetYaw=Math.atan2(-d.x,-d.z);
  pitch=targetPitch=Math.asin(THREE.MathUtils.clamp(d.y,-1,1));
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;camera.rotation.z=0;
  wheelVelocity=0;moveTouch={x:0,y:0};if(moveKnob)moveKnob.style.transform='translate(0,0)';
}
function sceneExtent(){const s=bounds.getSize(new THREE.Vector3());return Math.max(s.x,s.z,4)}

let audio=null,SOUND_ZONES=[];
const PRESETS=[
 ['soft kick','hit',58,.78,'sine'],['wood click','hit',180,.43,'triangle'],['low drone','drone',48,.13,'sine'],['warm drone','drone',73,.21,'triangle'],['air','noise',.992],['dust','noise',.975],['bell A','bell',392,2.3],['bell B','bell',523.25,3.1],['pulse A','pulse',96,2.2],['pulse B','pulse',142,3.7],['glass','bell',659.25,4.1],['sub','drone',36,.09,'sine'],['tap','hit',260,.62,'square'],['flutter','pulse',210,7.5],['hiss','noise',.94],['tone 1','drone',110,.17,'sine'],['tone 2','drone',146.8,.11,'triangle'],['chime','bell',783.99,5.4],['heartbeat','hit',72,.92,'sine'],['shimmer','pulse',330,5.2]
].map(p=>{const[name,type,a,b,tone]=p;return type==='noise'?{name,type,shade:a}:{name,type,hz:a,param:b,tone}});

enter.addEventListener('click',async()=>{if(!audio)audio=createAudioWorld();await audio.ctx.resume();enter.style.display='none'});

function distributeZones(){
  const c=bounds.getCenter(new THREE.Vector3()),s=bounds.getSize(new THREE.Vector3()),w=Math.max(s.x,4),d=Math.max(s.z,4),y=c.y;
  const spacing=Math.max(w/4,d/5),radius=Math.max(spacing*2.8,sceneExtent()*.27),z=[];
  for(let row=0;row<4;row++)for(let col=0;col<5;col++){
    const i=row*5+col;
    z.push({...PRESETS[i],position:new THREE.Vector3(c.x+(col/4-.5)*w*.78+Math.sin(i*2.17)*w*.03,y+Math.sin(i)*.12,c.z+(row/3-.5)*d*.78+Math.cos(i*1.73)*d*.03),radius});
  }
  return z;
}
function updateSoundLayout(){
  SOUND_ZONES=distributeZones();
  if(!audio)return;
  audio.sources.forEach((source,i)=>{
    source.zone=SOUND_ZONES[i];setPos(source.panner,source.zone.position,audio.ctx.currentTime);
    source.panner.refDistance=Math.max(source.zone.radius*.05,.25);source.panner.maxDistance=source.zone.radius*1.25;
  });
}
function createAudioWorld(){
  const C=window.AudioContext||window.webkitAudioContext,ctx=new C(),master=ctx.createGain();master.gain.value=.46;master.connect(ctx.destination);
  SOUND_ZONES=distributeZones();return{ctx,master,sources:SOUND_ZONES.map(z=>makeSource(ctx,master,z))};
}
function chain(ctx,dest,z){
  const input=ctx.createGain(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),p=ctx.createPanner();
  filter.type='lowpass';filter.Q.value=.45;gain.gain.value=.0001;p.panningModel='HRTF';p.distanceModel='linear';p.refDistance=Math.max(z.radius*.05,.25);p.maxDistance=z.radius*1.25;p.rolloffFactor=.35;
  setPos(p,z.position,ctx.currentTime);input.connect(filter).connect(gain).connect(p).connect(dest);return{input,filter,gain,panner:p,zone:z};
}
function makeSource(ctx,d,z){const c=chain(ctx,d,z);if(z.type==='drone')return drone(ctx,c,z);if(z.type==='noise')return noise(ctx,c,z);if(z.type==='bell')return bell(ctx,c,z);if(z.type==='pulse')return pulse(ctx,c,z);return hit(ctx,c,z)}
function drone(ctx,c,z){const mix=ctx.createGain(),a=ctx.createOscillator(),b=ctx.createOscillator(),l=ctx.createOscillator(),lg=ctx.createGain();mix.gain.value=.05;a.type=z.tone||'sine';b.type='sine';a.frequency.value=z.hz;b.frequency.value=z.hz*1.502;l.frequency.value=z.param||.15;lg.gain.value=z.hz*.015;l.connect(lg).connect(a.frequency);a.connect(mix);b.connect(mix);mix.connect(c.input);a.start();b.start();l.start();return c}
function noise(ctx,c,z){const buf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buf.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){const w=Math.random()*2-1;last=last*z.shade+w*(1-z.shade);data[i]=last*2}const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;src.loop=true;g.gain.value=.2;src.connect(g).connect(c.input);src.start();return c}
function pulse(ctx,c,z){const o=ctx.createOscillator(),m=ctx.createOscillator(),mg=ctx.createGain(),g=ctx.createGain();o.type='sine';o.frequency.value=z.hz;m.frequency.value=z.param;mg.gain.value=z.hz*.22;g.gain.value=.07;m.connect(mg).connect(o.frequency);o.connect(g).connect(c.input);o.start();m.start();return c}
function bell(ctx,c,z){let next=ctx.currentTime+.2+Math.random();const timer=setInterval(()=>{while(next<ctx.currentTime+.2){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=z.hz*(.997+Math.random()*.006);g.gain.setValueAtTime(.0001,next);g.gain.exponentialRampToValueAtTime(.1,next+.008);g.gain.exponentialRampToValueAtTime(.0001,next+.58);o.connect(g).connect(c.input);o.start(next);o.stop(next+.62);next+=z.param*(.78+Math.random()*.45)}},90);return{...c,timer}}
function hit(ctx,c,z){const o=ctx.createOscillator(),g=ctx.createGain();o.type=z.tone||'sine';o.frequency.value=z.hz;g.gain.value=0;o.connect(g).connect(c.input);o.start();let next=ctx.currentTime+.1+Math.random()*.3;const timer=setInterval(()=>{while(next<ctx.currentTime+.15){g.gain.cancelScheduledValues(next);g.gain.setValueAtTime(.0001,next);g.gain.exponentialRampToValueAtTime(.16,next+.005);g.gain.exponentialRampToValueAtTime(.0001,next+.065);next+=z.param*(.88+Math.random()*.24)}},55);return{...c,timer}}
function setPos(p,v,t){if(p.positionX){p.positionX.setValueAtTime(v.x,t);p.positionY.setValueAtTime(v.y,t);p.positionZ.setValueAtTime(v.z,t)}else p.setPosition(v.x,v.y,v.z)}

function updateAudio(){
  if(!audio)return;
  const ctx=audio.ctx,now=ctx.currentTime;
  const f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize(),u=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).normalize(),L=ctx.listener;
  if(L.positionX){
    L.positionX.setTargetAtTime(camera.position.x,now,.015);L.positionY.setTargetAtTime(camera.position.y,now,.015);L.positionZ.setTargetAtTime(camera.position.z,now,.015);
    L.forwardX.setTargetAtTime(f.x,now,.015);L.forwardY.setTargetAtTime(f.y,now,.015);L.forwardZ.setTargetAtTime(f.z,now,.015);
    L.upX.setTargetAtTime(u.x,now,.015);L.upY.setTargetAtTime(u.y,now,.015);L.upZ.setTargetAtTime(u.z,now,.015);
  }else{L.setPosition(camera.position.x,camera.position.y,camera.position.z);L.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z)}
  const ranked=audio.sources.map((s,i)=>({i,d:camera.position.distanceTo(s.zone.position)})).sort((a,b)=>a.d-b.d),rank=new Map(ranked.map((x,i)=>[x.i,i]));
  audio.sources.forEach((s,i)=>{
    const dist=camera.position.distanceTo(s.zone.position),n=THREE.MathUtils.clamp(1-dist/s.zone.radius,0,1),r=rank.get(i),rankGain=r<3?1:r<6?.34:.04,prox=Math.pow(n,.78);
    s.gain.gain.setTargetAtTime(.0001+prox*.30*rankGain,now,.11);s.filter.frequency.setTargetAtTime(650+Math.pow(n,.72)*9000,now,.14);
  });
}

let previous=performance.now();
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  updateNavigation(dt);updateAudio();renderer.render(scene,camera);
  if(audio&&splatReady){
    const nearest=audio.sources.map(s=>({name:s.zone.name,d:camera.position.distanceTo(s.zone.position)})).sort((a,b)=>a.d-b.d).slice(0,3);
    status.textContent=`${currentScene.label} · ${sceneInfo}\nnearest: ${nearest.map(x=>`${x.name} ${x.d.toFixed(1)}m`).join(' · ')}`;
  }
});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.fov=isMobile()?67:62;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobile()?.8:1.35));renderer.setSize(innerWidth,innerHeight);
});

loadScene(currentScene);
