import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// v0.1 intentionally contains only the experiment:
// one navigable splat + three invisible synthetic sound zones.

const SPLAT_URL = 'https://huggingface.co/cakewalk/splat-data/resolve/main/garden.splat';

const stage = document.querySelector('#stage');
const enter = document.querySelector('#enter');
const status = document.querySelector('#status');

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 1);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 500);

// Tuned for the public garden scene. These are also the coordinates used by
// GaussianSplats3D's own garden demo, converted into a simple free-fly start.
camera.position.set(-3.15634, 0.16946, 0.51552);
camera.up.set(0, 1, 0.54).normalize();
camera.lookAt(1.52976, -2.27776, -1.65898);

const viewer = new GaussianSplats3D.Viewer({
  selfDrivenMode: false,
  renderer,
  camera,
  threeScene: scene,
  useBuiltInControls: false,
  sharedMemoryForWorkers: false,
  gpuAcceleratedSort: false,
  integerBasedSort: false,
  sphericalHarmonicsDegree: 0,
  renderMode: GaussianSplats3D.RenderMode.Always,
  sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
  logLevel: GaussianSplats3D.LogLevel.None
});

let splatReady = false;
viewer.addSplatScene(SPLAT_URL, {
  progressiveLoad: true,
  splatAlphaRemovalThreshold: 5,
  showLoadingUI: true,
  // Flip the source splat 180° around X so world +Y is up.
  rotation: [1, 0, 0, 0]
}).then(() => {
  splatReady = true;
  status.textContent = 'splat ready · click to enter';
}).catch((err) => {
  console.error(err);
  status.textContent = 'splat failed to load\nsee console';
});

// ---------------- navigation ----------------
const pressed = new Set();
let yaw = 0;
let pitch = 0;
let pointerLocked = false;

// Start yaw/pitch from current camera direction so entering doesn't jump.
const dir = new THREE.Vector3();
camera.getWorldDirection(dir);
yaw = Math.atan2(-dir.x, -dir.z);
pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));

addEventListener('keydown', (e) => pressed.add(e.code));
addEventListener('keyup', (e) => pressed.delete(e.code));
addEventListener('blur', () => pressed.clear());

renderer.domElement.addEventListener('click', () => {
  if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
  renderer.domElement.requestPointerLock?.();
});

enter.addEventListener('click', async () => {
  if (!audio) audio = createAudioWorld();
  await audio.ctx.resume();
  enter.style.display = 'none';
  renderer.domElement.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && audio) enter.style.display = 'grid';
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const sensitivity = 0.0018;
  yaw -= e.movementX * sensitivity;
  pitch -= e.movementY * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI * 0.48, Math.PI * 0.48);
});

function updateNavigation(dt) {
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0);

  const move = new THREE.Vector3();
  if (pressed.has('KeyW')) move.add(forward);
  if (pressed.has('KeyS')) move.sub(forward);
  if (pressed.has('KeyD')) move.add(right);
  if (pressed.has('KeyA')) move.sub(right);
  if (pressed.has('KeyE')) move.add(up);
  if (pressed.has('KeyQ')) move.sub(up);

  if (move.lengthSq() > 0) {
    const speed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 3.2 : 1.15;
    move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);
  }
}

// ---------------- synthetic spatial audio ----------------
let audio = null;

// Invisible locations. Deliberately asymmetric so moving around reveals them.
const SOUND_ZONES = [
  { name: 'rhythm',  position: new THREE.Vector3(-1.1, -0.15, -1.0), radius: 5.0 },
  { name: 'drone',   position: new THREE.Vector3( 2.8, -0.35, -2.4), radius: 7.0 },
  { name: 'texture', position: new THREE.Vector3( 0.8, -1.05,  2.5), radius: 4.5 }
];

function createAudioWorld() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.72;
  master.connect(ctx.destination);

  const sources = [
    makeRhythm(ctx, master, SOUND_ZONES[0]),
    makeDrone(ctx, master, SOUND_ZONES[1]),
    makeTexture(ctx, master, SOUND_ZONES[2])
  ];

  return { ctx, master, sources };
}

function makeSpatialChain(ctx, destination, zone) {
  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.55;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'linear';
  panner.refDistance = 0.4;
  panner.maxDistance = zone.radius;
  panner.rolloffFactor = 1;
  setPannerPosition(panner, zone.position, ctx.currentTime);

  input.connect(filter).connect(gain).connect(panner).connect(destination);
  return { input, filter, gain, panner, zone };
}

function makeRhythm(ctx, destination, zone) {
  const chain = makeSpatialChain(ctx, destination, zone);
  const osc = ctx.createOscillator();
  const pulse = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 78;
  pulse.gain.value = 0;
  osc.connect(pulse).connect(chain.input);
  osc.start();

  const bpm = 92;
  const step = 60 / bpm / 2;
  let next = ctx.currentTime + 0.05;
  let count = 0;
  const timer = setInterval(() => {
    while (next < ctx.currentTime + 0.12) {
      const accent = count % 4 === 0 ? 0.42 : 0.18;
      pulse.gain.cancelScheduledValues(next);
      pulse.gain.setValueAtTime(0.0001, next);
      pulse.gain.exponentialRampToValueAtTime(accent, next + 0.006);
      pulse.gain.exponentialRampToValueAtTime(0.0001, next + 0.085);
      next += step;
      count++;
    }
  }, 40);
  return { ...chain, timer };
}

function makeDrone(ctx, destination, zone) {
  const chain = makeSpatialChain(ctx, destination, zone);
  const mix = ctx.createGain();
  mix.gain.value = 0.12;
  [55, 82.5, 110].forEach((hz, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = i === 1 ? 'triangle' : 'sine';
    osc.frequency.value = hz;
    g.gain.value = i === 0 ? 0.8 : 0.32;
    osc.connect(g).connect(mix);
    osc.start();
  });
  mix.connect(chain.input);
  return chain;
}

function makeTexture(ctx, destination, zone) {
  const chain = makeSpatialChain(ctx, destination, zone);
  const seconds = 2;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015; // soft brown-ish texture
    data[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(g).connect(chain.input);
  src.start();
  return chain;
}

function setPannerPosition(panner, v, t) {
  if (panner.positionX) {
    panner.positionX.setValueAtTime(v.x, t);
    panner.positionY.setValueAtTime(v.y, t);
    panner.positionZ.setValueAtTime(v.z, t);
  } else {
    panner.setPosition(v.x, v.y, v.z);
  }
}

function updateAudio() {
  if (!audio) return;
  const ctx = audio.ctx;
  const now = ctx.currentTime;

  // Web Audio's listener follows the Three.js camera.
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  const L = ctx.listener;

  if (L.positionX) {
    L.positionX.setTargetAtTime(camera.position.x, now, 0.015);
    L.positionY.setTargetAtTime(camera.position.y, now, 0.015);
    L.positionZ.setTargetAtTime(camera.position.z, now, 0.015);
    L.forwardX.setTargetAtTime(fwd.x, now, 0.015);
    L.forwardY.setTargetAtTime(fwd.y, now, 0.015);
    L.forwardZ.setTargetAtTime(fwd.z, now, 0.015);
    L.upX.setTargetAtTime(up.x, now, 0.015);
    L.upY.setTargetAtTime(up.y, now, 0.015);
    L.upZ.setTargetAtTime(up.z, now, 0.015);
  } else {
    L.setPosition(camera.position.x, camera.position.y, camera.position.z);
    L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }

  for (const source of audio.sources) {
    const d = camera.position.distanceTo(source.zone.position);
    const normalized = THREE.MathUtils.clamp(1 - d / source.zone.radius, 0, 1);
    // A smooth perceptual fade plus a distance-controlled low-pass filter.
    const loudness = 0.0001 + Math.pow(normalized, 1.65) * 0.72;
    const cutoff = 220 + Math.pow(normalized, 1.3) * 10500;
    source.gain.gain.setTargetAtTime(loudness, now, 0.075);
    source.filter.frequency.setTargetAtTime(cutoff, now, 0.09);
  }
}

// ---------------- render loop ----------------
let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;

  updateNavigation(dt);
  updateAudio();
  viewer.update();
  viewer.render();

  if (audio && splatReady) {
    const values = audio.sources.map((s) => `${s.zone.name}:${camera.position.distanceTo(s.zone.position).toFixed(1)}m`);
    status.textContent = values.join('  ');
  }
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
