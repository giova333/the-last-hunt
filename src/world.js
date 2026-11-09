import * as THREE from 'three';
import { makeEnv } from './assets.js';

// Saint Orlan's Ward — one linear level:
//   gate courtyard (lantern) → plague street → cistern plaza (lantern) →
//   cathedral steps → fog gate → the Hound's courtyard (boss arena).
// Coordinates: the player starts at the origin and travels toward +Z.

export const ARENA = { x: 0, z: 128, r: 19, y: 2.4 };
export const GATE_Z = 104;

// Walkable regions (union). Anything outside is a wall.
const RECTS = [
  { x0: -6.2, x1: 6.2, z0: -9, z1: 62 },     // street
  { x0: -15.5, x1: 15.5, z0: 58, z1: 92 },   // plaza
  { x0: -5.2, x1: 5.2, z0: 90, z1: 112 },    // steps + gate passage
];

export function heightAt(x, z) {
  if (z < 93) return 0;
  if (z < 101) return ((z - 93) / 8) * ARENA.y;
  return ARENA.y;
}

function inside(x, z, r, gateOpen, gateSealed) {
  if (!gateOpen && z > GATE_Z - 0.6 - r) return false;       // fog gate not yet crossed
  if (gateSealed && z < GATE_Z + 3 + r) return false;          // sealed in with the boss
  for (const R of RECTS) if (x > R.x0 + r && x < R.x1 - r && z > R.z0 + r && z < R.z1 - r) return true;
  const dx = x - ARENA.x, dz = z - ARENA.z;
  if (Math.hypot(dx, dz) < ARENA.r - r) return true;
  return false;
}

// ---------- procedural textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Draw a height map on a canvas and convert it to a tangent-space normal map.
function normalTex(size, draw, strength = 2.5) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function cobbleTextures() {
  const rand = mulberry(7);
  const stones = [];
  const N = 14;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    stones.push({ x: (x + (y % 2) * 0.5 + (rand() - 0.5) * 0.2) / N, y: (y + (rand() - 0.5) * 0.2) / N, s: (0.8 + rand() * 0.25) / N, v: rand() });
  }
  const color = canvasTex(512, (g, S) => {
    g.fillStyle = '#121012'; g.fillRect(0, 0, S, S);
    for (const st of stones) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      const l = 28 + st.v * 26;
      g.fillStyle = `rgb(${l + 4},${l},${l + 2})`;
      g.beginPath();
      g.roundRect((st.x + ox) * S - st.s * S / 2, (st.y + oy) * S - st.s * S / 2, st.s * S, st.s * S * 0.92, st.s * S * 0.3);
      g.fill();
    }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.25})`; g.fillRect(rand() * S, rand() * S, 2, 2); }
    // Dried blood stains.
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,6,6,0.35)'; g.beginPath(); g.ellipse(rand() * S, rand() * S, 10 + rand() * 30, 6 + rand() * 18, rand() * 3, 0, 7); g.fill(); }
  }, 1);
  const rough = canvasTex(512, (g, S) => {
    g.fillStyle = '#444'; g.fillRect(0, 0, S, S); // grout: shiny (wet)
    for (const st of stones) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      const r = 120 + st.v * 110;
      g.fillStyle = `rgb(${r},${r},${r})`;
      g.beginPath(); g.roundRect((st.x + ox) * S - st.s * S / 2, (st.y + oy) * S - st.s * S / 2, st.s * S, st.s * S * 0.92, st.s * S * 0.3); g.fill();
    }
    for (let i = 0; i < 10; i++) { g.fillStyle = '#181818'; g.beginPath(); g.ellipse(rand() * S, rand() * S, 20 + rand() * 50, 10 + rand() * 30, rand() * 3, 0, 7); g.fill(); } // puddles
  }, 1);
  rough.colorSpace = THREE.NoColorSpace;
  // Domed stones, deep grout.
  const normal = normalTex(512, (g, S) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (const st of stones) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      const cx = (st.x + ox) * S, cy = (st.y + oy) * S, r = st.s * S / 2;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.1);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#c8c8c8'); gr.addColorStop(1, '#303030');
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(cx - r, cy - r, r * 2, r * 2 * 0.92, r * 0.6); g.fill();
    }
  }, 1.8);
  return { color, rough, normal };
}

function stoneNormal() {
  const rand = mulberry(3);
  return normalTex(512, (g, S) => {
    g.fillStyle = '#202020'; g.fillRect(0, 0, S, S);
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const h = S / rows; let x = (r % 2) * -30;
      while (x < S) { const w = 50 + rand() * 50; const l = 150 + rand() * 60; g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(x + 3, r * h + 3, w - 6, h - 6); x += w; }
    }
    for (let i = 0; i < 4000; i++) { const v = Math.floor(rand() * 90); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(rand() * S, rand() * S, 3, 3); }
  }, 2.2);
}

function stoneTexture() {
  const rand = mulberry(3);
  return canvasTex(512, (g, S) => {
    g.fillStyle = '#2a2628'; g.fillRect(0, 0, S, S);
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const h = S / rows; let x = (r % 2) * -30;
      while (x < S) {
        const w = 50 + rand() * 50; const l = 34 + rand() * 18;
        g.fillStyle = `rgb(${l},${l - 3},${l - 2})`; g.fillRect(x + 2, r * h + 2, w - 4, h - 4); x += w;
      }
    }
    for (let i = 0; i < 40; i++) { const x = rand() * S; g.fillStyle = `rgba(10,8,8,${0.2 + rand() * 0.3})`; g.fillRect(x, 0, 2 + rand() * 6, S * rand()); } // grime streaks
  }, 1);
}

// Additive cone of light: brightest at the apex, soft at its silhouette edges.
function lightConeMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { c: { value: color }, s: { value: strength } },
    vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ vH = -position.y / 3.2; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vH; varying vec3 vN; varying vec3 vV; uniform vec3 c; uniform float s;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 3.0); float fall = pow(1.0 - clamp(vH, 0.0, 1.0), 2.2);
        gl_FragColor = vec4(c * s * edge * fall, 1.0); }`,
  });
}

// One clock for every animated world shader (flames, embers, banner sway); World.update ticks it.
const worldTime = { value: 0 };

// A copy of a textured standard material whose amber/orange texels (the lantern's glass panes)
// emit light, scaled by the shared `glow` uniform. The mask comes from the texture colour, so
// the iron, wax and bone stay unlit. Linear-space values: amber ≈ (0.7, 0.32, 0.05).
function amberGlowMaterial(src, glow) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float amber = smoothstep(0.3, 0.45, diffuseColor.r - diffuseColor.b) * (1.0 - smoothstep(0.15, 0.3, diffuseColor.b));
      totalEmissiveRadiance += diffuseColor.rgb * amber * uGlow;`);
  };
  m.customProgramCacheKey = () => 'amberGlow';
  return m;
}

// Brazier fire: a camera-facing (Y-axis) quad with a procedural noise flame. One material and
// one geometry shared by every brazier; each flame's phase comes from its world position, so
// they never flicker in sync. Additive, no depth write, no lights: as cheap as the old cone.
let flameMat, flameGeo;
function flameMesh() {
  flameGeo ??= new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  flameMat ??= new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: worldTime },
    vertexShader: `varying vec2 vUv; varying float vPh;
      void main(){
        vUv = uv;
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vPh = c.x * 1.7 + c.z * 0.9;
        vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
        vec3 wp = c + right * position.x * sx + vec3(0.0, position.y * sy, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `varying vec2 vUv; varying float vPh; uniform float t;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ return noise(p) * 0.55 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 + 7.7) * 0.15; }
      void main(){
        float h = vUv.y, x = vUv.x - 0.5;
        float n = fbm(vec2(x * 4.0 + vPh, h * 3.2 - t * 3.4 + vPh));
        float width = mix(0.36, 0.03, pow(h, 0.75));
        float d = abs(x + (n - 0.5) * 0.3 * h) / width;
        float body = (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - smoothstep(0.45, 1.0, h + (n - 0.5) * 0.45)) * smoothstep(0.0, 0.12, h);
        float core = (1.0 - smoothstep(0.0, 0.6, d)) * (1.0 - smoothstep(0.1, 0.55, h));
        vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.55, 0.12), body) + vec3(1.0, 0.85, 0.5) * core;
        gl_FragColor = vec4(col * body * 1.5, 1.0);
      }`,
  });
  const m = new THREE.Mesh(flameGeo, flameMat);
  m.frustumCulled = false;   // billboarded in the shader; the quad's own bounds don't apply
  return m;
}

// Embers rising from every brazier: one Points object (one draw call) animated entirely in the
// vertex shader. Each point loops on its own seed; no per-frame CPU work.
function emberPoints(sources, perSource = 18) {
  const n = sources.length * perSource, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = sources[(i / perSource) | 0]; pos.set([s.x, s.y, s.z], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const p = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: worldTime, px: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `attribute float seed; uniform float t, px; varying float vA;
      void main(){
        float k = fract(t * (0.35 + seed * 0.3) + seed * 17.0);
        float a = seed * 40.0 + t * (1.5 + seed);
        vec3 p = position + vec3(sin(a) * 0.35 * k, k * (2.2 + seed * 1.6), cos(a * 0.8) * 0.35 * k);
        vA = (1.0 - k) * smoothstep(0.0, 0.08, k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = px * (2.0 + 3.0 * seed) * (6.0 / max(-mv.z, 1.0)) * 1.2;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * vA * (1.0 - d * 2.0) * 1.6, 1.0); }`,
  }));
  p.frustumCulled = false;
  return p;
}

// Hanging cloth: a cut-out texture (alpha-tested, so no transparency sorting) that sways in the
// vertex shader, more toward the hem. One material for every banner; phase from world position.
function swayBanner(mat, height) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.t = worldTime;
    sh.vertexShader = 'uniform float t;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hang = clamp((${(height / 2).toFixed(3)} - position.y) / ${height.toFixed(3)}, 0.0, 1.0);
      vec3 o = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float ph = o.x * 1.3 + o.z * 0.7;
      transformed.z += hang * hang * (0.12 * sin(t * 1.4 + ph + hang * 2.4) + 0.04 * sin(t * 3.3 + ph * 2.0 + position.x * 3.0));`);
  };
  mat.customProgramCacheKey = () => 'swayBanner';
  return mat;
}

export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- world ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // circles {x,z,r}
    this.lanterns = [];
    this.notes = [];
    this.flames = [];
    this.gateOpen = false;
    this.gateSealed = false;
    this.time = 0;
    this.rand = mulberry(42);

    const stone = stoneTexture();
    const stoneN = stoneNormal();
    this.mat = {
      stone: new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.88, color: 0x9a9090 }),
      darkStone: new THREE.MeshStandardMaterial({ map: stone, normalMap: stoneN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, color: 0x5a5254 }),
      trim: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.85, color: 0x6e6466 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x17161c, roughness: 0.8 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x2d2018, roughness: 0.95 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1b1a1a, roughness: 0.5, metalness: 0.8 }),
      window: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff9a40, emissiveIntensity: 1.6 }),
      darkWindow: new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.3 }),
      banner: new THREE.MeshStandardMaterial({ color: 0x5a0e10, roughness: 0.9, side: THREE.DoubleSide }),
      flame: new THREE.MeshBasicMaterial({ color: 0xffb060 }),
      bone: new THREE.MeshStandardMaterial({ color: 0x9a907c, roughness: 0.9 }),
    };

    this.buildSky();
    this.buildLighting();
    this.buildGround();
    this.buildStreet();
    this.buildPlaza();
    this.buildSteps();
    this.buildArena();
    this.buildDistantCity();
    this.buildAsh();
    this.buildMist();
    this.buildLeaves();
    this.buildDetails();
    if (this.emberSrc) this.add(emberPoints(this.emberSrc));
  }

  // Small Tripo set-dressing props (each call is a no-op if that model is missing).
  buildDetails() {
    const r = this.rand;
    // Wall torches beside the doors of street houses, with flickering glows.
    for (const [i, f] of (this.facades || []).entries()) {
      if (f.z > 60 || f.z < -6 || i % 2) continue;
      const side = Math.sign(f.x) || 1;                 // facade on the east (+) or west (−) side
      const tz = f.z + (i % 4 === 0 ? 1 : -1) * Math.min(3.0, f.w * 0.37);
      if (this.lampSpots?.some(([lx, lz]) => Math.sign(lx) === side && Math.abs(lz - tz) < 4)) continue;   // a street lamp already lights this stretch
      const m = this.prop('torch', 1.1, f.x - side * 0.2, tz, -side * Math.PI / 2, { y: 2.0 });
      if (m) this.glow(f.x - side * 0.42, 3.0, tz, 0.85, 0xff9a40);
    }
    // Hanging chandeliers: inside the fog-gate arch and under the gatehouse, each with a real light.
    for (const [x, yTop, z] of [[0, ARENA.y + 10.4, GATE_Z + 0.4], [0, 8.6, -11.5]]) {
      const h = 2.8, m = this.prop('chandelier', h, x, z, 0, { y: yTop - h });
      if (!m) continue;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this.glow(x + Math.cos(a) * 0.62, yTop - h + 0.42, z + Math.sin(a) * 0.62, 0.32); }
      const l = new THREE.PointLight(0xffa050, 10, 14, 1.6); l.position.set(x, yTop - h + 0.3, z); this.add(l); this.flames.push(l);
    }
    // Candelabras before the cathedral. (Checkpoint lanterns stand alone: the model carries its own candles.)
    for (const [x, z, y] of [[-5.5, ARENA.z + 17.6, ARENA.y], [5.5, ARENA.z + 17.6, ARENA.y]]) {
      if (this.prop('candelabra', 1.9, x, z, r() * 6.28, { y, r: 0.35 })) this.glow(x, y + 1.85, z, 0.6, 0xffb060);
    }
    // The Hound's lair: skull piles around the arena edge.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.4, rr = ARENA.r - 2.5 - r() * 2;
      if (Math.abs(Math.sin(a) + 1) < 0.25) continue;   // keep the entrance clear
      this.prop('bones', 0.7, ARENA.x + Math.cos(a) * rr, ARENA.z + Math.sin(a) * rr, r() * 6.28, { y: ARENA.y });
    }
    // Plague dead along the street and plaza.
    for (const [x, z] of [[-2.8, 11], [3.4, 23], [-4.2, 37.5], [2.2, 50], [6.5, 66], [-5.5, 81]]) this.corpse(x, z, r() * 6.28);
    // A small graveyard by the plaza's dead tree, fenced off from the square.
    for (const [x, z] of [[-14.4, 59.6], [-12.4, 63.4], [-14.5, 65.2], [-11.4, 59.8], [-13.4, 67.3]]) this.prop('tombstone', 1.3, x, z, Math.PI / 2 + (r() - 0.5) * 0.4, { r: 0.4 });
    if (this.balustrade(-10.3, 58.6, -10.3, 62, 0, 1.6, 'fence') && this.balustrade(-10.3, 64.2, -10.3, 68.6, 0, 1.6, 'fence')) {
      for (let z = 58.8; z < 68.6; z += 0.9) if (z < 62 || z > 64.2) this.colliders.push({ x: -10.3, z, r: 0.35 });
      this.balustrade(-10.3, 68.6, -15.4, 68.6, 0, 1.6, 'fence');
    }
    // Gargoyles crouched on the passage walls, watching the fog gate.
    for (const s of [-1, 1]) for (const z of [97.5, 108]) this.prop('gargoyle', 1.6, s * 5.8, z, -s * Math.PI / 2, { y: ARENA.y + 7 });
  }

  // Low ground mist: layered noise planes that drift, fading near the camera so their
  // intersection with walls and legs never reads as a hard edge.
  buildMist() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, cam: { value: new THREE.Vector3() }, k: { value: 1 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float t; uniform vec3 cam; uniform float k;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.1; a *= 0.5; } return s; }
        void main(){
          vec2 p = vW.xz * 0.12 + vec2(t * 0.03 * k, t * 0.012);
          float m = fbm(p + fbm(p * 0.7 - t * 0.02));
          float a = smoothstep(0.45, 0.9, m) * 0.2;
          float d = distance(vW, cam);
          a *= smoothstep(1.5, 7.0, d) * (1.0 - smoothstep(45.0, 80.0, d));
          gl_FragColor = vec4(vec3(0.34, 0.37, 0.45), a);
        }`,
    });
    this.mist = [];
    const layer = (w, d, x, y, z, k) => {
      const m = mat.clone(); m.uniforms.k.value = k;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.renderOrder = 3; this.add(p); this.mist.push(p);
    };
    layer(60, 120, 0, 0.35, 40, 1); layer(60, 120, 0, 0.9, 40, -0.7);
    layer(50, 50, 0, ARENA.y + 0.35, ARENA.z, 1); layer(50, 50, 0, ARENA.y + 1.0, ARENA.z, -0.8);
  }

  // Fallen red leaves (the concept's signature colour), drifted against the walls.
  buildLeaves() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 18, 54, 46, 32, 62); g.bezierCurveTo(10, 46, 6, 18, 32, 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 60); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const N = 4200;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const r = this.rand;
    const edge = (half) => Math.sign(r() - 0.5) * (half - Math.pow(r(), 3.5) * half); // bias to the walls
    for (let i = 0; i < N; i++) {
      let x, z;
      const zone = r();
      if (zone < 0.5) { x = edge(6.1); z = -8 + r() * 69; }
      else if (zone < 0.82) { x = edge(15.4); z = 58 + r() * 34; }
      else { const a = r() * Math.PI * 2, rr = ARENA.r * Math.sqrt(0.2 + r() * 0.8); x = ARENA.x + Math.cos(a) * rr; z = ARENA.z + Math.sin(a) * rr; }
      const y = heightAt(x, z) + 0.012 + r() * 0.01;
      e.set((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4); q.setFromEuler(e);
      const sc = 0.5 + r() * 0.6;
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(i, m);
      const k = r();
      col.setRGB(0.16 + k * 0.2, 0.015 + k * 0.035 * r(), 0.01 + k * 0.012).multiplyScalar(r() < 0.25 ? 0.55 : 1);
      mesh.setColorAt(i, col);
    }
    mesh.receiveShadow = true;
    this.add(mesh);
  }

  add(o) { this.scene.add(o); return o; }
  box(w, h, d, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
    return this.add(m);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { moonDir: { value: new THREE.Vector3(0.3, 0.32, 1).normalize() }, t: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 moonDir; uniform float t;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -0.1, 1.0);
          vec3 col = mix(vec3(0.10,0.11,0.16), vec3(0.02,0.022,0.04), pow(max(h,0.0), 0.55));
          float d = dot(dir, moonDir);
          // Large moon with maria (dark seas) and a soft rim.
          float R = 0.9955;
          if (d > R - 0.0004) {
            vec3 up = normalize(cross(moonDir, vec3(1.0,0.0,0.0))), rt = cross(up, moonDir);
            vec2 mp = vec2(dot(dir, rt), dot(dir, up)) * 60.0;
            float maria = fbm(mp * 1.3 + 3.0);
            vec3 moon = vec3(0.95,0.95,1.0) * (0.78 + 0.22 * smoothstep(0.35, 0.75, maria));
            col = mix(col, moon * 0.85, smoothstep(R - 0.0004, R + 0.0002, d));
          }
          col += vec3(0.35,0.38,0.5) * pow(max(d,0.0), 300.0) * 0.35;   // tight glow
          col += vec3(0.16,0.18,0.25) * pow(max(d,0.0), 18.0) * 0.35;   // wide halo
          // Stars, hidden by clouds.
          float s = step(0.9982, hash(floor(dir * 320.0))) * smoothstep(0.1, 0.5, h);
          // Clouds: fbm projected on a dome, drifting, lit silver near the moon.
          vec2 cp = dir.xz / max(dir.y + 0.12, 0.05) * 1.4 + vec2(t * 0.006, t * 0.002);
          float c = smoothstep(0.42, 0.85, fbm(cp));
          float lit = pow(max(d,0.0), 8.0);
          vec3 cloud = mix(vec3(0.05,0.055,0.07), vec3(0.42,0.45,0.54), lit * 0.9 + 0.08);
          col = mix(col + s * 0.6, cloud, c * smoothstep(-0.05, 0.12, dir.y) * 0.92);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = this.add(new THREE.Mesh(geo, mat));
  }

  buildLighting() {
    this.add(new THREE.HemisphereLight(0x8a9cc8, 0x2a2018, 2.4));
    const moon = new THREE.DirectionalLight(0xc0d0f4, 3.6);
    moon.position.set(35, 60, 80);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const c = moon.shadow.camera; c.left = c.bottom = -30; c.right = c.top = 30; c.near = 1; c.far = 200;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.04;
    this.moon = moon;
    this.add(moon); this.add(moon.target);
  }

  // Many flames, few real lights. Every lit pixel pays for every PointLight in the scene, so
  // the world's flame/lantern lights become virtual sources (still flickered and lit as before)
  // and a fixed pool of real lights follows the ones nearest the camera. A source fades out as
  // it nears the edge of the set, so lights hand over smoothly instead of popping.
  // Call once, right after construction (before actors add their own lights).
  poolLights(budget) {
    const sources = [];
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => { if (o.isPointLight && o !== this.roseLight) sources.push(o); });
    for (const l of sources) { l.userData.at = l.getWorldPosition(new THREE.Vector3()); l.removeFromParent(); }
    this.lightSources = sources;
    this.lightPool = Array.from({ length: Math.min(budget, sources.length) }, () => this.add(new THREE.PointLight(0xffffff, 0, 1, 1)));
  }

  // Ranks sources by distance from the camera, with lights behind it pushed back (they light
  // little of what's on screen), and hands the pool to the best ones.
  updateLightPool(camera) {
    const S = this.lightSources, pool = this.lightPool;
    if (!pool) return;
    const c = camera.position, f = camera.getWorldDirection(this._camF ??= new THREE.Vector3());
    for (const l of S) {
      const at = l.userData.at;
      if (l.intensity <= 0) { l.userData.d = Infinity; continue; }
      const d = at.distanceTo(c), ahead = ((at.x - c.x) * f.x + (at.y - c.y) * f.y + (at.z - c.z) * f.z) / Math.max(d, 1e-3);
      l.userData.d = d + Math.max(0, -ahead) * 12;
    }
    S.sort((a, b) => a.userData.d - b.userData.d);
    const edge = S[pool.length]?.userData.d ?? Infinity;   // best source left out
    for (let i = 0; i < pool.length; i++) {
      const src = S[i], L = pool[i];
      if (src.userData.d === Infinity) { L.intensity = 0; continue; }
      L.position.copy(src.userData.at);
      L.color.copy(src.color); L.distance = src.distance; L.decay = src.decay;
      L.intensity = src.intensity * Math.min(1, (edge - src.userData.d) / 4);
    }
  }

  followShadow(pos) {
    this.moon.position.set(pos.x + 35, pos.y + 60, pos.z + 80);
    this.moon.target.position.copy(pos);
  }

  buildGround() {
    const { color, rough, normal } = cobbleTextures();
    color.repeat.set(30, 90); rough.repeat.set(30, 90); normal.repeat.set(30, 90);
    // Rain-wet cobbles: relief from the normal map, puddles from the roughness map, sky reflections.
    const mat = new THREE.MeshStandardMaterial({ map: color, roughnessMap: rough, normalMap: normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85, metalness: 0.1, envMapIntensity: 0.6 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 240), mat);
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 90); g.receiveShadow = true;
    this.add(g);
    this.cobbleMat = mat;
  }

  // A narrow gothic townhouse facing the street.
  townhouse(x, z, w, d, h, face) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat.stone);
    body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    // steep gable roof
    const roofShape = new THREE.Shape(); roofShape.moveTo(-w / 2 - 0.3, 0); roofShape.lineTo(0, h * 0.55); roofShape.lineTo(w / 2 + 0.3, 0);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: d + 0.4, bevelEnabled: false }), this.mat.roof);
    roof.position.set(0, h, -d / 2 - 0.2); roof.castShadow = true; g.add(roof);
    // spire on some
    if (this.rand() < 0.35) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.6, 5 + this.rand() * 4, 6), this.mat.roof);
      sp.position.set(0, h + h * 0.55 + 2, 0); sp.castShadow = true; g.add(sp);
    }
    // windows on the street face (local +Z)
    const rows = Math.floor(h / 3.2);
    for (let r = 0; r < rows; r++) for (let c = -1; c <= 1; c += 2) {
      if (w < 4 && c === 1) continue;
      const lit = this.rand() < 0.22;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), lit ? this.mat.window : this.mat.darkWindow);
      win.position.set(w < 4 ? 0 : c * w * 0.22, 2.4 + r * 3.2, d / 2 + 0.02); g.add(win);
      const arch = new THREE.Mesh(new THREE.CircleGeometry(0.35, 10, 0, Math.PI), lit ? this.mat.window : this.mat.darkWindow);
      arch.position.set(win.position.x, win.position.y + 0.75, d / 2 + 0.02); g.add(arch);
      // Stone surround: jambs, pointed hood and a sill.
      for (const sx of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 0.16), this.mat.trim); j.position.set(win.position.x + sx * 0.42, win.position.y + 0.05, d / 2 + 0.06); g.add(j); }
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.07, 4, 10, Math.PI), this.mat.trim); hood.position.set(win.position.x, win.position.y + 0.8, d / 2 + 0.06); g.add(hood);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.3), this.mat.trim); sill.position.set(win.position.x, win.position.y - 0.82, d / 2 + 0.1); g.add(sill);
    }
    // String courses between floors, a heavy plinth and corner quoins.
    for (let r = 1; r <= rows; r++) { const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, 0.22), this.mat.trim); band.position.set(0, r * 3.2 + 0.2, d / 2 + 0.05); g.add(band); }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.7, d + 0.2), this.mat.darkStone); plinth.position.y = 0.35; plinth.receiveShadow = true; g.add(plinth);
    for (const sx of [-1, 1]) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35), this.mat.trim); q.position.set(sx * (w / 2 - 0.1), h / 2, d / 2 - 0.05); q.castShadow = true; g.add(q); }
    // door: carved gothic doorway (Tripo) or a plain plank door.
    const dw = makeEnv('doorway', 3.3);
    if (dw) { dw.position.set(0, 0, d / 2 + dw.userData.size.z / 2 - 0.25); g.add(dw); }
    else { const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.2), this.mat.wood); door.position.set(0, 1.15, d / 2); g.add(door); }
    g.position.set(x, 0, z); g.rotation.y = face;
    (this.facades ??= []).push({ x: x + Math.sin(face) * d / 2, z: z + Math.cos(face) * d / 2, w, face });
    this.add(g);
  }

  lamp(x, z, withLight = true) {
    const y = heightAt(x, z);
    (this.lampSpots ??= []).push([x, z]);
    const m = makeEnv('lamp', 4.0);
    if (m) { m.position.set(x, y, z); m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; this.add(m); }
    else {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), this.mat.iron);
      post.position.set(x, y + 1.6, z); post.castShadow = true; this.add(post);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.45, 6, 1, true), this.mat.iron);
      cage.position.set(x, y + 3.35, z); this.add(cage);
    }
    const flame = new THREE.Mesh(new THREE.SphereGeometry(m ? 0.07 : 0.11, 8, 6), this.mat.flame);
    flame.position.set(x, y + (m ? 3.45 : 3.3), z); this.add(flame);
    this.flames.push(flame);
    if (withLight) {
      const l = new THREE.PointLight(0xff9040, 16, 18, 1.5);
      l.position.set(x, y + 3.2, z); this.add(l);
      this.flames.push(l);
      // Soft volumetric glow falling from the lamp through the mist.
      const cone = new THREE.Mesh(this.coneGeo ??= new THREE.ConeGeometry(1.7, 3.2, 24, 1, true).translate(0, -1.6, 0), this.coneMat ??= lightConeMaterial(new THREE.Color(1.0, 0.62, 0.32), 0.07));
      cone.position.set(x, y + 3.25, z); cone.renderOrder = 2; this.add(cone);
    }
    this.colliders.push({ x, z, r: 0.25 });
  }

  brazier(x, z, light = true) {
    const y = heightAt(x, z);
    // Carved pedestal brazier (Tripo) or a plain iron bowl on a leg.
    const m = makeEnv('brazier', 2.2);
    const top = m ? 2.05 : 1.3;
    if (m) { m.position.set(x, y, z); m.rotation.y = Math.atan2(-x, -z + 0.001); this.add(m); }
    else {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.4, 8), this.mat.iron);
      bowl.position.set(x, y + 1.1, z); bowl.castShadow = true; this.add(bowl);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.9, 6), this.mat.iron);
      leg.position.set(x, y + 0.45, z); this.add(leg);
    }
    // Shader flame (animates itself), a warm halo over the coals, and embers (built in one batch).
    const fire = flameMesh(); fire.position.set(x, y + top - 0.12, z); fire.scale.set(1.25, 1.45, 1); this.add(fire);
    this.glow(x, y + top + 0.15, z, 1.1, 0xff7a30);
    (this.emberSrc ??= []).push({ x, y: y + top, z });
    if (light) { const l = new THREE.PointLight(0xff7a30, 12, 16, 1.5); l.position.set(x, y + top + 0.7, z); this.add(l); this.flames.push(l); }
    this.colliders.push({ x, z, r: 0.5 });
  }

  statue(x, z, ry = 0, scale = 1) {
    const y = heightAt(x, z);
    const m = makeEnv('statue', 3.4 * scale);
    if (m) {
      m.position.set(x, y, z); m.rotation.y = ry; this.add(m);
      this.colliders.push({ x, z, r: 0.75 * scale });
      return;
    }
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), this.mat.darkStone); ped.position.y = 0.6; g.add(ped);
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 8), this.mat.stone); robe.position.y = 2.4; g.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), this.mat.stone); head.position.y = 3.7; g.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 8), this.mat.stone); hood.position.y = 3.85; g.add(hood);
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(scale);
    this.add(g);
    this.colliders.push({ x, z, r: 0.9 * scale });
  }

  cart(x, z, ry) {
    const m = makeEnv('cart', 2.1);
    if (m) { m.position.set(x, heightAt(x, z), z); m.rotation.y = ry; this.add(m); this.colliders.push({ x, z, r: 1.4 }); return; }
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.6), this.mat.wood); bed.position.y = 0.9; bed.rotation.z = 0.12; g.add(bed);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 14), this.mat.wood);
      wheel.position.set(s * 0.85, 0.55, -0.4); wheel.rotation.y = Math.PI / 2; g.add(wheel);
    }
    // shrouded bodies
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 }));
      b.rotation.x = Math.PI / 2; b.position.set(-0.45 + i * 0.45, 1.3, 0); g.add(b);
    }
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    g.position.set(x, 0, z); g.rotation.y = ry; this.add(g);
    this.colliders.push({ x, z, r: 1.5 });
  }

  clutter(x, z) {
    const y = heightAt(x, z);
    const r = this.rand();
    if (r < 0.4 && this.prop('barrels', 1.15, x, z, this.rand() * 6.28, { r: 0.8 })) return;
    if (r >= 0.4 && r < 0.7 && this.prop('crates', 1.4, x, z, this.rand() * 6.28, { r: 0.8 })) return;
    if (r < 0.4) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.9, 10), this.mat.wood); b.position.set(x, y + 0.45, z); b.castShadow = true; this.add(b); this.colliders.push({ x, z, r: 0.4 }); }
    else if (r < 0.7) { this.box(0.9, 0.9, 0.9, this.mat.wood, x, y + 0.45, z, this.rand() * 3); this.colliders.push({ x, z, r: 0.6 }); }
    else if (makeEnv('coffins', 1)) { const m = makeEnv('coffins', 1.25); m.position.set(x, y, z); m.rotation.y = this.rand() * 6.28; this.add(m); this.colliders.push({ x, z, r: 1.1 }); }
    else { // coffin
      const c = this.box(0.7, 0.35, 2, this.mat.wood, x, y + 0.18, z, this.rand() * 3); c.rotation.z = 0.05; this.colliders.push({ x, z, r: 0.8 });
    }
  }

  // Gibbet cage hung from an iron bracket on a wall. side = -1 (west wall) / 1 (east wall).
  cage(x, z, y, side) {
    const m = makeEnv('cage', 1.9);
    if (!m) return;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), this.mat.iron);
    arm.position.set(x - side * 0.75, y, z); arm.castShadow = true; this.add(arm);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), this.mat.iron);
    brace.position.set(x - side * 0.1, y - 0.45, z); brace.rotation.z = side * 0.9; this.add(brace);
    m.position.set(x - side * 1.35, y - 1.9, z); m.rotation.y = this.rand() * 6.28; this.add(m);
    this.cages ??= []; this.cages.push(m);
  }

  // Candle-and-skull roadside shrine (Tripo); facing ry.
  shrine(x, z, ry) {
    const m = makeEnv('shrine', 2.4);
    if (!m) return;
    m.position.set(x, heightAt(x, z), z); m.rotation.y = ry; this.add(m);
    const glow = new THREE.PointLight(0xffa050, 3, 4, 1.6); glow.position.set(x, heightAt(x, z) + 1.1, z); this.add(glow); this.flames.push(glow);
    this.colliders.push({ x, z, r: 0.6 });
  }

  tree(x, z, h = 9) {
    const m = makeEnv('tree', h);
    if (!m) return;
    m.position.set(x, heightAt(x, z), z); m.rotation.y = this.rand() * 6.28; this.add(m);
    this.colliders.push({ x, z, r: 0.7 });
  }

  // Place an environment prop if its model exists. Returns the object or null.
  prop(name, h, x, z, ry = 0, { y = heightAt(x, z), r = 0 } = {}) {
    const m = makeEnv(name, h);
    if (!m) return null;
    m.position.set(x, y, z); m.rotation.y = ry; this.add(m);
    if (r) this.colliders.push({ x, z, r });
    return m;
  }

  // Shrouded plague corpse. Tripo modelled it standing, so lay it on its back on the ground.
  corpse(x, z, ry) {
    const m = makeEnv('corpse', 1.75);
    if (!m) return null;
    const depth = m.userData.size.z;
    m.rotation.x = -Math.PI / 2;               // feet at the origin, head toward −Z, front facing up
    m.position.set(0, depth * 0.42, 0.85);     // rest on its back, centred on (x, z)
    const w = new THREE.Group(); w.add(m);
    w.position.set(x, heightAt(x, z), z); w.rotation.y = ry; this.add(w);
    return w;
  }

  // Soft additive glow sprite (fake light: cheap, so torches don't each need a real light).
  glow(x, y, z, size = 1.2, color = 0xffa040) {
    this.glowTex ??= (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.6)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(size); sp.userData.base = size; this.add(sp);
    (this.glows ??= []).push(sp);
    return sp;
  }

  // A run of balustrade sections from (x0,z0) to (x1,z1); returns false when the model is missing.
  balustrade(x0, z0, x1, z1, y = 0, h = 1.25, name = 'balustrade') {
    const probe = makeEnv(name, h);
    if (!probe) return false;
    const len = probe.userData.size.x * 0.98, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(L / len)), ry = Math.atan2(-dz, dx);
    for (let i = 0; i < n; i++) {
      const m = i === 0 ? probe : makeEnv(name, h);
      const t = (i + 0.5) / n;
      m.position.set(x0 + dx * t, y, z0 + dz * t); m.rotation.y = ry;
      m.scale.x *= L / n / len; // stretch slightly so sections meet
      this.add(m);
    }
    return true;
  }

  // Ward banner: painted cloth (public/textures/banner.webp, 501×1536) with a ragged cut-out hem.
  // Geometry and material are shared by every banner. Until the texture arrives (or if it is
  // missing) the banner shows as plain dark red cloth.
  banner(x, y, z, ry) {
    if (!this.bannerGeo) {
      this.bannerGeo = new THREE.PlaneGeometry(1.12, 3.4, 2, 10);
      const mat = swayBanner(this.mat.banner, 3.4);
      new THREE.TextureLoader().load('textures/banner.webp', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        mat.map = tex; mat.color.set(0xffffff); mat.alphaTest = 0.5; mat.needsUpdate = true;
      });
    }
    const b = new THREE.Mesh(this.bannerGeo, this.mat.banner);
    b.position.set(x, y, z); b.rotation.y = ry; this.add(b);
  }

  // Checkpoint lantern shrine. Tripo model (twisted post, hanging cage, candles and bones at
  // the base); its amber panes glow once lit. Falls back to the primitive version.
  lantern(x, z, name) {
    const y = heightAt(x, z);
    const H = 1.6, m = makeEnv('lantern', H);
    if (m) {
      // The panes' glow is a per-lantern uniform, so each lantern gets its own material copy
      // (two lanterns: two extra materials, no extra draw calls).
      const glow = { value: 0.35 };   // unlit: a faint ember in the panes, so the lantern can be found
      m.traverse((o) => { if (o.isMesh) { o.material = amberGlowMaterial(o.material, glow); } });
      // The arm points along model +x; turn it so the cage hangs out over the street.
      const out = x > 0 ? -1 : 1;
      m.position.set(x, y, z); m.rotation.y = out > 0 ? 0 : Math.PI; this.add(m);
      // Cage centre in model space (measured from the GLB): 0.18 H out on the arm, 0.58 H up.
      const cx = x + out * 0.18 * H, cy = y + 0.58 * H;
      const light = new THREE.PointLight(0xff6a2a, 0, 10, 1.4); light.position.set(cx, cy, z); this.add(light);
      const halo = this.glow(cx, cy, z, 0, 0xffa050);
      const L = { x, z, y, name, lit: false, light, glow, halo };
      this.lanterns.push(L);
      this.colliders.push({ x, z, r: 0.35 });
      return L;
    }
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), this.mat.iron); post.position.y = 0.8; g.add(post);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 4, 10, Math.PI), this.mat.iron); hook.position.set(0.15, 1.6, 0); g.add(hook);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 6), new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff5a20, emissiveIntensity: 0.2, transparent: true, opacity: 0.9 }));
    glass.position.set(0.3, 1.3, 0); g.add(glass);
    const light = new THREE.PointLight(0xff6a2a, 0, 10, 1.4); light.position.set(0.3, 1.4, 0); g.add(light);
    // ring of candles and bones at the base
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const cnd = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15 + (i % 3) * 0.08, 6), this.mat.bone);
      cnd.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55); g.add(cnd);
    }
    g.position.set(x, y, z); this.add(g);
    const L = { x, z, y, name, lit: false, glass, light };
    this.lanterns.push(L);
    this.colliders.push({ x, z, r: 0.3 });
    return L;
  }

  lightLantern(L) {
    L.lit = true;
    if (L.glass) L.glass.material.emissiveIntensity = 3;
    if (L.glow) { L.glow.value = 2.4; L.halo.userData.base = 0.7; }
    L.light.intensity = 10;
  }

  note(x, z, text) {
    const y = heightAt(x, z);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    glint.position.set(x, y + 0.35, z); this.add(glint);
    if (!this.corpse(x + 0.7, z, this.rand() * 6.28)) {
      const corpse = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 1 }));
      corpse.rotation.set(Math.PI / 2, 0, this.rand() * 3); corpse.position.set(x + 0.4, y + 0.2, z); corpse.castShadow = true; this.add(corpse);
    }
    this.notes.push({ x, z, text, read: false, glint });
  }

  buildStreet() {
    // Start gate behind the player.
    const gate = makeEnv('gate', 13);
    if (gate) { gate.position.set(0, 0, -11.5); this.add(gate); }
    else {
      this.box(14, 9, 2, this.mat.darkStone, 0, 4.5, -10);
      const portcullis = this.box(5, 6, 0.3, this.mat.iron, 0, 3, -8.9);
      portcullis.material = this.mat.iron;
    }
    // Townhouses lining both sides of the street.
    for (let z = -6; z < 58; z += 6.5 + this.rand() * 2) {
      const h = 9 + this.rand() * 7;
      this.townhouse(-10.5, z, 8, 5.5 + this.rand(), h, Math.PI / 2);
      this.townhouse(10.5, z + 2, 8, 5.5 + this.rand(), 9 + this.rand() * 7, -Math.PI / 2);
    }
    for (let z = 4; z < 60; z += 11) { this.lamp(-5.4, z); this.lamp(5.4, z + 5.5, z % 2 === 0); }
    this.cart(-3.5, 15, 0.3);
    this.cart(3.2, 44, -2.6);
    this.statue(4.6, 28, -Math.PI / 2, 0.9);
    // Clutter sits in the gaps between street lamps (lamps every 11 m: west z 4+11k, east z 9.5+11k), clear of the shrines.
    for (const [x, z] of [[-4.8, 9], [4.9, 15], [-5, 21], [4.7, 36], [-4.6, 42.5], [-4.9, 53.5]]) this.clutter(x, z);
    for (let z = 10; z < 58; z += 14) { this.banner(-6.3, 6.5, z, Math.PI / 2); this.banner(6.3, 6.5, z + 7, -Math.PI / 2); }
    for (const [z, side] of [[12, -1], [26, 1], [38, -1], [51, 1]]) this.cage(side * 7.3, z, 6.2, side);
    this.lantern(2.5, 3, 'Ward Gate');
    this.shrine(-5.2, 30, Math.PI / 2); this.shrine(5.3, 47.5, -Math.PI / 2);
    this.note(-3.6, 21, 'A ledger page, the ink still tacky.<br><br>"Saint Orlan\'s Ward — sealed at the ninth bell. Names counted: four hundred and twelve. Names spared: none.<br><br>Sentence carried out by the hand that signs below."<br><br>The signature is yours.');
  }

  buildPlaza() {
    // Plaza enclosure walls and houses.
    for (const s of [-1, 1]) {
      this.box(1.5, 7, 34, this.mat.darkStone, s * 16.3, 3.5, 75);
      for (let z = 62; z < 90; z += 7) this.townhouse(s * 21, z, 8, 6, 12 + this.rand() * 6, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    for (const s of [-1, 1]) this.box(10, 7, 1.5, this.mat.darkStone, s * 11, 3.5, 92.5);
    // Cistern fountain with blood-dark water.
    const fountain = makeEnv('fountain', 7.2);
    if (fountain) { fountain.position.set(0, 0, 74); fountain.rotation.y = Math.PI; this.add(fountain); }
    else {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.9, 24, 1, true), this.mat.stone);
      basin.position.set(0, 0.45, 74); basin.castShadow = basin.receiveShadow = true; this.add(basin);
      const water = new THREE.Mesh(new THREE.CircleGeometry(3.9, 24), new THREE.MeshStandardMaterial({ color: 0x1a0204, roughness: 0.05, metalness: 0.6 }));
      water.rotation.x = -Math.PI / 2; water.position.set(0, 0.7, 74); this.add(water);
      this.statue(0, 74, Math.PI, 1.3);
    }
    this.colliders.push({ x: 0, z: 74, r: 4.4 });
    this.brazier(-12, 64); this.brazier(12, 64); this.brazier(-12.5, 86); this.brazier(12.5, 86);
    for (const [x, z] of [[-13, 70], [13.5, 77], [9, 60.5], [-14, 81]]) this.clutter(x, z);
    this.cart(10, 82, 1.2);
    this.tree(-13.2, 61, 10); this.tree(13, 89.5, 8.5);
    this.statue(-14.5, 75, Math.PI / 2, 0.9); this.statue(14.5, 70, -Math.PI / 2, 0.9);
    this.lantern(-10, 89, 'Cathedral Steps');
    this.note(11.5, 71, 'A Seer\'s prayer, scratched into a vial:<br><br>"Grace was given to close the wound. We drank, and the wound opened inward. The blood remembers who spilled it — and so it follows him."');
  }

  buildSteps() {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const z0 = 93 + (i / steps) * 8;
      const h = ((i + 1) / steps) * ARENA.y;
      const s = new THREE.Mesh(new THREE.BoxGeometry(10.4, h, 8 / steps + 0.02), this.mat.stone);
      s.position.set(0, h / 2, z0 + 4 / steps); s.receiveShadow = true; s.castShadow = true; this.add(s);
    }
    // Landing + passage floor up to the arena.
    const landing = new THREE.Mesh(new THREE.BoxGeometry(10.4, ARENA.y, 12), this.mat.stone);
    landing.position.set(0, ARENA.y / 2, 107); landing.receiveShadow = true; this.add(landing);
    for (const s of [-1, 1]) {
      this.box(1, 9, 20, this.mat.darkStone, s * 5.8, ARENA.y + 2.5, 103);
      this.statue(s * 4.4, 101.5, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0.8);
    }
    this.lamp(-4.6, 96); this.lamp(4.6, 96, false);
    // Fog gate: shimmering sheet across the passage.
    const fogMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { t: { value: 0 }, a: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float t; uniform float a;
        // Domain-warped flowing mist (no grid artefacts).
        float n(vec2 p){ return 0.5 + 0.25 * sin(p.x * 3.1 + sin(p.y * 2.3 + t * 0.7) * 1.7) + 0.25 * sin(p.y * 2.7 - t * 0.5 + sin(p.x * 1.9 - t) * 1.3); }
        void main(){
          vec2 q = vUv * vec2(3.0, 2.0) + vec2(0.0, t * 0.12);
          float f = n(q) * 0.55 + n(q * 2.1 + 4.0) * 0.3 + 0.2;
          float edge = smoothstep(0.0,0.15,vUv.x)*smoothstep(1.0,0.85,vUv.x)*smoothstep(1.0,0.7,vUv.y);
          gl_FragColor = vec4(vec3(0.42,0.42,0.46) * f, f * 0.32 * edge * a);
        }`,
    });
    this.fog = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), fogMat);
    this.fog.position.set(0, ARENA.y + 3.5, GATE_Z);
    this.add(this.fog);
    // A ruined gothic arch frames the fog gate; its piers block the passage edges.
    const arch = makeEnv('archway', 10.6);
    if (arch) {
      arch.position.set(0, ARENA.y, GATE_Z + 0.4); this.add(arch);
      for (const sx of [-1, 1]) this.colliders.push({ x: sx * 4.8, z: GATE_Z + 0.4, r: 0.7 });
    }
    this.note(-3.2, 99, 'Carved into the step, fresh:<br><br>"It was set to guard the ward until the purge was done. No one told it the purge was done."');
  }

  buildArena() {
    const y = ARENA.y;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA.r + 2, 48), this.cobbleMat.clone());
    floor.material.map = this.cobbleMat.map.clone(); floor.material.map.repeat.set(15, 15); floor.material.map.needsUpdate = true;
    floor.material.roughnessMap = this.cobbleMat.roughnessMap.clone(); floor.material.roughnessMap.repeat.set(15, 15); floor.material.roughnessMap.needsUpdate = true;
    floor.material.normalMap = this.cobbleMat.normalMap.clone(); floor.material.normalMap.repeat.set(15, 15); floor.material.normalMap.needsUpdate = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set(ARENA.x, y + 0.01, ARENA.z); floor.receiveShadow = true; this.add(floor);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.r + 2, ARENA.r + 2, y, 48), this.mat.darkStone);
    base.position.set(ARENA.x, y / 2, ARENA.z); this.add(base);
    // Ring of broken pillars and low walls.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < 0.3) continue; // entrance gap (toward -Z)
      const x = ARENA.x + Math.cos(a) * (ARENA.r + 1.2), z = ARENA.z + Math.sin(a) * (ARENA.r + 1.2);
      const h = i % 3 === 0 ? 4 + this.rand() * 3 : 9 + this.rand() * 4;
      const pm = makeEnv('pillar', h);
      if (pm) { pm.position.set(x, y, z); pm.rotation.y = this.rand() * 6.28; this.add(pm); }
      else { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, h, 8), this.mat.stone); p.position.set(x, y + h / 2, z); p.castShadow = p.receiveShadow = true; this.add(p); }
      const a2 = a + Math.PI / 18, a0 = a + 0.07, a1 = a + Math.PI / 9 - 0.07, R2 = ARENA.r + 1.4;
      if (!this.balustrade(ARENA.x + Math.cos(a0) * R2, ARENA.z + Math.sin(a0) * R2, ARENA.x + Math.cos(a1) * R2, ARENA.z + Math.sin(a1) * R2, y)) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 0.8), this.mat.darkStone);
        wall.position.set(ARENA.x + Math.cos(a2) * (ARENA.r + 1.6), y + 1.1, ARENA.z + Math.sin(a2) * (ARENA.r + 1.6));
        wall.rotation.y = -a2 + Math.PI / 2; wall.castShadow = true; this.add(wall);
      }
    }
    // Cathedral facade beyond the arena.
    const cz = ARENA.z + ARENA.r + 8;
    // Tripo cathedral (from the generated facade concept) or the primitive stand-in.
    const H = 60;                                   // to the spire tips
    const cath = makeEnv('cathedral', H);
    let rosePos = new THREE.Vector3(0, y + 18, cz - 3.05), roseR = 5;
    if (cath) {
      const front = ARENA.z + ARENA.r + 4;
      const depth = cath.userData.size.z;
      cath.rotation.y = Math.PI;                    // face the arena
      cath.position.set(0, y, front + depth / 2);
      this.add(cath);
      cath.updateMatrixWorld(true);
      // The model's own stained-glass rose window: 38% up the facade, radius 7.4% of the height
      // (measured on a straight-on render). Find the facade surface there for the glow overlay.
      const ry = y + H * 0.382;
      roseR = H * 0.074;
      const hit = new THREE.Raycaster(new THREE.Vector3(0, ry, front - 10), new THREE.Vector3(0, 0, 1)).intersectObject(cath, true)[0];
      rosePos = new THREE.Vector3(0, ry, (hit ? hit.point.z : front) - 0.05);
    } else {
      this.box(34, 28, 6, this.mat.stone, 0, y + 14, cz);
      for (const s of [-1, 1]) {
        this.box(7, 44, 7, this.mat.stone, s * 14, y + 22, cz);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(4.6, 18, 8), this.mat.roof); sp.position.set(s * 14, y + 53, cz); this.add(sp);
      }
      const peak = new THREE.Mesh(new THREE.ConeGeometry(9, 14, 4), this.mat.roof); peak.position.set(0, y + 35, cz); peak.rotation.y = Math.PI / 4; this.add(peak);
      for (const s of [-1, 1]) this.banner(s * 5, y + 9, cz - 3.1, Math.PI);
    }
    // Rose window: glowing, slowly pulsing.
    this.rose = new THREE.Mesh(new THREE.CircleGeometry(roseR, 48), cath ? new THREE.ShaderMaterial({
      // Glow only: the model already has the tracery. Pulses; floods blood-red in phase 2.
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, rage: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float t; uniform float rage;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float glow = smoothstep(1.0, 0.2, r) * (0.75 + 0.25 * sin(t * 1.5));
          vec3 c = mix(vec3(0.55, 0.22, 0.05) * 0.45, vec3(1.0, 0.04, 0.02) * 1.1, rage);
          gl_FragColor = vec4(c * glow, 1.0);
        }`,
    }) : new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, rage: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float t; uniform float rage;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float petals = smoothstep(0.75, 0.95, abs(cos(a * 6.0)));
          float rings = smoothstep(0.04, 0.0, abs(r - 0.45)) + smoothstep(0.04, 0.0, abs(r - 0.92));
          float spokes = smoothstep(0.06, 0.0, abs(sin(a * 12.0)) * r);
          float lead = clamp(rings + spokes * step(0.2, r) + petals * step(0.45, r) * 0.6, 0.0, 1.0);
          vec3 glass = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.1, 0.05), rage) * (1.2 + 0.25 * sin(t * 1.5));
          glass *= 0.6 + 0.4 * smoothstep(1.0, 0.0, r);
          gl_FragColor = vec4(mix(glass, vec3(0.02), lead * 0.85), 1.0);
        }`,
    }));
    this.rose.position.copy(rosePos); this.rose.rotation.y = Math.PI; this.add(this.rose);
    this.roseLight = new THREE.PointLight(0xff8030, 30, 45, 1.2); this.roseLight.position.set(0, rosePos.y - 4, rosePos.z - 5); this.add(this.roseLight);
    // Cold moon-shaft over the arena so the Hound reads at any distance.
    const shaft = new THREE.SpotLight(0x9fb0e0, 140, 60, 0.75, 0.6, 1.2);
    shaft.position.set(ARENA.x - 6, y + 30, ARENA.z - 8);
    shaft.target.position.set(ARENA.x, y, ARENA.z);
    this.add(shaft); this.add(shaft.target);
    // Arena braziers.
    for (const a of [0.6, 2.55, 3.7, 5.7]) this.brazier(ARENA.x + Math.cos(a) * (ARENA.r - 2), ARENA.z + Math.sin(a) * (ARENA.r - 2), a < 3);
    this.tree(ARENA.x - 25, ARENA.z - 4, 11); this.tree(ARENA.x + 24, ARENA.z + 6, 9.5);
    // Bones and claw-gouges scattered about.
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * Math.PI * 2, r = 3 + this.rand() * (ARENA.r - 4);
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.35 + this.rand() * 0.3, 2, 4), this.mat.bone);
      b.position.set(ARENA.x + Math.cos(a) * r, y + 0.05, ARENA.z + Math.sin(a) * r);
      b.rotation.set(Math.PI / 2, 0, this.rand() * 6); this.add(b);
    }
  }

  buildDistantCity() {
    // Silhouette spires around the level for a sense of Veyr beyond the ward.
    const mat = new THREE.MeshBasicMaterial({ color: 0x07070b, fog: true });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffa050 });
    for (let i = 0; i < 70; i++) {
      const a = this.rand() * Math.PI * 2, r = 90 + this.rand() * 120;
      const x = Math.cos(a) * r, z = 90 + Math.sin(a) * r;
      const h = 20 + this.rand() * 50, w = 6 + this.rand() * 10;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat); t.position.set(x, h / 2 - 5, z); this.add(t);
      const s = new THREE.Mesh(new THREE.ConeGeometry(w * 0.6, h * 0.5, 6), mat); s.position.set(x, h - 5 + h * 0.25, z); this.add(s);
      if (this.rand() < 0.5) { const wv = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), lit); wv.position.set(x, h * 0.6, z); wv.lookAt(0, h * 0.6, 60); this.add(wv); }
    }
  }

  buildAsh() {
    // Drifting ash / embers around the player.
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 18; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ash = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb8a8a0, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
    this.add(this.ash);
  }

  // Resolve a circle moving from (x,z) to (nx,nz): slide along walls and push out of props.
  move(pos, nx, nz, r) {
    const o = this.gateOpen, s = this.gateSealed;
    if (inside(nx, nz, r, o, s)) { pos.x = nx; pos.z = nz; }
    else if (inside(nx, pos.z, r, o, s)) pos.x = nx;
    else if (inside(pos.x, nz, r, o, s)) pos.z = nz;
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) {
        const px = c.x + (dx / d) * m, pz = c.z + (dz / d) * m;
        if (inside(px, pz, r, o, s)) { pos.x = px; pos.z = pz; }
      }
    }
    pos.y = heightAt(pos.x, pos.z);
  }

  update(dt, center) {
    this.time += dt;
    worldTime.value = this.time;
    for (const L of this.lanterns) if (L.lit && L.glow) L.glow.value = 2.4 * (0.9 + Math.random() * 0.15);
    for (const f of this.flames) {
      if (f.isLight) {
        f.userData.base ??= f.intensity;
        f.intensity = f.userData.base * (0.85 + Math.random() * 0.3);
      } else f.scale.setScalar(0.85 + Math.sin(this.time * 17 + f.id) * 0.1 + Math.random() * 0.08);
    }
    this.fog.material.uniforms.t.value = this.time;
    this.sky.material.uniforms.t.value = this.time;
    for (const [i, g] of (this.glows || []).entries()) g.scale.setScalar(g.userData.base * (0.88 + Math.sin(this.time * 13 + i * 1.7) * 0.06 + Math.random() * 0.08));
    for (const m of this.mist) { m.material.uniforms.t.value = this.time; m.material.uniforms.cam.value.copy(center); }
    this.rose.material.uniforms.t.value = this.time;
    for (const n of this.notes) { n.glint.rotation.y += dt * 2; n.glint.visible = !n.read; n.glint.position.y = heightAt(n.x, n.z) + 0.35 + Math.sin(this.time * 3) * 0.05; }
    // Ash drifts with the wind and wraps around the camera.
    const p = this.ash.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * 0.6, y = p.getY(i) - dt * 0.35, z = p.getZ(i) + Math.sin(this.time + i) * dt * 0.2;
      if (x - center.x > 25) x -= 50; if (x - center.x < -25) x += 50;
      if (z - center.z > 25) z -= 50; if (z - center.z < -25) z += 50;
      if (y < center.y - 2) y += 18;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    this.sky.position.copy(center);
  }
}
