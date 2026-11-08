import * as THREE from 'three';
import { Actor, angleDiff } from './actor.js';
import { makeProp, ATTACK_IMPACT } from './assets.js';

// Plague Seer: erratic stalker. Melee only: a censer swing at close range.
export class Seer extends Actor {
  constructor(game, spawn, { dormant = false } = {}) {
    super(game, 'seer', { radius: 0.5, hp: 95 });
    this.spawn = spawn;
    this.dormant = dormant;
    this.weapon = makeProp('censer');
    this.model.attach(this.weapon, 'R_Hand', { rot: [Math.PI / 2, 0, Math.PI / 2], offset: [0, 0.05, 0] });
    this.reset();
  }

  reset() {
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.game.world.move(this.pos, this.pos.x, this.pos.z, this.radius);
    this.yaw = this.spawn.yaw ?? Math.PI;
    this.hp = this.maxHp; this.dead = false; this.root.visible = true;
    this.aggro = false; this.poiseDmg = 0;
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
    if (this.poiseDmg >= 20 && !(this.state === 'attack' && this.stateT > 0.6)) {
      this.poiseDmg = 0;
      this.knock.copy(away).multiplyScalar(knock);
      this.setState('hurt', 'hurt', { duration: 0.6, restart: true });
    }
    return true;
  }

  die() {
    this.dead = true;
    this.setState('dead', 'death');
    this.game.onEnemyKilled(this, 140);
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
        if (d < 2.3 && Math.abs(angleDiff(target, this.yaw)) < 0.5) {
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
        if (k >= ATTACK_IMPACT - 0.03 && k < ATTACK_IMPACT + 0.08) this.melee([player], { range: 2.3, arc: 110, damage: 22, knock: 3 });
        if (this.stateT >= 1.45) this.setState('idle');
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
