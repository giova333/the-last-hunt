import * as THREE from 'three';
import { CharacterModel } from './assets.js';

export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const lerpAngle = (a, b, t) => a + angleDiff(b, a) * t;

// Shared base for the hunter and the beasts.
export class Actor {
  constructor(game, modelName, { radius = 0.45, hp = 100 } = {}) {
    this.game = game;
    this.model = new CharacterModel(modelName);
    this.root = new THREE.Group();
    this.root.add(this.model.root);
    game.scene.add(this.root);
    this.pos = this.root.position;
    this.yaw = 0;
    this.radius = radius;
    this.maxHp = hp;
    this.hp = hp;
    this.dead = false;
    this.state = 'idle';
    this.stateT = 0;
    this.hitIds = new Set();
    this.knock = new THREE.Vector3();
  }

  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  chest(h = 1.2) { return this.pos.clone().add(new THREE.Vector3(0, h, 0)); }
  dist(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  yawTo(o) { return Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  turnTo(target, rate, dt) { this.yaw = lerpAngle(this.yaw, target, Math.min(1, rate * dt)); }

  setState(s, anim = s, opts) {
    this.state = s;
    this.stateT = 0;
    this.hitIds.clear();
    if (anim) this.model.play(anim, opts);
  }

  walk(dx, dz) { this.game.world.move(this.pos, this.pos.x + dx, this.pos.z + dz, this.radius); }

  // Strike everything in `targets` within range and arc in front; each target at most once per swing.
  melee(targets, { range, arc = 100, damage, poise = 10, knock = 2, heightTol = 2.5 }) {
    let hit = false;
    for (const t of targets) {
      if (!t || t.dead || this.hitIds.has(t)) continue;
      const d = this.dist(t) - t.radius;
      if (d > range || Math.abs(t.pos.y - this.pos.y) > heightTol) continue;
      const a = Math.abs(angleDiff(this.yawTo(t), this.yaw)) * 180 / Math.PI;
      if (a > arc / 2 && d > 0.6) continue;
      this.hitIds.add(t);
      if (t.takeHit(damage, this, { poise, knock })) hit = true;
    }
    return hit;
  }

  applyKnock(dt) {
    if (this.knock.lengthSq() < 0.001) return;
    this.walk(this.knock.x * dt, this.knock.z * dt);
    this.knock.multiplyScalar(Math.max(0, 1 - 8 * dt));
  }

  sync(dt) {
    this.root.rotation.y = this.yaw;
    this.model.update(dt);
  }
}
