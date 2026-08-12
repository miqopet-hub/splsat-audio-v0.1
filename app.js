import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const HF='https://huggingface.co/cakewalk/splat-data/resolve/main/';
const SCENES=[
  ['garden','Garden · 187 MB'],['room','Room · 51 MB'],['truck','Truck · 81 MB'],['train','Train · 33 MB'],
  ['bicycle','Bicycle · 196 MB'],['stump','Stump · 159 MB'],['treehill','Treehill · 121 MB'],['nike','Nike · 9 MB'],['plush','Plush · 9 MB']
].map(([id,label])=>({id,label,url:HF+id+'.splat'}));

const stage=document.querySelector('#stage'), enter=document.querySelector('#enter'), status=document.querySelector('#status');
const sceneSelect=document.querySelector('#sceneSelect'), resetViewButton=document.querySelector('#resetView');
const movePad=document.querySelector('#movePad'), moveKnob=document.querySelector('#moveKnob'), lookPad=document.querySelector('#lookPad');
SCENES.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.label;sceneSelect.appendChild(o)});

const mobile=()=>matchMedia('(pointer:coarse)').matches||innerWidth<800;
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile()?1.15:1.5)); renderer.setSize(innerWidth,innerHeight); renderer.setClearColor(0x000000,1); stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(mobile()?68:62,innerWidth/innerHeight,.04,600); camera.up.set(0,1,0);
const viewer=new GaussianSplats3D.Viewer({selfDrivenMode:false,renderer,camera,threeScene:scene,useBuiltInControls:false,sharedMemoryForWorkers:false,gpuAcceleratedSort:false,integerBasedSort:false,sphericalHarmonicsDegree:0,renderMode:GaussianSplats3D.RenderMode.Always,sceneRevealMode:GaussianSplats3D.SceneRevealMode.Gradual,logLevel:GaussianSplats3D.LogLevel.None,freeIntermediateSplatData:true});

let currentScene=SCENES[0], hasScene=false, splatReady=false;
let bounds=new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,3,5));

// ---------- navigation ----------
const pressed=new Set(); let yaw=0,pitch=0,targetYaw=0,targetPitch=0,pointerLocked=false;
let moveTouch={x:0,y:0},movePointer=null,lookPointer=null,lastLookX=0,lastLookY=0;
addEventListener('keydown',e=>pressed.add(e.code)); addEventListener('keyup',e=>pressed.delete(e.code)); addEventListener('blur',()=>pressed.clear());
renderer.domElement.addEventListener('click',()=>{if(mobile())return;if(audio?.ctx.state==='suspended')audio.ctx.resume();renderer.domElement.requestPointerLock?.()});
document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===renderer.domElement;if(!pointerLocked&&audio&&!mobile())enter.style.display='grid'});
document.addEventListener('mousemove',e=>{if(pointerLocked)lookDelta(e.movementX,e.movementY,.00105)});
function lookDelta(dx,dy,s){targetYaw-=dx*s;targetPitch-=dy*s;const m=THREE.MathUtils.degToRad(68);targetPitch=THREE.MathUtils.clamp(targetPitch,-m,m)}

movePad.addEventListener('pointerdown',e=>{movePointer=e.pointerId;movePad.setPointerCapture(e.pointerId);updatePad(e)});
movePad.addEventListener('pointermove',e=>{if(e.pointerId===movePointer)updatePad(e)}); movePad.addEventListener('pointerup',releasePad); movePad.addEventListener('pointercancel',releasePad);
function updatePad(e){const r=movePad.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,max=r.width*.34,l=Math.hypot(x,y);if(l>max){x=x/l*max;y=y/l*max}moveTouch={x:x/max,y:y/max};moveKnob.style.transform=`translate(${x}px,${y}px)`}
function releasePad(e){if(e.pointerId!==movePointer)return;movePointer=null;moveTouch={x:0,y:0};moveKnob.style.transform='translate(0,0)'}
lookPad.addEventListener('pointerdown',e=>{lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;lookPad.setPointerCapture(e.pointerId)});
lookPad.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;lookDelta(e.clientX-lastLookX,e.clientY-lastLookY,.0033);lastLookX=e.clientX;lastLookY=e.clientY});
lookPad.addEventListener('pointerup',e=>{if(e.pointerId===lookPointer)lookPointer=null}); lookPad.addEventListener('pointercancel',e=>{if(e.pointerId===lookPointer)lookPointer=null});

function updateNavigation(dt){
  const a=1-Math.exp(-12*dt);yaw=THREE.MathUtils.lerp(yaw,targetYaw,a);pitch=THREE.MathUtils.lerp(pitch,targetPitch,a);
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;camera.rotation.z=0;
  const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),u=new THREE.Vector3(0,1,0),m=new THREE.Vector3();
  if(pressed.has('KeyW'))m.add(f);if(pressed.has('KeyS'))m.sub(f);if(pressed.has('KeyD'))m.add(r);if(pressed.has('KeyA'))m.sub(r);if(pressed.has('KeyE'))m.add(u);if(pressed.has('KeyQ'))m.sub(u);
  if(Math.abs(moveTouch.x)>.03)m.addScaledVector(r,moveTouch.x);if(Math.abs(moveTouch.y)>.03)m.addScaledVector(f,-moveTouch.y);
  if(m.lengthSq()){const ext=sceneExtent(),base=THREE.MathUtils.clamp(ext*.055,.65,1.8),fast=pressed.has('ShiftLeft')||pressed.has('ShiftRight');m.normalize().multiplyScalar(base*(fast?2.8:1)*dt*(mobile()?.92:1));camera.position.add(m)}
}

// ---------- scene library ----------
sceneSelect.addEventListener('change',()=>{const s=SCENES.find(x=>x.id===sceneSelect.value);if(s)loadScene(s)}); resetViewButton.addEventListener('click',resetHumanView);
async function loadScene(s){
  splatReady=false;sceneSelect.disabled=true;status.textContent=`loading ${s.label}…`;
  try{
    if(hasScene){await viewer.removeSplatScene(0);hasScene=false}
    await viewer.addSplatScene(s.url,{progressiveLoad:true,splatAlphaRemovalThreshold:5,showLoadingUI:true,rotation:[1,0,0,0]});
    hasScene=true;currentScene=s;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));updateBounds();resetHumanView();rebuildSoundWorld();splatReady=true;status.textContent=`${s.id} ready · 20 spatial sounds`;
  }catch(e){console.error(e);status.textContent=`${s.id} failed to load`}finally{sceneSelect.disabled=false}
}
function updateBounds(){try{const m=viewer.splatMesh;if(m?.computeBoundingBox){m.computeBoundingBox();if(m.boundingBox&&!m.boundingBox.isEmpty()){bounds.copy(m.boundingBox);return}}}catch(e){console.warn(e)}bounds.set(new THREE.Vector3(-5,0,-5),new THREE.Vector3(5,3,5))}
function resetHumanView(){const c=bounds.getCenter(new THREE.Vector3()),s=bounds.getSize(new THREE.Vector3()),eye=THREE.MathUtils.clamp(s.y*.2,1.2,1.7);camera.position.set(c.x,bounds.min.y+eye,c.z+s.z*.12);camera.lookAt(c.x,camera.position.y,c.z-Math.max(s.z*.18,.5));const d=new THREE.Vector3();camera.getWorldDirection(d);yaw=targetYaw=Math.atan2(-d.x,-d.z);pitch=targetPitch=Math.asin(THREE.MathUtils.clamp(d.y,-1,1));camera.rotation.z=0}
function sceneExtent(){const s=bounds.getSize(new THREE.Vector3());return Math.max(s.x,s.z,4)}

// ---------- spatial audio ----------
let audio=null,SOUND_ZONES=[];
const PRESETS=[
 ['soft kick','hit',58,.78,'sine'],['wood click','hit',180,.43,'triangle'],['low drone','drone',48,.13,'sine'],['warm drone','drone',73,.21,'triangle'],['air','noise',.992],['dust','noise',.975],['bell A','bell',392,2.3],['bell B','bell',523.25,3.1],['pulse A','pulse',96,2.2],['pulse B','pulse',142,3.7],['glass','bell',659.25,4.1],['sub','drone',36,.09,'sine'],['tap','hit',260,.62,'square'],['flutter','pulse',210,7.5],['hiss','noise',.94],['tone 1','drone',110,.17,'sine'],['tone 2','drone',146.8,.11,'triangle'],['chime','bell',783.99,5.4],['heartbeat','hit',72,.92,'sine'],['shimmer','pulse',330,5.2]
].map((p,i)=>{const [name,type,a,b,tone]=p;return type==='noise'?{name,type,shade:a}:{name,type,hz:a,param:b,tone}});

enter.addEventListener('click',async()=>{if(!audio)audio=createAudioWorld();await audio.ctx.resume();enter.style.display='none';if(!mobile())renderer.domElement.requestPointerLock?.()});
function distributeZones(){const c=bounds.getCenter(new THREE.Vector3()),s=bounds.getSize(new THREE.Vector3()),w=Math.max(s.x,4),d=Math.max(s.z,4),y=bounds.min.y+THREE.MathUtils.clamp(s.y*.2,1,1.65),spacing=Math.max(w/4,d/5),radius=Math.max(spacing*2.35,sceneExtent()*.2),z=[];for(let row=0;row<4;row++)for(let col=0;col<5;col++){const i=row*5+col;z.push({...PRESETS[i],position:new THREE.Vector3(c.x+(col/4-.5)*w*.82+Math.sin(i*2.17)*w*.035,y+Math.sin(i)*.18,c.z+(row/3-.5)*d*.82+Math.cos(i*1.73)*d*.035),radius})}return z}
function createAudioWorld(){const C=AudioContext||webkitAudioContext,ctx=new C(),master=ctx.createGain();master.gain.value=.52;master.connect(ctx.destination);SOUND_ZONES=distributeZones();return{ctx,master,sources:SOUND_ZONES.map(z=>makeSource(ctx,master,z))}}
function rebuildSoundWorld(){SOUND_ZONES=distributeZones();if(!audio)return;audio.sources.forEach(s=>{try{s.gain.gain.setTargetAtTime(.0001,audio.ctx.currentTime,.03)}catch{}if(s.timer)clearInterval(s.timer)});audio.sources=SOUND_ZONES.map(z=>makeSource(audio.ctx,audio.master,z))}
function chain(ctx,dest,z){const input=ctx.createGain(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),p=ctx.createPanner();filter.type='lowpass';filter.Q.value=.45;gain.gain.value=.0001;p.panningModel='HRTF';p.distanceModel='linear';p.refDistance=Math.max(z.radius*.05,.25);p.maxDistance=z.radius*1.15;p.rolloffFactor=.45;setPos(p,z.position,ctx.currentTime);input.connect(filter).connect(gain).connect(p).connect(dest);return{input,filter,gain,panner:p,zone:z}}
function makeSource(ctx,d,z){const c=chain(ctx,d,z);if(z.type==='drone')return drone(ctx,c,z);if(z.type==='noise')return noise(ctx,c,z);if(z.type==='bell')return bell(ctx,c,z);if(z.type==='pulse')return pulse(ctx,c,z);return hit(ctx,c,z)}
function drone(ctx,c,z){const mix=ctx.createGain(),a=ctx.createOscillator(),b=ctx.createOscillator(),l=ctx.createOscillator(),lg=ctx.createGain();mix.gain.value=.055;a.type=z.tone||'sine';b.type='sine';a.frequency.value=z.hz;b.frequency.value=z.hz*1.502;l.frequency.value=z.param||.15;lg.gain.value=z.hz*.015;l.connect(lg).connect(a.frequency);a.connect(mix);b.connect(mix);mix.connect(c.input);a.start();b.start();l.start();return c}
function noise(ctx,c,z){const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buf.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){const w=Math.random()*2-1;last=last*z.shade+w*(1-z.shade);data[i]=last*2.1}const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;src.loop=true;g.gain.value=.24;src.connect(g).connect(c.input);src.start();return c}
function pulse(ctx,c,z){const o=ctx.createOscillator(),m=ctx.createOscillator(),mg=ctx.createGain(),g=ctx.createGain();o.type='sine';o.frequency.value=z.hz;m.frequency.value=z.param;mg.gain.value=z.hz*.22;g.gain.value=.08;m.connect(mg).connect(o.frequency);o.connect(g).connect(c.input);o.start();m.start();return c}
function bell(ctx,c,z){let next=ctx.currentTime+.2+Math.random();const timer=setInterval(()=>{while(next<ctx.currentTime+.2){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=z.hz*(.997+Math.random()*.006);g.gain.setValueAtTime(.0001,next);g.gain.exponentialRampToValueAtTime(.12,next+.008);g.gain.exponentialRampToValueAtTime(.0001,next+.58);o.connect(g).connect(c.input);o.start(next);o.stop(next+.62);next+=z.param*(.78+Math.random()*.45)}},90);return{...c,timer}}
function hit(ctx,c,z){const o=ctx.createOscillator(),g=ctx.createGain();o.type=z.tone||'sine';o.frequency.value=z.hz;g.gain.value=0;o.connect(g).connect(c.input);o.start();let next=ctx.currentTime+.1+Math.random()*.3;const timer=setInterval(()=>{while(next<ctx.currentTime+.15){g.gain.cancelScheduledValues(next);g.gain.setValueAtTime(.0001,next);g.gain.exponentialRampToValueAtTime(.19,next+.005);g.gain.exponentialRampToValueAtTime(.0001,next+.065);next+=z.param*(.88+Math.random()*.24)}},55);return{...c,timer}}
function setPos(p,v,t){if(p.positionX){p.positionX.setValueAtTime(v.x,t);p.positionY.setValueAtTime(v.y,t);p.positionZ.setValueAtTime(v.z,t)}else p.setPosition(v.x,v.y,v.z)}
function updateAudio(){if(!audio)return;const ctx=audio.ctx,now=ctx.currentTime,f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize(),u=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).normalize(),L=ctx.listener;if(L.positionX){L.positionX.setTargetAtTime(camera.position.x,now,.015);L.positionY.setTargetAtTime(camera.position.y,now,.015);L.positionZ.setTargetAtTime(camera.position.z,now,.015);L.forwardX.setTargetAtTime(f.x,now,.015);L.forwardY.setTargetAtTime(f.y,now,.015);L.forwardZ.setTargetAtTime(f.z,now,.015);L.upX.setTargetAtTime(u.x,now,.015);L.upY.setTargetAtTime(u.y,now,.015);L.upZ.setTargetAtTime(u.z,now,.015)}else{L.setPosition(camera.position.x,camera.position.y,camera.position.z);L.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z)}const ranked=audio.sources.map((s,i)=>({i,d:camera.position.distanceTo(s.zone.position)})).sort((a,b)=>a.d-b.d),rank=new Map(ranked.map((x,i)=>[x.i,i]));audio.sources.forEach((s,i)=>{const dist=camera.position.distanceTo(s.zone.position),n=THREE.MathUtils.clamp(1-dist/s.zone.radius,0,1),r=rank.get(i),rg=r<3?1:r<5?.38:.05,prox=Math.pow(n,.82),vol=.0001+prox*.34*rg,cut=520+Math.pow(n,.75)*8500;s.gain.gain.setTargetAtTime(vol,now,.10);s.filter.frequency.setTargetAtTime(cut,now,.13)})}

let prev=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-prev)/1000,.05);prev=now;updateNavigation(dt);updateAudio();viewer.update();viewer.render();if(audio&&splatReady){const n=audio.sources.map(s=>({name:s.zone.name,d:camera.position.distanceTo(s.zone.position)})).sort((a,b)=>a.d-b.d).slice(0,3);status.textContent=`${currentScene.id} · nearest: ${n.map(x=>`${x.name} ${x.d.toFixed(1)}m`).join(' · ')}`}}requestAnimationFrame(frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=mobile()?68:62;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile()?1.15:1.5));renderer.setSize(innerWidth,innerHeight)});

loadScene(currentScene);
