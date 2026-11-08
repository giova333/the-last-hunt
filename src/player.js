import * as THREE from 'three';
import { Actor, angleDiff } from './actor.js';
import { makeProp } from './assets.js';
import { SwordArm, CUTS, cutImpact } from './swing.js';
import { Drink } from './drink.js';

const T = {
  speed: 4.3, sprint: 6.8, rollSpeed: 9.5, rollTime: 0.6, iframes: [0.05, 0.42],
  light: { time: 0.8, stamina: 18, damage: 24, range: 2.4, arc: 120, poise: 12 },
  heavy: { time: 1.3, stamina: 32, damage: 52, range: 2.7, arc: 140, poise: 40, lunge: 4 },
  rollCost: 22, sprintCost: 15, staminaRegen: 42, regenDelay: 0.55,
  healAmount: 55, healTime: 1.4, maxVials: 4,
  rallyWindow: 4, rallyRatio: 0.6,
};

export class Player extends Actor {
  constructor(game) {
    super(game, 'hunter', { radius: 0.42, hp: 120 });
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaWait = 0;
    this.vials = T.maxVials;
    this.rally = 0;       // hp that can be regained by striking back
    this.rallyT = 0;
    this.poison = 0;
    this.echoes = 0;
    this.iframe = false;
    this.lock = null;
    this.stepT = 0;
    this.comboQueued = false;
    // Saw-cleaver in the right hand (rotation tuned for Tripo's rig hand axes).
    this.weapon = makeProp('cleaver');
    if (!this.model.attach(this.weapon, 'R_Hand', { rot: [Math.PI / 2, 0, Math.PI / 2], offset: [0, 0.06, 0.02] })) this.weapon = null;
    this.model.play('idle');
    this.sword = new SwordArm(this, this.weapon);
    this.drink = new Drink(this);
    this.cut = 'fore';
    this.lastAttackEnd = -9;
    // His hip lantern (from the concept art) is a real light: it keeps him readable in the dark.
    // Held above and behind the shoulder: close to the body it blew the coat out to white.
    this.lantern = new THREE.PointLight(0xffa860, 9, 12, 1.4);
    this.lantern.position.set(0.5, 2.3, -0.4);
    this.root.add(this.lantern);
  }

  respawn(at) {
    this.pos.set(at.x, at.y, at.z);
    this.yaw = at.yaw ?? 0;
    this.hp = this.maxHp; this.stamina = this.maxStamina; this.vials = T.maxVials;
    this.rally = 0; this.poison = 0; this.dead = false; this.lock = null;
    this.knock.set(0, 0, 0);
    this.resetPose();
    this.setState('idle');
  }

  resetPose() { const mr = this.model.root; mr.rotation.x = 0; mr.position.set(0, 0, 0); mr.scale.set(1, 1, 1); this.rollDust = false; }

  spend(n) { this.stamina = Math.max(-15, this.stamina - n); this.staminaWait = T.regenDelay; }
  // Free to act, or recovering after the blow has landed (lets attacks chain / be roll-cancelled).
  canAct() {
    if (['idle', 'move'].includes(this.state)) return true;
    if (this.state === 'attack' || this.state === 'heavy') {
      const P = this.state === 'heavy' ? T.heavy : T.light;
      return this.stateT > P.time * (cutImpact(CUTS[this.cut]) + 0.16);
    }
    return this.state === 'hurt' && this.stateT > 0.35;
  }

  // Soft aim: without a lock, turn toward the closest enemy roughly in front (within 4 m).
  aimYaw(lockYaw, want) {
    if (lockYaw !== null) return lockYaw;
    let best = null, bestD = 4;
    for (const e of this.game.enemiesAll()) {
      if (e.dead || !e.root.visible) continue;
      const d = this.dist(e) - e.radius;
      if (d < bestD && Math.abs(angleDiff(this.yawTo(e), want)) < 1.2) { best = e; bestD = d; }
    }
    return best ? this.yawTo(best) : want;
  }

  // Buffer button presses for a short time so an input made during an animation still happens.
  buffer(inp, dt) {
    const pick = inp.hit('Space') ? 'roll' : inp.hit('Mouse0') ? 'light' : inp.hit('Mouse2', 'KeyF') ? 'heavy' : inp.hit('KeyR') ? 'heal' : null;
    if (pick) { this.queued = pick; this.queuedT = 0.4; }
    else if ((this.queuedT -= dt) <= 0) this.queued = null;
  }

  takeHit(damage, from, { knock = 3 } = {}) {
    if (this.dead || this.iframe) return false;
    const g = this.game;
    this.resetPose();
    this.hp -= damage;
    this.rally = Math.min(this.rally + damage, this.maxHp);
    this.rallyT = T.rallyWindow;
    const away = this.pos.clone().sub(from.pos).setY(0).normalize();
    this.knock.copy(away).multiplyScalar(knock);
    g.fx.blood(this.chest(), away, 0.8);
    g.audio.hurt();
    g.shake(0.35);
    g.ui.flashHurt();
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    else if (damage >= 12) this.setState('hurt', 'hurt', { duration: 0.55 });
    return true;
  }

  // Called when our blows land: reclaim blood (rally) and earn nothing else.
  onDealtDamage(dmg) {
    if (this.rally > 0) {
      const gain = Math.min(this.rally, dmg * T.rallyRatio);
      this.hp = Math.min(this.maxHp, this.hp + gain);
      this.rally -= gain;
    }
  }

  die() {
    this.dead = true;
    this.setState('dead', 'death');
    this.game.onPlayerDeath();
  }

  update(dt) {
    const g = this.game, inp = g.input;
    this.stateT += dt;
    this.iframe = false;

    // Stamina, rally, poison.
    this.staminaWait -= dt;
    const sprinting = this.state === 'move' && inp.down('ShiftLeft') && this.moving;
    if (this.staminaWait <= 0 && !sprinting) this.stamina = Math.min(this.maxStamina, this.stamina + T.staminaRegen * dt);
    this.rallyT -= dt;
    if (this.rallyT <= 0) this.rally = Math.max(0, this.rally - 30 * dt);
    if (this.poison > 0 && !this.dead) {
      this.poison -= dt;
      this.hp -= 4 * dt;
      if (this.hp <= 0) { this.hp = 0; this.die(); }
    }

    if (this.dead) { this.sync(dt); this.drink.apply(null); return; }

    // Lock-on toggle.
    if (inp.hit('KeyQ', 'Mouse1', 'Tab')) this.lock = this.lock ? null : g.findLockTarget();
    if (this.lock && (this.lock.dead || this.dist(this.lock) > (this.lock.radius > 1 ? 40 : 24))) this.lock = null;

    // Movement intent relative to camera.
    const f = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const s = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
    const cy = g.cam.yaw;
    const dir = new THREE.Vector3(Math.sin(cy) * f - Math.cos(cy) * s, 0, Math.cos(cy) * f + Math.sin(cy) * s);
    this.moving = dir.lengthSq() > 0;
    if (this.moving) dir.normalize();
    const lockYaw = this.lock ? this.yawTo(this.lock) : null;

    // Actions (buffered).
    this.buffer(inp, dt);
    const q = this.queued;
    if (q && this.canAct() && !g.paused) {
      this.queued = null;
      if (q === 'roll' && this.stamina > 1) {
        this.resetPose();
        this.spend(T.rollCost);
        this.rollDir = this.moving ? dir.clone() : this.forward.multiplyScalar(-1);
        if (this.moving) this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
        this.setState('roll', 'run', { duration: null });
        this.model.setSpeed(1.6);
        g.audio.roll();
      } else if (q === 'light' && this.stamina > 1) {
        this.spend(T.light.stamina);
        this.yaw = this.aimYaw(lockYaw, this.moving ? Math.atan2(dir.x, dir.z) : this.yaw);
        const chained = this.state === 'attack' || performance.now() / 1000 - this.lastAttackEnd < 0.45;
        this.cut = chained && this.cut === 'fore' ? 'back' : 'fore';
        this.setState('attack', 'idle', { fade: 0.12 });
        this.swung = false;
      } else if (q === 'heavy' && this.stamina > 1) {
        this.spend(T.heavy.stamina);
        this.yaw = this.aimYaw(lockYaw, this.moving ? Math.atan2(dir.x, dir.z) : this.yaw);
        this.cut = 'heavy';
        this.setState('heavy', 'idle', { fade: 0.12 });
        this.swung = false;
      } else if (q === 'heal' && this.vials > 0 && this.hp < this.maxHp) {
        this.vials--;
        this.setState('heal', 'idle');
        this.healed = false;
      }
    }

    switch (this.state) {
      case 'idle':
      case 'move': {
        const sprint = inp.down('ShiftLeft') && this.stamina > 0 && this.moving && !this.lock;
        if (sprint) { this.stamina -= T.sprintCost * dt; this.staminaWait = 0.3; }
        const sp = sprint ? T.sprint : T.speed * (this.lock ? 0.8 : 1);
        if (this.moving) {
          this.walk(dir.x * sp * dt, dir.z * sp * dt);
          this.turnTo(lockYaw ?? Math.atan2(dir.x, dir.z), 12, dt);
          this.setState('move', null);
          const anim = this.lock && Math.abs(angleDiff(Math.atan2(dir.x, dir.z), lockYaw)) > 0.8 ? 'walk' : (sprint ? 'run' : 'run');
          this.model.play(anim);
          this.model.setSpeed(sprint ? 1.15 : anim === 'walk' ? 1.3 : 0.85);
          this.stepT -= dt * (sprint ? 1.5 : 1);
          if (this.stepT < 0) { g.audio.step(); this.stepT = 0.33; }
        } else {
          if (lockYaw !== null) this.turnTo(lockYaw, 10, dt);
          if (this.state !== 'idle') this.setState('idle');
        }
        break;
      }
      case 'roll': {
        const k = this.stateT / T.rollTime;
        this.iframe = this.stateT > T.iframes[0] && this.stateT < T.iframes[1];
        const sp = T.rollSpeed * (1 - k * 0.7);
        this.walk(this.rollDir.x * sp * dt, this.rollDir.z * sp * dt);
        // Tumble the whole figure forward around its hips (c = pivot height), crouched low.
        const e = Math.min(1, k * 1.15), th = e * Math.PI * 2, c = 0.75, squash = Math.sin(e * Math.PI);
        const mr = this.model.root;
        mr.rotation.x = th;
        mr.position.set(0, c - c * Math.cos(th) - squash * 0.35, -c * Math.sin(th));
        mr.scale.set(1, 1 - squash * 0.25, 1);
        if (!this.rollDust) { this.rollDust = true; g.fx.dust(this.pos, 10, 0.5); }
        if (this.stateT >= T.rollTime) { mr.rotation.x = 0; mr.position.set(0, 0, 0); mr.scale.set(1, 1, 1); this.rollDust = false; this.setState('idle'); }
        break;
      }
      case 'attack':
      case 'heavy': {
        const P = this.state === 'heavy' ? T.heavy : T.light;
        const k = this.stateT / P.time, C = CUTS[this.cut], hit = cutImpact(C);
        if (lockYaw !== null && k < hit) this.turnTo(lockYaw, 10, dt);
        // Step into the cut.
        if (k > C.windup - 0.1 && k < hit) this.walk(this.forward.x * (P.lunge ?? 2) * dt, this.forward.z * (P.lunge ?? 2) * dt);
        if (!this.swung && k >= C.windup) { this.swung = true; g.audio.swing(this.state === 'heavy'); }
        if (k >= C.windup + C.strike * 0.2 && k <= C.windup + C.strike + 0.04) {
          if (this.melee(g.enemiesAll(), { range: P.range, arc: P.arc, damage: P.damage, poise: P.poise, knock: this.state === 'heavy' ? 4 : 2 })) {
            g.hitStop(this.state === 'heavy' ? 0.11 : 0.06);
          }
        }
        if (this.stateT >= P.time) { this.lastAttackEnd = performance.now() / 1000; this.setState('idle'); }
        break;
      }
      case 'heal': {
        if (this.moving) this.walk(dir.x * 1.4 * dt, dir.z * 1.4 * dt);
        if (!this.healed && this.stateT > T.healTime * 0.48) {
          this.healed = true;
          this.hp = Math.min(this.maxHp, this.hp + T.healAmount);
          this.poison = 0;
          this.rally = 0;
          g.fx.heal(this.chest(1));
          g.audio.heal();
        }
        if (this.stateT >= T.healTime) this.setState('idle');
        break;
      }
      case 'hurt':
        if (this.stateT >= 0.55) this.setState('idle');
        break;
    }

    this.applyKnock(dt);
    this.sync(dt);
    // Procedural cut on top of the base pose (also ages the blade trail).
    const atk = this.state === 'attack' || this.state === 'heavy';
    this.sword.apply(atk ? this.cut : null, atk ? this.stateT / (this.state === 'heavy' ? T.heavy : T.light).time : 0, dt);
    this.drink.apply(this.state === 'heal' ? Math.min(1, this.stateT / T.healTime) : null);
  }
}

export const PLAYER_TUNING = T;
