import * as THREE from 'three';
import { ArmIK, rotateWorld, Trail, follow, smooth, clamp01 } from './swing.js';

// The Hound's claw rakes, layered over its hunched idle (same approach as the hunter's cuts):
// the raking arm follows an arc via stable two-bone IK, the torso twists into it and hunches,
// the head stays on the prey, and the claws leave a dark-red trail.
// Paths: directions from the shoulder in the actor frame (x = left, y = up, z = forward),
// written for the RIGHT arm; the left arm mirrors x.
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RAKE = [v3(-0.75, 0.75, -0.3), v3(-0.5, 0.4, 0.8), v3(0.15, -0.25, 1), v3(0.6, -0.75, 0.45), v3(0.55, -0.95, 0.05)];
const STRIKE_U = 0.8;
export const CLAW = { windup: 0.42, strike: 0.16 };
export const clawImpact = CLAW.windup + CLAW.strike * 0.55;
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export class Claws {
  constructor(actor) {
    this.actor = actor;
    const b = {};
    actor.model.root.traverse((o) => { if (o.isBone) b[o.name] = o; });
    this.b = b;
    this.ok = !!(b.R_Upperarm && b.R_Forearm && b.R_Hand && b.L_Upperarm && b.L_Forearm && b.L_Hand && b.Spine01 && b.Spine02);
    if (!this.ok) return;
    this.arm = {
      R: { ik: new ArmIK(b.R_Upperarm, b.R_Forearm, b.R_Hand), curve: new THREE.CatmullRomCurve3(RAKE.map((p) => p.clone().normalize()), false, 'centripetal'), w: 0, pole: v3(-0.6, -0.8, -0.2), hand: b.R_Hand, fore: b.R_Forearm, local: null },
      L: { ik: new ArmIK(b.L_Upperarm, b.L_Forearm, b.L_Hand), curve: new THREE.CatmullRomCurve3(RAKE.map((p) => v3(-p.x, p.y, p.z).normalize()), false, 'centripetal'), w: 0, pole: v3(0.6, -0.8, -0.2), hand: b.L_Hand, fore: b.L_Forearm, local: null },
    };
    this.trail = new Trail(actor.game.scene, 64, [0.85, 0.12, 0.08], 0.3);
    this.tw = 0; this.lean = 0; this.drop = 0;
  }

  // side: 'R' | 'L' | null (no rake); k: 0..1 through the swing; scale: body size factor.
  apply(side, k, dt, scale = 1) {
    if (!this.ok) return;
    this.trail.update(dt);
    const B = this.b, actor = this.actor;
    const C = CLAW, end = C.windup + C.strike;
    // Per-arm weights: the raking arm eases in, the other eases out (so alternating rakes blend).
    const wantW = side ? (k < C.windup ? smooth(clamp01(k / (C.windup * 0.7))) : k < end + 0.12 ? 1 : 1 - smooth(clamp01((k - end - 0.12) / Math.max(0.01, 0.95 - end - 0.12)))) : 0;
    for (const s of ['R', 'L']) {
      const A = this.arm[s];
      A.w = follow(A.w, s === side ? wantW : 0, s === side ? 18 : 10, dt);
    }
    const any = this.arm.R.w > 0.003 || this.arm.L.w > 0.003;
    if (!any) { this.arm.R.ik.reset(); this.arm.L.ik.reset(); this.arm.R.local = this.arm.L.local = null; this.tw = this.lean = this.drop = 0; return; }
    actor.model.protect([B.Spine01, B.Spine02, B.Head, B.R_Upperarm, B.R_Forearm, B.R_Hand, B.L_Upperarm, B.L_Forearm, B.L_Hand]);

    let u = 0;
    if (side) {
      if (k >= C.windup && k < end) { const t = (k - C.windup) / C.strike; u = STRIKE_U * (t * t * (3 - 2 * t) * 0.7 + t * 0.3); }
      else if (k >= end) u = STRIKE_U + (1 - STRIKE_U) * (1 - Math.pow(1 - clamp01((k - end) / 0.15), 2));
    }
    const sgn = side === 'L' ? -1 : 1;
    const ws = side ? this.arm[side].w : 0;
    const s01 = clamp01(u / STRIKE_U);
    this.tw = follow(this.tw, sgn * THREE.MathUtils.lerp(-0.55, 0.6, s01) * ws, 24, dt);
    this.lean = follow(this.lean, THREE.MathUtils.lerp(0.05, 0.35, s01) * ws, 24, dt);

    const root = actor.root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const left = v3(1, 0, 0).applyQuaternion(rq);
    _q.setFromAxisAngle(UP, this.tw * 0.45); rotateWorld(B.Spine01, _q);
    _q.setFromAxisAngle(left, this.lean * 0.5); rotateWorld(B.Spine01, _q);
    _q.setFromAxisAngle(UP, this.tw * 0.55); rotateWorld(B.Spine02, _q);
    _q.setFromAxisAngle(left, this.lean * 0.5); rotateWorld(B.Spine02, _q);
    if (B.Head) { _q.setFromAxisAngle(UP, -this.tw * 0.7); rotateWorld(B.Head, _q); _q.setFromAxisAngle(left, -this.lean * 0.8); rotateWorld(B.Head, _q); }

    for (const s of ['R', 'L']) {
      const A = this.arm[s];
      if (A.w < 0.003) { A.ik.reset(); A.local = null; continue; }
      const up = A.ik.bones[0];
      const a = up.getWorldPosition(new THREE.Vector3());
      const armLen = a.distanceTo(A.fore.getWorldPosition(new THREE.Vector3())) + A.fore.getWorldPosition(new THREE.Vector3()).distanceTo(A.hand.getWorldPosition(new THREE.Vector3()));
      if (s === side) {
        const dir = A.curve.getPoint(clamp01(u)).normalize();
        A.local = dir.multiplyScalar(armLen * THREE.MathUtils.lerp(0.75, 0.97, s01));
      }
      if (!A.local) continue;
      A.ik.solve(a.clone().add(A.local.clone().applyQuaternion(rq)), A.pole.clone().applyQuaternion(rq), A.w);
      // Claw trail during the fast part of the rake.
      if (s === side && k > C.windup && k < end + 0.05) {
        const h = A.hand.getWorldPosition(new THREE.Vector3());
        const dirF = h.clone().sub(A.fore.getWorldPosition(new THREE.Vector3())).normalize();
        this.trail.push(h, h.clone().addScaledVector(dirF, 0.9 * scale), a);
      }
    }
  }
}
