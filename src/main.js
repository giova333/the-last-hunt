import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { loadAssets } from './assets.js';
import { World, heightAt, ARENA, GATE_Z } from './world.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Seer } from './seer.js';
import { Boss } from './boss.js';
import { ThirdPersonCamera } from './camera.js';
import { UI } from './ui.js';
import { TouchControls, isTouchDevice } from './touch.js';

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.isTouch = isTouchDevice();
    // Phones: lower render resolution keeps the frame rate up.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isTouch ? 1.25 : 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.75;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a3248, 0.016);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.82);
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
    if (this.isTouch) this.world.moon.shadow.mapSize.set(1024, 1024);
    // Image-based lighting from the night sky: wet stone and metal reflect the moon and clouds.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.world.sky.material));
    this.scene.environment = pmrem.fromScene(envScene, 0.015).texture;
    this.scene.environmentIntensity = 0.4;
    this.fx = new FX(this.scene);
    this.fx.heightAt = heightAt;
    this.cam = new ThirdPersonCamera(this.camera);
    this.player = new Player(this);
    this.seers = [
      // Street
      new Seer(this, { x: 2.5, z: 19, yaw: Math.PI }),
      new Seer(this, { x: -3, z: 31, yaw: Math.PI }),
      new Seer(this, { x: 3.8, z: 40, yaw: -Math.PI / 2 }, { dormant: true }),
      new Seer(this, { x: -1, z: 52, yaw: Math.PI }),
      // Plaza
      new Seer(this, { x: 9, z: 68, yaw: -Math.PI / 2 }),
      new Seer(this, { x: -8, z: 70, yaw: Math.PI / 2 }),
      new Seer(this, { x: -12, z: 79, yaw: Math.PI / 2 }, { dormant: true }),
      new Seer(this, { x: 6, z: 84, yaw: Math.PI }),
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
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xc09070, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(pos.y + 0.1);
    this.scene.add(m);
    this.waves.push({ m, t: 0, r });
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.life -= dt;
      this.fx.poison(p.m.position, 1);
      const floor = heightAt(p.m.position.x, p.m.position.z);
      const hitPlayer = p.m.position.distanceTo(this.player.chest(1)) < 0.7;
      if (p.m.position.y <= floor || hitPlayer || p.life <= 0) {
        p.dead = true;
        this.scene.remove(p.m);
        this.audio.shatter();
        const at = p.m.position.clone().setY(floor);
        if (hitPlayer) this.player.takeHit(12, { pos: at }, { knock: 1 }) && (this.player.poison = 4);
        this.spawnPool(at);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const pool of this.pools) {
      pool.t -= dt;
      pool.m.material.opacity = Math.min(0.55, pool.t * 0.3);
      if (Math.random() < dt * 10) this.fx.poison(pool.m.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4)), 1);
      if (this.player.pos.distanceTo(pool.m.position) < 1.7 && !this.player.dead) this.player.poison = Math.max(this.player.poison, 2.5);
      if (pool.t <= 0) { this.scene.remove(pool.m); pool.dead = true; }
    }
    this.pools = this.pools.filter((p) => !p.dead);
    for (const w of this.waves) {
      w.t += dt;
      const k = w.t / 0.45;
      w.m.scale.setScalar(1 + k * w.r);
      w.m.material.opacity = 0.6 * (1 - k);
      if (k >= 1) { this.scene.remove(w.m); w.dead = true; }
    }
    this.waves = this.waves.filter((w) => !w.dead);
  }

  spawnPool(at) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshBasicMaterial({ color: 0x5a8a1a, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(at.y + 0.03);
    this.scene.add(m);
    this.pools.push({ m, t: 4.5 });
  }

  onEnemyKilled(e, echoes) {
    this.player.echoes += echoes;
    this.fx.echoes(e.chest(1));
    if (this.player.lock === e) this.player.lock = this.findLockTarget();
  }

  onBossKilled() {
    this.bossDefeated = true;
    this.player.echoes += 5000;
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
  }

  onPlayerDeath() {
    this.audio.death();
    this.ui.showBanner('The Blood Runs Cold', '', false, 0);
    setTimeout(() => this.restartFromCheckpoint(), 4200);
  }

  restartFromCheckpoint() {
    this.ui.banner.classList.add('hidden');
    const L = this.checkpoint;
    this.player.respawn({ x: L.x - 1.2, y: L.y, z: L.z, yaw: 0 });
    this.cam.yaw = 0;
    this.player.echoes = Math.floor(this.player.echoes / 2);
    this.resetEnemies();
  }

  resetEnemies() {
    for (const s of this.seers) s.reset();
    for (const p of this.projectiles) this.scene.remove(p.m);
    for (const p of this.pools) this.scene.remove(p.m);
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
    if (p.dead || !['idle', 'move'].includes(p.state)) { this.ui.setPrompt(null); return; }
    let prompt = null, action = null;
    for (const L of this.world.lanterns) {
      if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < 2) {
        prompt = L.lit ? '<b>E</b> — Rest at the lantern' : '<b>E</b> — Light the lantern';
        action = () => {
          if (!L.lit) { this.world.lightLantern(L); this.ui.showBanner('Lantern Lit', L.name, true, 2500); }
          this.checkpoint = L;
          p.hp = p.maxHp; p.vials = 4; p.poison = 0; p.rally = 0;
          this.resetEnemies();
          this.audio.lantern();
          this.fx.heal(p.chest(1));
        };
      }
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
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.started && !this.paused) {
      if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.05; }
      this.step(dt);
    }
    this.grade.uniforms.t.value = performance.now() / 1000;
    this.composer.render();
    this.input.flush();
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
    const frozen = this.ui.noteOpen;
    if (this.passing) this.updatePassing(dt);
    else if (!frozen) p.update(dt);
    else p.sync(dt);
    for (const s of this.seers) {
      const near = s.dist(p) < 40 || s.aggro;
      if (near) s.update(dt, p); else s.root.visible = !s.dead;
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
    this.checkAreas();
  }
}

const game = new Game();
window.game = game; // handy for debugging in the console
game.init();
