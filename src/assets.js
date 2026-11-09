import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Character definitions. Each GLB is optional: if it is missing, a procedural
// stand-in figure is used so the game is always playable.
export const CHARACTERS = {
  hunter: { url: 'models/hunter.glb', height: 1.85, color: 0x3a2a20, accent: 0x7a1414 },
  seer: { url: 'models/seer.glb', height: 2.1, color: 0x4a3426, accent: 0x6a1c1c },
  wolf: { url: 'models/wolf.glb', height: 5.8, color: 0x5a4c48, accent: 0x9a8a80 },
};

// Keywords used to map whatever clip names a GLB carries onto game states.
const CLIP_KEYS = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['run'],
  attack: ['attack', 'slash'],
  hurt: ['hurt', 'hit'],
  death: ['death', 'fall', 'die'],
  leap: ['dive'],
};

// Tripo's preset clips are long; these windows (seconds) hold the useful motion.
// slash (a 6.4s sword combo): we keep only the first overhead chop — wind-up from 1.0s,
// blade lands ≈2.15s, recovered by 2.7s. Its root bone twists the body ~90° away from
// the target, so `lockRoot` freezes it and the hunter stays facing what he swings at.
const CLIP_TRIM = { slash: [1.0, 2.7, { lockRoot: true }], hurt: [0.0, 1.2], dive: [0.35, 1.4] };   // dive: crouch → pounce (cut before its somersault)
export const ATTACK_IMPACT = 0.66;

const loaded = {};

// Trim a clip to [t0, t1] seconds, keeping EVERY track. (AnimationUtils.subclip drops
// tracks that have no key inside the window, which froze most bones mid-strike.)
// Values at the window edges are sampled by interpolation, so the cut is seamless.
function trimClip(clip, t0, t1, { lockRoot = false } = {}) {
  const tracks = clip.tracks.map((tr) => {
    if (lockRoot && tr.name === 'BoneRoot.quaternion') {
      const q = [...tr.createInterpolant().evaluate(t0)];
      return new tr.constructor(tr.name, [0, t1 - t0], [...q, ...q]);
    }
    const n = tr.getValueSize();
    const interp = tr.createInterpolant();
    const times = [0], values = [...interp.evaluate(t0)];
    for (let i = 0; i < tr.times.length; i++) {
      const t = tr.times[i];
      if (t > t0 + 1e-4 && t < t1 - 1e-4) {
        times.push(t - t0);
        for (let k = 0; k < n; k++) values.push(tr.values[i * n + k]);
      }
    }
    times.push(t1 - t0);
    values.push(...interp.evaluate(t1));
    const T = tr.constructor;
    return new T(tr.name, times, values, tr.getInterpolation());
  });
  return new THREE.AnimationClip(clip.name, t1 - t0, tracks);
}

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const all = { ...CHARACTERS, ...PROPS, ...ENV };
  const names = Object.keys(all);
  let done = 0;
  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(all[name].url);
      loaded[name] = gltf;
    } catch {
      console.info(`[assets] ${name}.glb not found — using stand-in`);
    }
    onProgress?.(++done / names.length);
  }));
}

// Hand-held props. Blender pre-processed them: unit length, long axis +Y, origin at the grip.
export const PROPS = {
  cleaver: { url: 'models/cleaver.glb', length: 1.15 },
  censer: { url: 'models/censer.glb', length: 1.5 },
};

export function makeProp(name) {
  const g = new THREE.Group();
  if (loaded[name]) {
    const s = loaded[name].scene.clone(true);
    s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.metalness = 0.5; o.material.roughness = 0.45; } });
    s.scale.setScalar(PROPS[name].length);
    g.add(s);
  }
  return g;
}

export function hasModel(name) { return !!loaded[name]; }

// Environment props (Tripo text-to-model → tools/build_env.py: origin at the base, unit size).
// Tripo's models face +X; makeEnv() turns them to face +Z and scales them to a height in metres.
export const ENV = Object.fromEntries(['statue', 'lamp', 'doorway', 'balustrade', 'cart', 'cage', 'tree', 'coffins', 'pillar', 'brazier', 'archway', 'fountain', 'gate', 'shrine', 'cathedral', 'torch', 'candelabra', 'chandelier', 'barrels', 'crates', 'bones', 'tombstone', 'corpse', 'gargoyle', 'fence', 'lantern'].map((n) => [n, { url: `models/env/${n}.glb` }]));
const envPrepared = new Set();
export function makeEnv(name, height) {
  const gltf = loaded[name];
  if (!gltf) return null;
  if (!envPrepared.has(name)) {
    envPrepared.add(name);
    gltf.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material) { o.material.roughness = Math.max(0.55, o.material.roughness ?? 1); o.material.envMapIntensity = 0.8; } }
    });
    gltf.scene.rotation.y = -Math.PI / 2;
    gltf.scene.updateMatrixWorld(true);
    gltf.userData = { size: new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()) };
  }
  const g = new THREE.Group();
  const s = gltf.scene.clone(true);   // shares geometry + materials
  g.add(s);
  g.scale.setScalar(height / gltf.userData.size.y);
  g.userData.size = gltf.userData.size.clone().multiplyScalar(height / gltf.userData.size.y);
  return g;
}

// Wraps a rendered character: a GLB with an AnimationMixer, or a procedural figure.
export class CharacterModel {
  constructor(name) {
    const def = CHARACTERS[name];
    this.root = new THREE.Group();
    this.current = null;
    this.actions = {};
    this.time = 0;
    this.restore = new Map();
    if (loaded[name]) this.buildFromGLTF(loaded[name], def);
    else this.buildFallback(name, def);
  }

  buildFromGLTF(gltf, def) {
    const scene = cloneSkinned(gltf.scene);
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Cull against a generous bind-pose sphere: three would otherwise compute the skinned
        // sphere once from whatever pose it is in, and limbs could then poke out of it.
        if (o.isSkinnedMesh) {
          o.geometry.computeBoundingSphere();
          o.boundingSphere = o.geometry.boundingSphere.clone();
          o.boundingSphere.radius *= 1.6;
        }
        if (o.material) {
          o.material = o.material.clone();
          o.material.roughness = Math.max(0.6, o.material.roughness ?? 1);
          o.material.metalness = Math.min(0.3, o.material.metalness ?? 0);
        }
      }
    });
    // Normalize: scale to target height, feet on the ground, centred.
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const s = def.height / size.y;
    scene.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(scene);
    const c = box2.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box2.min.y, -c.z);
    // The pivot turns the model to face the game's forward (+Z) and cancels each
    // clip's baked-in hip drift (see calibrate()).
    this.pivot = new THREE.Group();
    this.pivot.add(scene);
    this.root.add(this.pivot);

    this.mixer = new THREE.AnimationMixer(scene);
    for (let clip of gltf.animations) {
      const n = clip.name.toLowerCase();
      const trim = CLIP_TRIM[n];
      if (trim) clip = trimClip(clip, trim[0], Math.min(trim[1], clip.duration), trim[2]);
      for (const [state, keys] of Object.entries(CLIP_KEYS)) {
        if (!this.actions[state] && keys.some((k) => n.includes(k))) {
          this.actions[state] = this.mixer.clipAction(clip);
        }
      }
    }
    // Fill gaps so play() never fails.
    const any = this.actions.idle || Object.values(this.actions)[0];
    for (const s of Object.keys(CLIP_KEYS)) if (!this.actions[s] && any) this.actions[s] = this.actions[s === 'run' ? 'walk' : 'idle'] || any;
    for (const s of ['attack', 'hurt', 'death', 'leap']) {
      const a = this.actions[s];
      if (a && a !== this.actions.idle) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    }
    this.calibrate(scene);
  }

  // Tripo's rigs face sideways (~+X, the hunter ~115°) and some clips (run) shift the hips
  // a metre or more off the origin. Measure both from the bones and correct them, so
  // what you see is where the character is and the way it is facing.
  calibrate(scene) {
    const bones = {};
    let skeleton = null;
    scene.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton; });
    const { Hip, L_Thigh, R_Thigh } = bones;
    this.offsets = new Map();
    if (!Hip || !L_Thigh || !R_Thigh || !skeleton) return;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const hipXZ = () => { this.root.updateMatrixWorld(true); Hip.getWorldPosition(v); return [v.x, v.z]; };
    // Facing from the bind pose: forward is perpendicular to the right→left thigh axis.
    skeleton.pose();
    this.root.updateMatrixWorld(true);
    L_Thigh.getWorldPosition(v); R_Thigh.getWorldPosition(w);
    const yaw = Math.atan2(-(v.z - w.z), v.x - w.x);
    this.pivot.rotation.y = -yaw;
    // Average hip offset per clip.
    const all = [...new Set(Object.values(this.actions))];
    for (const a of all) {
      for (const b of all) b.stop();
      a.reset().setEffectiveWeight(1).play();
      const D = a.getClip().duration, N = 12;
      let ox = 0, oz = 0;
      for (let i = 0; i < N; i++) {
        a.time = (D * i) / N;
        this.mixer.update(0);
        const [x, z] = hipXZ();
        ox += x / N; oz += z / N;
      }
      this.offsets.set(a, [ox, oz]);
    }
    // Widest stride of the run (right foot forward): used as the lunge stance for attacks.
    const run = this.actions.run, { L_Foot, R_Foot } = bones;
    if (run && L_Foot && R_Foot) {
      let best = -1e9;
      for (const b of all) b.stop();
      run.reset().setEffectiveWeight(1).play();
      for (let i = 0; i < 24; i++) {
        run.time = (run.getClip().duration * i) / 24;
        this.mixer.update(0);
        this.root.updateMatrixWorld(true);
        const dz = R_Foot.getWorldPosition(v).z - L_Foot.getWorldPosition(w).z;
        if (dz > best) { best = dz; this.strideT = run.time; }
      }
    }
    for (const b of all) b.stop();
    skeleton.pose();
    this.facingFix = yaw;
  }

  // Blend the drift correction of the clips currently playing.
  applyOffsets() {
    let x = 0, z = 0, wsum = 0;
    for (const [a, [ox, oz]] of this.offsets) {
      if (!a.isScheduled()) continue;
      const wt = a.getEffectiveWeight();
      x += ox * wt; z += oz * wt; wsum += wt;
    }
    if (wsum > 0) this.pivot.position.set(-x / wsum, 0, -z / wsum);
  }

  // Parent a prop to a bone. `rot` (Euler, radians) orients it in the hand; the bone's
  // inherited scale is cancelled so the prop keeps its real-world size.
  attach(prop, boneName, { rot = [0, 0, 0], offset = [0, 0, 0] } = {}) {
    let bone = null;
    this.root.traverse((o) => { if (!bone && o.isBone && o.name === boneName) bone = o; });
    if (!bone) return false;
    this.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    bone.getWorldScale(ws);
    const rs = new THREE.Vector3();
    this.root.getWorldScale(rs);
    prop.scale.setScalar(rs.x / ws.x);
    prop.rotation.set(...rot);
    prop.position.set(...offset).multiplyScalar(rs.x / ws.x);
    bone.add(prop);
    this.prop = prop;
    return true;
  }

  // Play a state clip. `duration` stretches a one-shot clip to fit a gameplay window.
  play(state, { fade = 0.15, duration = null, restart = false } = {}) {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = duration;
    if (!this.mixer) return;
    const next = this.actions[state];
    if (!next) return;
    if (next === this.current && !restart) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.timeScale = duration ? next.getClip().duration / duration : 1;
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
  }

  // Call before procedurally editing bones (after the mixer ran): they are restored next frame.
  protect(bones) { for (const b of bones) if (b && !this.restore.has(b)) this.restore.set(b, b.quaternion.clone()); }

  // Freeze a clip at time t (crossfading in): used to hold a pose, e.g. the lunge stance.
  hold(state, t, fade = 0.12) {
    const a = this.actions[state];
    if (!this.mixer || !a) return;
    this.state = state; this.stateTime = 0; this.stateDuration = null;
    if (this.current !== a) {
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
      if (this.current) a.crossFadeFrom(this.current, fade, false);
      this.current = a;
    }
    a.timeScale = 0;
    a.time = t;
  }

  setSpeed(scale) { if (this.current && !this.stateDuration) this.current.timeScale = scale; }

  update(dt) {
    this.time += dt;
    this.stateTime = (this.stateTime || 0) + dt;
    // Undo last frame's procedural edits first: the mixer only rewrites a bone when its
    // animated value changes, so on a held pose those edits would otherwise accumulate.
    for (const [b, q] of this.restore) b.quaternion.copy(q);
    this.restore.clear();
    if (this.mixer) { this.mixer.update(dt); if (this.offsets) this.applyOffsets(); }
    else this.animateFallback(dt);
  }

  // ---------- Procedural stand-in figures ----------
  buildFallback(name, def) {
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9 });
    const acc = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.8 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.7 });
    const H = def.height;
    const g = new THREE.Group();
    const part = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
    const p = {};
    const hunch = name === 'wolf' ? 0.35 : name === 'seer' ? 0.25 : 0;
    p.torso = part(new THREE.CylinderGeometry(H * 0.13, H * 0.1, H * 0.36, 8), mat, 0, H * 0.62, 0);
    p.torso.rotation.x = hunch;
    p.coat = part(new THREE.ConeGeometry(H * 0.17, H * 0.4, 9, 1, true), mat, 0, H * 0.38, 0);
    p.head = part(new THREE.SphereGeometry(H * 0.075, 10, 8), name === 'hunter' ? mat : bone, 0, H * 0.86, hunch * H * 0.25);
    if (name === 'hunter') {
      const brim = part(new THREE.CylinderGeometry(H * 0.15, H * 0.15, H * 0.012, 16), mat, 0, H * 0.9, 0);
      p.head.add(brim); brim.position.set(0, H * 0.04, 0);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.06, H * 0.075, H * 0.08, 10), mat);
      crown.position.y = H * 0.08; p.head.add(crown);
      const scarf = part(new THREE.TorusGeometry(H * 0.07, H * 0.02, 6, 12), acc, 0, H * 0.79, 0);
      scarf.rotation.x = Math.PI / 2;
    }
    if (name === 'seer') {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(H * 0.03, H * 0.16, 6), bone);
      beak.rotation.x = Math.PI / 2 + 0.4; beak.position.set(0, -H * 0.02, H * 0.09); p.head.add(beak);
    }
    if (name === 'wolf') {
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(H * 0.02, H * 0.14, 6), bone);
        horn.position.set(sx * H * 0.04, H * 0.09, -H * 0.02); horn.rotation.set(-0.5, 0, sx * -0.25); p.head.add(horn);
      }
      const snout = new THREE.Mesh(new THREE.BoxGeometry(H * 0.05, H * 0.05, H * 0.12), bone);
      snout.position.set(0, -H * 0.02, H * 0.08); p.head.add(snout);
      const mane = part(new THREE.SphereGeometry(H * 0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8c8580, roughness: 1 }), 0, H * 0.74, -H * 0.05);
      mane.scale.set(1, 0.7, 1);
    }
    const armLen = name === 'hunter' ? H * 0.34 : H * 0.46;
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const arm = new THREE.Group();
      arm.position.set(sx * H * 0.15, H * 0.76, 0);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.03, H * 0.022, armLen, 6), name === 'wolf' ? mat : acc);
      a.position.y = -armLen / 2; a.castShadow = true; arm.add(a);
      if (name !== 'hunter') {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(H * 0.03, H * 0.1, 5), bone);
        claw.position.y = -armLen - H * 0.04; claw.rotation.x = Math.PI; arm.add(claw);
      }
      g.add(arm); p['arm' + side] = arm;
      const leg = new THREE.Group();
      leg.position.set(sx * H * 0.06, H * 0.44, 0);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.035, H * 0.03, H * 0.44, 6), mat);
      l.position.y = -H * 0.22; l.castShadow = true; leg.add(l);
      g.add(leg); p['leg' + side] = leg;
    }
    if (name === 'hunter') {
      // Saw-cleaver stand-in in the right hand, lantern on the left hip.
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a8580, metalness: 0.8, roughness: 0.35 }));
      blade.position.set(0, -armLen - 0.35, 0.08);
      p.armR.add(blade);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff8020, emissiveIntensity: 2 }));
      lantern.position.set(H * 0.17, H * 0.47, 0.1); g.add(lantern);
    }
    this.parts = p;
    this.H = H;
    this.root.add(g);
    this.fig = g;
  }

  animateFallback() {
    const p = this.parts;
    const t = this.time;
    const st = this.state || 'idle';
    const k = this.stateDuration ? Math.min(1, this.stateTime / this.stateDuration) : 0;
    let swing = 0, armL = 0, armR = 0, lean = 0, bob = 0, drop = 0;
    if (st === 'walk' || st === 'run') {
      const f = st === 'run' ? 11 : 6.5;
      swing = Math.sin(t * f) * (st === 'run' ? 0.9 : 0.5);
      armL = -swing * 0.7; armR = swing * 0.7; lean = st === 'run' ? 0.25 : 0.08;
      bob = Math.abs(Math.sin(t * f)) * 0.05;
    } else if (st === 'attack') {
      // Wind-up then a fast downward/forward arc.
      const a = k < 0.4 ? -2.6 * (k / 0.4) : -2.6 + 3.6 * Math.min(1, (k - 0.4) / 0.25);
      armR = a; armL = a * 0.5; lean = k < 0.4 ? -0.1 : 0.3;
    } else if (st === 'hurt') {
      lean = -0.35 * Math.sin(Math.min(1, k) * Math.PI); armL = armR = -0.6;
    } else if (st === 'death') {
      lean = Math.min(1, k * 1.5) * -1.45; drop = Math.min(1, k * 1.5) * this.H * 0.1;
    } else {
      bob = Math.sin(t * 2) * 0.015; armL = Math.sin(t * 2) * 0.05; armR = -armL;
    }
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armL.rotation.x = armL; p.armR.rotation.x = armR;
    this.fig.rotation.x = lean;
    this.fig.position.y = bob - drop;
  }
}
