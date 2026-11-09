import * as THREE from 'three';
import { Actor, angleDiff } from './actor.js';
import { makeProp, ATTACK_IMPACT } from './assets.js';

// Plague Seer: erratic stalker with a censer swing at close range. Variants share the AI:
//   thrower: keeps its distance and lobs blood flasks (game.throwFlask); backs off when crowded.
//   warden:  the mini-boss at the steps (its own body and bell-hammer): slow, all but unstaggerable,
//            an overhead slam whose shockwave hits everything around it, often a second swing.
const KINDS = {
  seer:    { hp: 95,  radius: 0.5, scale: 1,    echoes: 140, damage: 22, reach: 2.3, poise: 20, tint: null },
  thrower: { hp: 70,  radius: 0.45, scale: 0.94, echoes: 160, damage: 16, reach: 2.1, poise: 15, tint: [0.75, 0.95, 0.6] },
  warden:  { hp: 360, radius: 0.75, scale: 1, echoes: 1000, damage: 26, reach: 3.2, poise: 55, tint: null, model: 'warden', weapon: 'bellhammer', slam: 3.2, slamDamage: 10, followUp: 0.25, recover: 1.1 },
};

export class Seer extends Actor {
  constructor(game, spawn, { dormant = false, kind = 'seer' } = {}) {
    const K = KINDS[kind];
    super(game, K.model ?? 'seer', { radius: K.radius, hp: K.hp });
    this.kind = kind; this.K = K;
    this.spawn = spawn;
    this.startDormant = dormant;
    this.weapon = makeProp(K.weapon ?? 'censer');
    this.model.attach(this.weapon, 'R_Hand', { rot: [Math.PI / 2, 0, Math.PI / 2], offset: [0, 0.05, 0] });
    this.root.scale.setScalar(K.scale);
    if (K.tint) this.model.root.traverse((o) => { if (o.isMesh && o.material?.color) o.material.color.multiply(new THREE.Color(...K.tint)); });
    if (kind === 'thrower') {
      // A flask of boiling blood in the off hand, glowing red: reads as "this one throws".
      const flask = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x300404, emissive: 0xff2010, emissiveIntensity: 1.8 }));
      this.model.attach(flask, 'L_Hand', { offset: [0, 0.06, 0] });
    }
    this.reset();
  }

  reset() {
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.game.world.move(this.pos, this.pos.x, this.pos.z, this.radius);
    this.yaw = this.spawn.yaw ?? Math.PI;
    this.hp = this.maxHp; this.dead = false; this.root.visible = true;
    this.aggro = false; this.poiseDmg = 0; this.dormant = this.startDormant; this.throwCd = 1 + Math.random();
    this.jitter = Math.random() * 10;
    this.knock.set(0, 0, 0);
    this.root.position.y = 0;
    this.setState('idle');
  }

  takeHit(dmg, from, { poise = 10, knock = 2 } = {}) {
    if (this.dead) return false;
    const g = this.game;
    this.hp -= dmg;
    this.aggro = true;
    const away = this.pos.clone().sub(from.pos).setY(0).normalize();
    g.fx.blood(this.chest(1.3), away, 1);
    g.audio.hit(this.pos);
    from.onDealtDamage?.(dmg);
    if (this.hp <= 0) { this.die(); return true; }
    this.poiseDmg += poise;
    // Seers are frail: most hits interrupt them unless they are mid-swing past the point of no return.
    if (this.poiseDmg >= this.K.poise && !(this.state === 'attack' && this.stateT > 0.6)) {
      this.poiseDmg = 0;
      this.knock.copy(away).multiplyScalar(knock);
      this.setState('hurt', 'hurt', { duration: 0.6, restart: true });
    }
    return true;
  }

  die() {
    this.dead = true;
    this.setState('dead', 'death');
    this.game.onEnemyKilled(this, this.K.echoes);
  }

  // Ranged behaviour; true when it handled this frame. Holds 6–11 m, throws on a cooldown,
  // backs away when the hunter closes in (and fights with the censer if cornered).
  thrower(dt, d, target, player) {
    this.throwCd -= dt;
    if (d < 4.5) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const x0 = this.pos.x, z0 = this.pos.z;
      this.walk(-fx * 2.2 * dt, -fz * 2.2 * dt);
      if (Math.hypot(this.pos.x - x0, this.pos.z - z0) < 1e-3) return false;   // cornered: melee
      if (this.state !== 'walk') this.setState('walk');
      return true;
    }
    if (d < 13 && this.throwCd <= 0 && Math.abs(angleDiff(target, this.yaw)) < 0.6) {
      this.throwCd = 2.4 + Math.random() * 1.2; this.thrown = false;
      this.setState('throw', 'attack', { duration: 1.1, restart: true });
      return true;
    }
    if (d < 11) { if (this.state !== 'idle') this.setState('idle'); return true; }   // in range: hold ground
    return false;
  }

  // Bell-hammer impact: a ring of force along the ground. It catches whoever dodged the head of
  // the hammer but stayed close (rolling's i-frames still beat it); one hit per swing either way.
  slam(player) {
    this.slammed = true;
    const g = this.game, at = this.pos.clone().addScaledVector(this.forward, 1.6);
    g.shockwave(at, this.K.slam); g.shake(0.6); g.audio.censer(this.pos);
    g.fx.dust(at, 40, 1.4);
    if (!player.dead && !this.hitIds.has(player) && player.pos.distanceTo(at) < this.K.slam && Math.abs(player.pos.y - at.y) < 1.5) player.takeHit(this.K.slamDamage, { pos: at }, { knock: 4 });
  }

  update(dt, player) {
    this.stateT += dt;
    if (this.dead) {
      if (this.stateT > 3.5) this.root.position.y -= dt * 0.4;
      if (this.stateT > 6) this.root.visible = false;
      this.sync(dt);
      return;
    }
    const d = this.dist(player);
    const sees = d < (this.dormant ? 5 : 13) && Math.abs(player.pos.y - this.pos.y) < 3;
    if (!this.aggro && sees && !player.dead) {
      this.aggro = true;
      this.game.audio.screech(this.pos);
      this.dormant = false;
    }
    if (player.dead && this.aggro) { this.aggro = false; }

    switch (this.state) {
      case 'idle':
      case 'walk': {
        if (!this.aggro) {
          // Swaying in place; occasionally pivot.
          if (this.state !== 'idle') this.setState('idle');
          this.yaw += Math.sin(this.stateT * 0.5 + this.jitter) * 0.2 * dt;
          break;
        }
        const target = this.yawTo(player);
        this.turnTo(target, 5, dt);
        if (this.kind === 'thrower' && this.thrower(dt, d, target, player)) break;
        this.recover = Math.max(0, (this.recover ?? 0) - dt);
        if (this.recover > 0 && d < this.K.reach + 0.5) { if (this.state !== 'idle') this.setState('idle'); break; }   // catching its breath
        if (d < this.K.reach && this.recover <= 0 && Math.abs(angleDiff(target, this.yaw)) < 0.5) {
          this.setState('attack', 'attack', { duration: 1.45, restart: true });
          this.swung = false;
        } else {
          // Erratic approach: lurch forward with a side-to-side weave.
          const weave = Math.sin(this.stateT * 2.4 + this.jitter) * 0.8;
          const sp = (d > 6 ? 2.5 : 1.8) * (0.8 + Math.abs(Math.sin(this.stateT * 3.1 + this.jitter)) * 0.5);
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          this.walk((fx + fz * weave * 0.4) * sp * dt, (fz - fx * weave * 0.4) * sp * dt);
          if (this.state !== 'walk') this.setState('walk');
          this.model.setSpeed(sp / 1.6);
        }
        break;
      }
      case 'attack': {
        const k = this.stateT / 1.45;
        if (k < 0.45) this.turnTo(this.yawTo(player), 4, dt);
        if (k > 0.4 && k < ATTACK_IMPACT) this.walk(this.forward.x * 2.2 * dt, this.forward.z * 2.2 * dt);
        if (!this.swung && k > ATTACK_IMPACT - 0.07) { this.swung = true; this.game.audio.censer(this.pos); }
        if (k >= ATTACK_IMPACT - 0.03 && k < ATTACK_IMPACT + 0.08) {
          this.melee([player], { range: this.K.reach, arc: 110, damage: this.K.damage, knock: this.K.slam ? 5 : 3 });
          if (this.K.slam && !this.slammed) this.slam(player);
        }
        if (this.stateT >= 1.45) {
          // The Warden follows through with a second, quicker swing half the time.
          this.slammed = false;
          if (this.K.slam && !this.followUp && Math.random() < this.K.followUp && d < this.K.reach + 1) { this.followUp = true; this.setState('attack', 'attack', { duration: 1.45, restart: true }); this.stateT = 0.3; this.swung = false; this.hitIds.clear(); }
          else { this.followUp = false; this.recover = this.K.recover ?? 0; this.setState('idle'); }   // the Warden's breather: the opening to punish
        }
        break;
      }
      case 'throw': {
        // Wind-up, then the flask leaves the off hand at the top of the swing.
        this.turnTo(this.yawTo(player), 6, dt);
        if (!this.thrown && this.stateT > 0.55) { this.thrown = true; this.game.throwFlask(this.chest(1.5), player.pos); this.game.audio.censer(this.pos); }
        if (this.stateT >= 1.1) this.setState('idle');
        break;
      }
      case 'hurt':
        if (this.stateT >= 0.6) this.setState('idle');
        break;
    }
    // Plague vapour drifts from the censer.
    if (Math.random() < dt * 3 && this.weapon?.children[0]) {
      this.game.fx.poison(this.weapon.children[0].localToWorld(new THREE.Vector3(0, 0.85, 0)), 1);
    }
    this.applyKnock(dt);
    this.sync(dt);
  }
}
