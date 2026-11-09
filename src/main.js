import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadAssets } from './assets.js';
import { World, heightAt, ARENA, GATE_Z, SHORTCUT } from './world.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Seer } from './seer.js';
import { Boss } from './boss.js';
import { ThirdPersonCamera } from './camera.js';
import { UI } from './ui.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { upgradeRows, upgradeCost, buyUpgrade, dropEchoes } from './progress.js';

// Film grain + vignette + slight desaturation for the gothic look.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, t: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float t; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + t) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, 0.88);
      c.rgb *= vec3(1.02, 0.98, 1.0);
      float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
      c.rgb *= mix(0.7, 1.0, v);
      c.rgb += (h(vUv * 800.0) - 0.5) * 0.035;
      gl_FragColor = c;
    }`,
};

class Game {
  constructor() {
    const canvas = document.querySelector('#game');
    this.isTouch = isTouchDevice();
    // No MSAA on the canvas: the scene is rendered into the composer's targets, so canvas
    // antialiasing would only smooth the final full-screen quad (pure cost, no visible gain).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // Phones: lower render resolution keeps the frame rate up; adaptive resolution
    // (see adaptResolution) trims it further while the frame rate sags, e.g. once the phone heats up.
    this.maxPixelRatio = Math.min(devicePixelRatio, this.isTouch ? 1.25 : 1.75);
    this.minPixelRatio = Math.min(this.maxPixelRatio, this.isTouch ? 0.7 : 1);
    this.pixelRatio = this.maxPixelRatio;
    this.perf = { t: 0, frames: 0, calm: 0 };
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.75;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a3248, 0.016);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.82);
    if (this.isTouch) {
      // Phones: run the bloom chain at half resolution (it's a blur, so it looks the same).
      const setSize = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w, h) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    }
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
    });

    this.input = new Input(canvas);
    this.input.touch = this.isTouch;
    if (this.isTouch) {
      document.body.classList.add('touch');
      this.touch = new TouchControls(this.input, { onPause: () => { if (this.started && !this.paused) this.pause(); } });
    }
    this.audio = new Audio();
    this.ui = new UI();
    this.clock = new THREE.Clock();
    this.paused = true;
    this.started = false;
    this.hitStopT = 0;
    this.projectiles = [];
    this.pools = [];
    this.waves = [];
  }

  async init() {
    await loadAssets((k) => { document.querySelector('#loading').textContent = `Gathering the dead… ${Math.round(k * 100)}%`; });
    this.world = new World(this.scene);
    this.world.poolLights(this.isTouch ? 6 : 10);
    if (this.isTouch) this.world.moon.shadow.mapSize.set(1024, 1024);
    // Image-based lighting from the night sky: wet stone and metal reflect the moon and clouds.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.world.sky.material));
    this.scene.environment = pmrem.fromScene(envScene, 0.015).texture;
    this.scene.environmentIntensity = 0.4;
    this.fx = new FX(this.scene, this.isTouch ? { max: 1200, maxDecals: 30 } : {});
    this.fx.heightAt = heightAt;
    this.cam = new ThirdPersonCamera(this.camera);
    this.player = new Player(this);
    this.seers = [
      // Street
      new Seer(this, { x: 2.5, z: 19, yaw: Math.PI }),
      new Seer(this, { x: -4.0, z: 30, yaw: -Math.PI / 2 }, { dormant: true }),   // kneeling at the shrine, back to the street
      new Seer(this, { x: 4.6, z: 45.8, yaw: -Math.PI / 2 }, { dormant: true }),  // crouched behind the cart
      new Seer(this, { x: -4.6, z: 46, yaw: Math.PI }, { kind: 'thrower' }),      // under the cage: flasks down the street
      new Seer(this, { x: -1, z: 52, yaw: Math.PI }),
      // Back alley (shortcut): waits in the dark for whoever comes down from the plaza.
      new Seer(this, { x: 15.1, z: 33, yaw: 0 }, { dormant: true }),
      // Plaza
      new Seer(this, { x: 9, z: 68, yaw: -Math.PI / 2 }),
      new Seer(this, { x: -8, z: 70, yaw: Math.PI / 2 }),
      new Seer(this, { x: -12, z: 79, yaw: Math.PI / 2 }, { dormant: true }),
      new Seer(this, { x: 6, z: 84, yaw: Math.PI }),
      new Seer(this, { x: 2.5, z: 80.5, yaw: Math.PI }, { kind: 'thrower' }),     // behind the fountain
      new Seer(this, { x: 0, z: 88, yaw: Math.PI }, { kind: 'warden' }),          // the Ward Warden: guards the steps
    ];
    this.boss = new Boss(this);
    this.bossActive = false;
    this.bossDefeated = false;
    this.checkpoint = this.world.lanterns[0];
    this.world.lightLantern(this.checkpoint);
    this.player.respawn({ x: 0, y: 0, z: -2, yaw: 0 });
    this.cam.yaw = 0;
    this.areas = [
      { z: -100, name: "Saint Orlan's Ward", shown: false },
      { z: 60, name: 'The Cistern Plaza', shown: false },
      { z: 108, name: 'Courtyard of the Hound', shown: false },
    ];

    const start = document.querySelector('#start');
    start.disabled = false;
    document.querySelector('#loading').textContent = '';
    start.onclick = () => this.start();
    document.querySelector('#pause').onclick = () => this.resume();
    document.addEventListener('pointerlockchange', () => {
      if (!this.isTouch && !this.input.locked && this.started && !this.ended) this.pause();
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.started && this.paused) this.resume(); });
    this.loop();
  }

  start() {
    this.audio.init();
    if (this.isTouch) {
      // Best effort: fullscreen + landscape (unsupported browsers simply ignore it).
      try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch {}
    }
    document.querySelector('#title').classList.add('hidden');
    document.querySelector('#hud').classList.remove('hidden');
    this.started = true;
    this.stats = { t0: performance.now(), deaths: 0, earned: 0 };
    this.hinted = {};
    this.resume();
  }
  pause() { this.paused = true; document.querySelector('#pause').classList.remove('hidden'); this.touch?.show(false); }
  resume() {
    document.querySelector('#pause').classList.add('hidden');
    this.input.lock();
    this.touch?.show(true);
    this.paused = false;
    this.clock.getDelta();
  }

  enemiesAll() { return this.bossActive ? [...this.seers, this.boss] : this.seers; }

  findLockTarget() {
    let best = null, bestScore = Infinity;
    const camF = new THREE.Vector3(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    for (const e of this.enemiesAll()) {
      if (e.dead) continue;
      const d = this.player.dist(e);
      if (d > 20) continue;
      const dir = e.pos.clone().sub(this.player.pos).setY(0).normalize();
      const facing = dir.dot(camF);
      if (facing < 0.2) continue;
      const score = d * (2 - facing);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  shake(a) { this.cam.shake(a); }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  shockwave(pos, r) {
    const m = new THREE.Mesh(this.ringGeo ??= new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xc09070, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(pos.y + 0.1);
    this.scene.add(m);
    this.waves.push({ m, t: 0, r });
  }

  // A Seer's lobbed bubble of boiling blood: a quivering translucent sphere with a bright rim
  // that stretches along its flight and drips as it goes; bursts into a blood pool where it lands.
  throwFlask(from, to) {
    this.bubbleMat ??= new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: `uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          vec3 p = position * (1.0 + 0.07 * sin(t * 13.0 + position.y * 9.0 + position.x * 7.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = p;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          vec3 n = normalize(vN), v = normalize(vV);
          float fres = pow(1.0 - abs(dot(n, v)), 2.2);
          float swirl = 0.5 + 0.5 * sin(vP.y * 30.0 + t * 6.0 + sin(vP.x * 25.0 + t * 4.0) * 2.0);
          vec3 inner = mix(vec3(0.16, 0.004, 0.004), vec3(0.34, 0.02, 0.01), swirl);
          vec3 col = mix(inner, vec3(1.0, 0.16, 0.08), fres);
          col += vec3(1.0, 0.8, 0.75) * pow(max(dot(reflect(-v, n), normalize(vec3(0.4, 0.8, 0.3))), 0.0), 36.0);   // wet highlight
          gl_FragColor = vec4(pow(col, vec3(2.2)), 0.6 + 0.4 * fres);
        }`,
    });
    const m = new THREE.Mesh(this.bubbleGeo ??= new THREE.SphereGeometry(0.17, 18, 14), this.bubbleMat);
    m.position.copy(from); this.scene.add(m);
    const dx = to.x - from.x, dz = to.z - from.z, T = Math.min(1.3, Math.max(0.6, Math.hypot(dx, dz) / 9));
    const dy = heightAt(to.x, to.z) + 1 - from.y;
    const v = new THREE.Vector3(dx / T, (dy + 0.5 * 14 * T * T) / T, dz / T);
    this.projectiles.push({ m, v, life: 3 });
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.life -= dt;
      // Stretch along the flight, quivering; drip blood as it goes.
      const sp = p.v.length(), k = Math.min(0.35, sp / 40);
      p.m.quaternion.setFromUnitVectors(this._up ??= new THREE.Vector3(0, 1, 0), this._dir = (this._dir ?? new THREE.Vector3()).copy(p.v).divideScalar(sp || 1));
      p.m.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
      this.bubbleMat.uniforms.t.value += dt / Math.max(1, this.projectiles.length);
      if (Math.random() < dt * 30) this.fx.emit(1, p.m.position, { color: [0.45, 0.02, 0.02], speed: 0.5, up: 0.2, life: 0.7, size: 0.07, gravity: 9 });
      const floor = heightAt(p.m.position.x, p.m.position.z);
      const hitPlayer = p.m.position.distanceTo(this.player.chest(1)) < 0.7;
      if (p.m.position.y <= floor || hitPlayer || p.life <= 0) {
        p.dead = true;
        this.scene.remove(p.m);
        this.audio.shatter();
        const at = p.m.position.clone().setY(floor);
        this.fx.emit(26, at.clone().setY(floor + 0.15), { color: [0.5, 0.02, 0.02], speed: 3.2, up: 3, life: 0.9, size: 0.09, gravity: 12 });   // the bubble bursts
        if (hitPlayer) this.player.takeHit(12, { pos: at }, { knock: 1 }) && (this.player.poison = 4);
        this.spawnPool(at);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const pool of this.pools) {
      pool.t -= dt;
      const U = pool.m.material.uniforms, age = 4.5 - pool.t;
      U.t.value += dt; U.fade.value = Math.min(1, pool.t * 0.7); U.grow.value = Math.min(1, 0.3 + age * 3.5);
      if (Math.random() < dt * 10) this.fx.bloodSteam(pool.m.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4)), 1);
      if (this.player.pos.distanceTo(pool.m.position) < 1.7 && !this.player.dead) this.player.poison = Math.max(this.player.poison, 2.5);
      if (pool.t <= 0) { this.scene.remove(pool.m); pool.m.material.dispose(); pool.dead = true; }
    }
    this.pools = this.pools.filter((p) => !p.dead);
    for (const w of this.waves) {
      w.t += dt;
      const k = w.t / 0.45;
      w.m.scale.setScalar(1 + k * w.r);
      w.m.material.opacity = 0.6 * (1 - k);
      if (k >= 1) { this.scene.remove(w.m); w.m.material.dispose(); w.dead = true; }
    }
    this.waves = this.waves.filter((w) => !w.dead);
  }

  // Boiling blood: a ragged pool of near-black crimson with a deep-red rim (the 1.7 m danger edge
  // stays readable), churning and popping bubbles; splashes out on impact, then dries away.
  spawnPool(at) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, fade: { value: 1 }, grow: { value: 0.3 }, seed: { value: Math.random() * 50 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float t, fade, grow, seed;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ return noise(p) * 0.5 + noise(p * 2.03 + 1.7) * 0.3 + noise(p * 4.1 + 3.1) * 0.2; }
        void main(){
          vec2 p = (vUv - 0.5) * 2.0 / grow;                   // 1.0 = the 1.7 m danger radius
          float r = length(p), a = atan(p.y, p.x);
          float R = 0.84 + 0.26 * (fbm(vec2(a * 1.3 + seed, seed)) - 0.5) + 0.08 * (noise(vec2(a * 7.0, seed)) - 0.5);
          float inside = 1.0 - smoothstep(R - 0.03, R, r);
          if (inside <= 0.0) discard;
          float churn = fbm(p * 2.2 + vec2(seed, t * 0.25));
          vec3 col = mix(vec3(0.06, 0.004, 0.004), vec3(0.2, 0.012, 0.01), churn);   // dark blood
          col = mix(col, vec3(0.42, 0.03, 0.02), smoothstep(R - 0.22, R - 0.03, r) * 0.7);   // deep-red rim
          col += vec3(0.3, 0.04, 0.02) * smoothstep(R - 0.06, R - 0.02, r) * (1.0 - smoothstep(R - 0.02, R, r));   // wet meniscus
          vec2 cell = floor(p * 6.0); vec2 f = fract(p * 6.0) - 0.5;                     // bubbles
          float h = hash(cell + seed), life = fract(t * (0.9 + h * 0.9) + h * 7.0);   // boiling: quick pops
          float bub = (1.0 - smoothstep(0.08, 0.16, length(f - (vec2(hash(cell + 3.1), hash(cell + 5.7)) - 0.5) * 0.5))) * step(0.55, h) * sin(life * 3.14159);
          col += vec3(0.7, 0.1, 0.04) * bub * 0.8;
          col = pow(col, vec3(2.2));   // authored as display colours; the scene renders in linear light
          gl_FragColor = vec4(col, inside * fade * 0.9);
        }`,
    });
    const m = new THREE.Mesh(this.poolGeo ??= new THREE.PlaneGeometry(3.4, 3.4), mat);
    m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(at.y + 0.03); m.renderOrder = 1;
    this.scene.add(m);
    this.pools.push({ m, t: 4.5 });
  }

  onEnemyKilled(e, echoes) {
    this.player.echoes += echoes;
    if (this.stats) this.stats.earned += echoes;
    this.fx.echoes(e.chest(1));
    if (this.player.lock === e) this.player.lock = this.findLockTarget();
  }

  onBossKilled() {
    this.bossDefeated = true;
    this.player.echoes += 5000;
    if (this.stats) this.stats.earned += 5000;
    this.player.lock = null;
    this.audio.setMusic(false);
    this.audio.victory();
    this.audio.setReverb(0.22);
    this.world.gateSealed = false;
    setTimeout(() => {
      this.ui.showBoss(false);
      this.ui.showBanner('The Hound Is Put to Rest', 'Saint Orlan\'s Ward falls silent. Somewhere in Veyr, a bell answers.', true, 0);
      this.audio.lantern();
    }, 2200);
    setTimeout(() => this.showResults(), 8500);
  }

  onPlayerDeath() {
    // Every echo stays where he fell; an older stain he never reclaimed is gone for good.
    const stain = dropEchoes(this.player, this.player.pos);
    this.world.setStain(stain);
    if (this.stats) this.stats.deaths++;
    this.audio.death();
    this.ui.showBanner('The Blood Runs Cold', stain ? `${stain.echoes} blood echoes lie where you fell.` : '', false, 0);
    setTimeout(() => this.restartFromCheckpoint(), 4200);
  }

  restartFromCheckpoint() {
    this.ui.banner.classList.add('hidden');
    const L = this.checkpoint;
    this.player.respawn({ x: L.x - 1.2, y: L.y, z: L.z, yaw: 0 });
    this.cam.yaw = 0;
    this.resetEnemies();
  }

  resetEnemies() {
    for (const s of this.seers) s.reset();
    for (const p of this.projectiles) this.scene.remove(p.m);
    for (const p of this.pools) { this.scene.remove(p.m); p.m.material.dispose(); }
    this.projectiles = []; this.pools = [];
    if (!this.bossDefeated) {
      this.boss.reset();
      this.bossActive = false;
      this.world.gateOpen = false;
      this.world.gateSealed = false;
      this.world.fog.material.uniforms.a.value = 1;
      this.world.fog.visible = true;
      this.world.rose.material.uniforms.rage.value = 0;
      this.world.roseLight.color.set(0xff8030);
      this.ui.showBoss(false);
      this.audio.setMusic(false);
      this.audio.setReverb(0.22);
    }
  }

  // Interactions: lanterns, notes, fog gate.
  interact() {
    const p = this.player;
    const inp = this.input;
    if (this.ui.noteOpen) {
      this.ui.setPrompt(null);
      if (inp.hit('KeyE', 'Escape')) this.ui.hideNote();
      return;
    }
    if (this.ui.lanternOpen) {
      this.ui.setPrompt(null);
      ['vit', 'end', 'str', 'vial'].forEach((k, i) => { if (inp.hit(`Digit${i + 1}`)) this.buyAtLantern(k); });
      if (inp.hit('KeyE')) this.ui.hideLantern();
      return;
    }
    if (p.dead || !['idle', 'move'].includes(p.state)) { this.ui.setPrompt(null); return; }
    let prompt = null, action = null;
    for (const L of this.world.lanterns) {
      if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < 2) {
        prompt = L.lit ? '<b>E</b> — Rest at the lantern' : '<b>E</b> — Light the lantern';
        action = () => {
          if (!L.lit) { this.world.lightLantern(L); this.ui.showBanner('Lantern Lit', L.name, true, 2500); }
          this.checkpoint = L;
          p.hp = p.maxHp; p.stamina = p.maxStamina; p.vials = p.maxVials; p.poison = 0; p.rally = 0;
          this.resetEnemies();
          this.audio.lantern();
          this.fx.heal(p.chest(1));
          this.openLantern();
        };
      }
    }
    const st = this.world.stain;
    if (st && Math.hypot(p.pos.x - st.x, p.pos.z - st.z) < 1.8 && Math.abs(p.pos.y - st.y) < 2) {
      prompt = `<b>E</b> — Reclaim ${st.echoes} blood echoes`;
      action = () => { p.echoes += st.echoes; this.fx.echoes(p.chest(1)); this.audio.lantern(); this.world.setStain(null); };
    }
    for (const k of this.world.pickups ?? []) {
      if (!k.taken && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < 1.6) {
        prompt = '<b>E</b> — Pick up';
        action = () => {
          k.taken = true;
          this.fx.echoes(p.chest(1));
          if (k.kind === 'shard') {
            p.maxVials += 1; p.vials += 1;
            this.ui.showBanner('Blood Vial Shard', 'The lanterns will fill one more vial.', true, 3000);
          } else {
            p.echoes += k.amount;
            this.ui.showBanner("A Hunter's Purse", `${k.amount} blood echoes, still warm.`, true, 3000);
          }
        };
      }
    }
    if (!this.world.shortcutOpen && Math.abs(p.pos.z - (SHORTCUT.z0 + SHORTCUT.z1) / 2) < 2.4 && Math.abs(p.pos.x - SHORTCUT.x) < 2) {
      if (p.pos.x > SHORTCUT.x) {
        prompt = '<b>E</b> — Lift the bar';
        action = () => { this.world.openShortcut(); this.audio.gate(); this.ui.showBanner('Shortcut Opened', 'The Ward Gate lantern lies just beyond.', true, 2600); };
      } else prompt = 'Barred from the other side';
    }
    for (const n of this.world.notes) {
      if (Math.hypot(p.pos.x - n.x, p.pos.z - n.z) < 1.8) {
        prompt = '<b>E</b> — Examine';
        action = () => { n.read = true; this.ui.showNote(n.text); };
      }
    }
    if (!this.world.gateOpen && !this.bossDefeated && Math.abs(p.pos.x) < 4 && p.pos.z > GATE_Z - 2.5 && p.pos.z < GATE_Z) {
      prompt = '<b>E</b> — Pass through the fog';
      action = () => this.enterArena();
    }
    this.ui.setPrompt(prompt);
    if (action && inp.hit('KeyE')) action();
  }

  // The run's end: what it took, and what was found. Frees the cursor (no pause on unlock).
  showResults() {
    this.ended = true;
    document.exitPointerLock?.();
    this.touch?.show(false);
    this.ui.banner.classList.add('hidden');
    const S = this.stats ?? { t0: performance.now(), deaths: 0, earned: 0 }, secs = Math.round((performance.now() - S.t0) / 1000);
    const picks = this.world.pickups ?? [], notes = this.world.notes;
    this.ui.showResults([
      ['Time', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
      ['Deaths', S.deaths],
      ['Blood echoes earned', S.earned],
      ['Rites at the lantern', this.player.level - 1],
      ['Secrets found', `${picks.filter((k) => k.taken).length} / ${picks.length}`],
      ['Letters read', `${notes.filter((n) => n.read).length} / ${notes.length}`],
    ], () => location.reload());
  }

  // First-time hints, each shown once, worded for the device in hand.
  teach() {
    const p = this.player, H = this.hinted, t = this.isTouch;
    if (!H || p.dead) return;
    if (!H.fight && this.seers.some((s) => s.aggro && !s.dead && s.dist(p) < 12)) {
      H.fight = true;
      this.ui.hint(t ? '<b>Lock</b> to focus a foe · <b>Roll</b> through its attacks' : '<b>Q</b> lock on · <b>Space</b> roll through attacks', 6000);
    } else if (!H.heal && p.hp < p.maxHp * 0.5 && p.vials > 0) {
      H.heal = true;
      this.ui.hint(t ? '<b>Vial</b> — drink blood to heal' : '<b>R</b> — drink a blood vial', 5000);
    } else if (!H.spend && p.echoes >= upgradeCost(p.level)) {
      H.spend = true;
      this.ui.hint('Rest at a lantern to spend your blood echoes', 5000);
    }
  }

  // Rest menu: spend blood echoes on the hunter.
  openLantern(bought = null) {
    const p = this.player;
    this.ui.showLantern({ echoes: p.echoes, cost: upgradeCost(p.level), rows: upgradeRows(p) }, (k) => this.buyAtLantern(k), bought);
  }

  buyAtLantern(key) {
    const p = this.player;
    if (!buyUpgrade(p, key)) return;
    p.hp = p.maxHp; p.stamina = p.maxStamina; p.vials = p.maxVials;   // a rite at the lantern restores in full
    this.audio.lantern();
    this.fx.heal(p.chest(1));
    this.openLantern(key);
  }

  enterArena() {
    const p = this.player;
    this.world.gateOpen = true;
    this.passing = { t: 0 };
    p.setState('move', 'walk');
    this.audio.gate();
  }

  updatePassing(dt) {
    // Walk the hunter through the fog, then seal it behind him and wake the beast.
    const p = this.player;
    this.passing.t += dt;
    p.yaw = 0;
    p.walk(0, 2.2 * dt);
    p.model.play('walk');
    p.sync(dt);
    this.world.fog.material.uniforms.a.value = 1 + Math.sin(this.passing.t * 8) * 0.3;
    if (p.pos.z > GATE_Z + 3.4) {
      this.passing = null;
      this.world.gateSealed = true;
      this.world.fog.visible = false; // the camera would otherwise look back through the sheet
      this.bossActive = true;
      p.setState('idle');
      this.ui.showBoss(true);
      this.audio.setMusic(true);
      this.audio.setReverb(0.45);   // the courtyard rings like a nave
      this.boss.wake();
      p.lock = this.boss;
    }
  }

  checkAreas() {
    for (const a of this.areas) {
      if (!a.shown && this.player.pos.z > a.z && (a.z < 0 ? this.started : true)) {
        a.shown = true;
        this.ui.showArea(a.name);
      }
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const raw = this.clock.getDelta();
    let dt = Math.min(raw, 1 / 20);
    if (this.started && !this.paused) {
      this.adaptResolution(raw);
      if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.05; }
      this.step(dt);
    }
    this.world.updateLightPool(this.camera);
    this.grade.uniforms.t.value = performance.now() / 1000;
    this.composer.render();
    this.input.flush();
  }

  // Adaptive resolution: every 2 s, if the frame rate has sagged (a heavy view, or a phone
  // that has heated up and throttled), render fewer pixels; once it's comfortably smooth
  // again for a while, step back up. Long frames (tab switch, hitch) are ignored.
  adaptResolution(raw) {
    const P = this.perf;
    if (raw > 0.25) return;
    P.t += raw; P.frames++;
    if (P.t < 2) return;
    const fps = P.frames / P.t;
    P.t = 0; P.frames = 0;
    let pr = this.pixelRatio;
    if (fps < 45) { pr = Math.max(this.minPixelRatio, pr - 0.15); P.calm = 0; }
    else if (fps > 56 && ++P.calm >= 3) { pr = Math.min(this.maxPixelRatio, pr + 0.1); P.calm = 0; }
    if (Math.abs(pr - this.pixelRatio) < 0.01) return;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
  }

  // Bodies can't overlap: push living actors apart (the heavier one barely moves).
  separateBodies() {
    const bodies = [this.player, ...this.enemiesAll()].filter((a) => !a.dead && a.root.visible);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (a === this.player && a.state === 'roll') continue; // roll through enemies
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
        if (d >= m || d < 1e-4 || Math.abs(a.pos.y - b.pos.y) > 2) continue;
        const push = m - d, wa = b.radius / m, wb = a.radius / m; // bigger radius = heavier
        a.walk((-dx / d) * push * wa, (-dz / d) * push * wa);
        b.walk((dx / d) * push * wb, (dz / d) * push * wb);
      }
    }
  }

  step(dt) {
    const p = this.player;
    this.interact();
    const frozen = this.ui.noteOpen || this.ui.lanternOpen;
    if (this.passing) this.updatePassing(dt);
    else if (!frozen) p.update(dt);
    else p.sync(dt);
    for (const s of this.seers) {
      const near = s.dist(p) < 40 || s.aggro;
      // Far, idle Seers aren't drawn at all (deep in the fog; saves skinning + draw calls).
      if (near) { if (!s.dead) s.root.visible = true; s.update(dt, p); } else s.root.visible = !s.dead && s.dist(p) < 70;
    }
    if (this.bossActive || this.bossDefeated) this.boss.update(dt, p);
    else this.boss.sync(dt);
    this.separateBodies();
    this.updateProjectiles(dt);
    this.fx.update(dt);
    this.world.update(dt, this.camera.position);
    this.world.followShadow(p.pos);
    this.cam.update(dt, p, frozen ? { mouseDX: 0, mouseDY: 0 } : this.input, heightAt);
    this.audio.setListener(this.camera);
    this.ui.update(p, this.bossActive ? this.boss : null, this.camera);
    this.ui.enemyBars(this.seers, this.camera, p);
    const st = this.world.stain;
    if (st && Math.random() < dt * 16) this.fx.emit(1, new THREE.Vector3(st.x + (Math.random() - 0.5) * 0.9, st.y + 0.05, st.z + (Math.random() - 0.5) * 0.9), { color: [0.9, 0.06, 0.03], speed: 0.15, up: 1.4, life: 1.8, size: 0.07, gravity: -0.5, drag: 0.6 });   // blood motes rising from the stain
    this.checkAreas();
    this.teach();
  }
}

const game = new Game();
window.game = game; // handy for debugging in the console
game.init();
