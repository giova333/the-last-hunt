import * as THREE from 'three';
import { Actor, angleDiff } from './actor.js';
import { ATTACK_IMPACT } from './assets.js';
import { ARENA } from './world.js';
import { Claws, clawImpact } from './claws.js';

// The Hound of Saint Orlan — two-phase boss.
// Phase 1: swipes, a two-hit combo, a pouncing leap. Phase 2 (≤50%): roar, faster, adds charge + frenzy.
// Sizes are tuned for a 5.8 m Hound (S scales distances from the original 4.2 m tuning).
const S = 1.38;
const MOVES = {
  swipe: { time: 1.35, range: 3.0 * S, damage: 30, arc: 130 },
  combo2: { time: 1.0, range: 3.0 * S, damage: 24, arc: 130 },
  frenzy: { time: 0.8, range: 3.2 * S, damage: 20, arc: 140 },
};

export class Boss extends Actor {
  constructor(game) {
    super(game, 'wolf', { radius: 1.7, hp: 1100 });
    this.claws = new Claws(this);
    this.reset();
  }

  reset() {
    this.pos.set(ARENA.x, ARENA.y, ARENA.z + 3);
    this.yaw = Math.PI;
    this.hp = this.maxHp; this.dead = false; this.root.visible = true;
    this.phase = 1; this.poise = 0; this.cd = 0; this.chain = 0; this.lastMove = ''; this.roared = false; this.comboLeft = 0;
    this.knock.set(0, 0, 0);
    this.tint(0);
    this.setState('dormant', 'idle');
  }

  setState(s, anim, opts) {
    // Clear procedural crouch/lean so an interrupted move never leaves the body offset.
    this.model.root.position.y = 0;
    this.model.root.rotation.x = 0;
    super.setState(s, anim, opts);
  }

  get speedMul() { return this.phase === 2 ? 1.22 : 1; }

  tint(k) {
    this.model.root.traverse((o) => {
      if (o.isMesh && o.material) { o.material.emissive = new THREE.Color(0.6, 0.0, 0.0); o.material.emissiveIntensity = k; }
    });
  }

  wake() {
    if (this.state !== 'dormant') return;
    this.setState('intro', 'idle');
    this.game.audio.roar(this.pos, false);   // the boss music kicks in with this roar, not under it
    this.game.shake(0.6);
  }

  takeHit(dmg, from, { poise = 10 } = {}) {
    if (this.dead || this.state === 'dormant') return false;
    const g = this.game;
    this.hp -= dmg;
    const away = this.pos.clone().sub(from.pos).setY(0).normalize();
    g.fx.blood(this.chest(3.0).addScaledVector(away, -1.1), away, 1.8);
    g.audio.hit(this.pos, true);
    from.onDealtDamage?.(dmg);
    if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5 && !['leap'].includes(this.state)) {
      this.phase = 2;
      this.setState('roar', 'idle');
      return true;
    }
    this.poise += poise;
    if (this.poise >= 110 && !['leap', 'roar', 'charge'].includes(this.state)) {
      this.poise = 0;
      this.setState('stagger', 'hurt', { duration: 1.6, restart: true });
      g.audio.slam(this.pos);
    }
    return true;
  }

  die() {
    this.dead = true;
    this.setState('dead', 'death');
    this.game.audio.roar(this.pos);
    this.game.onBossKilled(this);
  }

  pick(d) {
    // Weighted choice by distance; avoid repeating the same move three times.
    const opts = [];
    if (d < 4.6 * S) { opts.push(['swipe', 3], ['combo', 3]); if (this.phase === 2) opts.push(['frenzy', 3]); }
    if (d > 6 * S) { opts.push(['leap', 3]); if (this.phase === 2) opts.push(['charge', 3]); }
    if (d >= 4.6 * S && d <= 6 * S) opts.push(['leap', 1], ['stalk', 2]);
    const pool = opts.filter(([m]) => !(m === this.lastMove && this.chain >= 1));
    const list = pool.length ? pool : opts;
    let r = Math.random() * list.reduce((s, o) => s + o[1], 0);
    for (const [m, w] of list) { r -= w; if (r <= 0) { this.chain = m === this.lastMove ? this.chain + 1 : 0; this.lastMove = m; return m; } }
    return 'stalk';
  }

  startSwing(kind, idx = 0) {
    const M = MOVES[kind];
    // Claw rakes alternate arms through a combo; a lone swipe picks a side at random.
    const side = kind === 'swipe' ? (Math.random() < 0.5 ? 'R' : 'L') : (idx % 2 === 0 ? 'R' : 'L');
    this.move = { kind, idx, side, ...M, time: M.time / this.speedMul };
    if (this.state !== 'swing') this.setState('swing', 'idle', { fade: 0.15 });
    else { this.stateT = 0; this.hitIds.clear(); }
    this.swung = false;
  }

  update(dt, player) {
    const g = this.game;
    this.stateT += dt;
    const d = this.dist(player);
    const toP = this.yawTo(player);
    const mr = this.model.root;

    if (this.dead) {
      this.sync(dt);
      if (this.stateT > 4) this.root.position.y -= dt * 0.25;
      if (this.stateT > 9) this.root.visible = false;
      return;
    }

    switch (this.state) {
      case 'dormant':
        // Hunched over remains, breathing slowly.
        this.model.setSpeed(0.6);
        break;
      case 'intro':
        this.turnTo(toP, 3, dt);
        if (this.stateT > 0.3 && this.stateT < 1.6) g.shake(0.15);
        if (this.stateT > 2.2) { this.setState('stalk', 'walk'); this.cd = 0.6; }
        break;
      case 'stalk': {
        if (player.dead) { this.model.play('idle'); break; }
        this.turnTo(toP, 4 * this.speedMul, dt);
        // Circle-strafe slightly while closing in.
        const circ = Math.sin(this.stateT * 0.9) * 0.6;
        const want = d > 3.6 * S ? 1 : 0;
        const sp = (d > 9 * S ? 5.2 : 3.2) * this.speedMul;   // longer strides for the bigger body
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this.walk((fx * want + fz * circ * 0.5) * sp * dt, (fz * want - fx * circ * 0.5) * sp * dt);
        // Heavy footfalls.
        this.stepT = (this.stepT ?? 0) - dt * (d > 9 * S ? 1.6 : 1);
        if (this.stepT < 0) { g.audio.stomp(this.pos); this.stepT = 0.62; if (d < 14) g.shake(0.05); }
        this.model.play(d > 9 * S ? 'run' : 'walk');
        this.model.setSpeed(d > 9 * S ? 0.95 : 0.85 * this.speedMul);
        this.cd -= dt;
        if (this.cd <= 0 && Math.abs(angleDiff(toP, this.yaw)) < 0.6) {
          const m = this.pick(d);
          if (m === 'swipe') this.startSwing('swipe');
          else if (m === 'combo') this.startSwing('combo2', 0), (this.comboLeft = 1);
          else if (m === 'frenzy') this.startSwing('frenzy', 0), (this.comboLeft = 2);
          else if (m === 'leap') { this.setState('leapWind', 'leap', { duration: 1.35 / this.speedMul, restart: true, fade: 0.22 }); g.audio.claw(this.pos); }
          else if (m === 'charge') { this.setState('chargeWind', 'idle'); g.audio.roar(this.pos); }
          else this.cd = 0.8;
        }
        break;
      }
      case 'swing': {
        const M = this.move, k = this.stateT / M.time;
        if (k < 0.5) this.turnTo(toP, 5 * this.speedMul, dt);
        if (k > 0.3 && k < clawImpact) this.walk(this.forward.x * 4 * S * dt, this.forward.z * 4 * S * dt);
        if (!this.swung && k > clawImpact - 0.08) { this.swung = true; g.audio.claw(this.pos); }
        if (k >= clawImpact - 0.05 && k < clawImpact + 0.08) {
          if (this.melee([player], { range: M.range, arc: M.arc, damage: M.damage, knock: 5 })) g.shake(0.3);
        }
        // Chain into the next swing of a combo early, before the recovery.
        if (this.comboLeft > 0 && k > 0.8) {
          this.comboLeft--;
          this.startSwing(M.kind, M.idx + 1);
          break;
        }
        if (this.stateT >= M.time) { this.comboLeft = 0; this.setState('stalk', 'walk'); this.cd = (this.phase === 2 ? 0.4 : 0.9) + Math.random() * 0.5; }
        break;
      }
      case 'leapWind': {
        this.turnTo(toP, 6, dt);
        if (this.stateT >= 0.6 / this.speedMul) {
          this.leapFrom = this.pos.clone();
          // Aim where the player is now (rolling sideways late beats it).
          this.leapTo = player.pos.clone().addScaledVector(this.forward, -1.6 * S);
          this.setState('leap', null);   // the dive clip keeps playing: launch → pounce
        }
        break;
      }
      case 'leap': {
        const T = 0.75 / this.speedMul, k = Math.min(1, this.stateT / T);
        const nx = THREE.MathUtils.lerp(this.leapFrom.x, this.leapTo.x, k), nz = THREE.MathUtils.lerp(this.leapFrom.z, this.leapTo.z, k);
        this.walk(nx - this.pos.x, nz - this.pos.z);
        mr.position.y = Math.sin(k * Math.PI) * 5.2;
        if (k >= 1) {
          mr.position.y = 0; mr.rotation.x = 0;
          g.audio.slam(this.pos); g.shake(0.9);
          g.fx.dust(this.pos, 80, 2.8);
          g.fx.blood(this.pos.clone().setY(this.pos.y + 0.2), null, 0.8);
          g.shockwave(this.pos, 6.2);
          if (d < 6.2 + player.radius) player.takeHit(38, this, { knock: 10 });
          this.setState('recover', 'idle', { fade: 0.3 });
        }
        break;
      }
      case 'chargeWind':
        this.turnTo(toP, 8, dt);
        mr.position.y = -Math.min(1, this.stateT / 0.4) * 0.35 * S;
        if (this.stateT > 0.9) { mr.position.y = 0; this.setState('charge', 'run'); this.model.setSpeed(1.5); this.chargeHit = false; }
        break;
      case 'charge': {
        this.turnTo(toP, this.stateT < 0.5 ? 2.2 : 0.3, dt);
        const sp = 14;
        const before = this.pos.clone();
        this.walk(this.forward.x * sp * dt, this.forward.z * sp * dt);
        const blocked = before.distanceTo(this.pos) < sp * dt * 0.3;
        if (!this.chargeHit && d < this.radius + player.radius + 0.6) { this.chargeHit = player.takeHit(30, this, { knock: 12 }); if (this.chargeHit) g.shake(0.5); }
        if (Math.random() < 0.5) g.fx.dust(this.pos, 2, 0.6);
        if (this.stateT > 1.3 || blocked) { this.setState('recover', 'idle', { fade: 0.3 }); if (blocked) { g.audio.slam(this.pos); g.shake(0.6); } }
        break;
      }
      case 'recover':
        mr.position.y = 0; mr.rotation.x = 0;
        if (this.stateT > (this.phase === 2 ? 0.7 : 1.1)) { this.setState('stalk', 'walk'); this.cd = 0.3; }
        break;
      case 'stagger':
        if (this.stateT > 1.6) { this.setState('stalk', 'walk'); this.cd = 0.2; }
        break;
      case 'roar':
        // Phase transition: blood frenzy.
        mr.rotation.x = -Math.sin(Math.min(1, this.stateT / 2.2) * Math.PI) * 0.4;
        if (this.stateT < dt * 1.5) { g.audio.setMusic(true, true); g.audio.roar(this.pos, false); }
        if (this.stateT > 0.5 && !this.roared) {
          this.roared = true;
          g.shake(1); g.fx.mist(this.chest(3.4)); g.shockwave(this.pos, 8);
          if (d < 8) player.takeHit(10, this, { knock: 14 });
          g.world.rose.material.uniforms.rage.value = 1;
          g.world.roseLight.color.set(0xff2010);
        }
        this.tint(Math.min(1, this.stateT / 2) * 0.07);
        if (this.stateT > 2.2) { mr.rotation.x = 0; this.setState('stalk', 'walk'); this.cd = 0.2; }
        break;
    }
    // Phase 2: blood steams off the hide.
    if (this.phase === 2 && Math.random() < dt * 8) g.fx.emit(1, this.chest(2.8 + Math.random() * 1.4), { color: [0.5, 0.02, 0.02], speed: 0.4, up: 1, life: 1.2, size: 0.35, gravity: -1, drag: 1 });
    this.applyKnock(dt);
    this.sync(dt);
    this.claws.apply(this.state === 'swing' ? this.move.side : null, this.state === 'swing' ? this.stateT / this.move.time : 0, dt, S);
  }
}
