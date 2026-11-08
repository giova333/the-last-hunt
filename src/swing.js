import * as THREE from 'three';

// Procedural sword cuts layered over the base animation.
// Tripo's only slash preset is an overhead chop, so the hunter's cuts are driven here:
// the torso twists, a two-bone IK solver sweeps the sword arm along an arc, the hand is
// turned so the blade follows the arc, and a ribbon trail traces the edge.
// Paths are directions from the shoulder in the actor's frame (x = left, y = up, z = forward).

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const CUTS = {
  // Forehand: high right → low left.
  fore: { path: [v3(-0.55, 0.8, -0.45), v3(-0.45, 0.45, 0.8), v3(0.25, -0.05, 1), v3(0.8, -0.55, 0.35)], reach: [0.7, 1], twist: [-0.75, 0.55], windup: 0.36, strike: 0.16 },
  // Backhand: low left → high right (follows the forehand in a combo).
  back: { path: [v3(0.75, -0.45, 0.35), v3(0.45, -0.05, 1), v3(-0.35, 0.3, 0.9), v3(-0.9, 0.45, 0.1)], reach: [0.85, 1], twist: [0.55, -0.7], windup: 0.3, strike: 0.16 },
  // Heavy: a big cleave from over the right shoulder down through the target.
  heavy: { path: [v3(-0.35, 1, -0.65), v3(-0.2, 0.85, 0.65), v3(0.1, -0.1, 1), v3(0.45, -0.85, 0.45)], reach: [0.65, 1], twist: [-1.0, 0.7], windup: 0.44, strike: 0.15 },
};
// Normalised time of the blade passing through the middle of its arc.
export const cutImpact = (c) => c.windup + c.strike * 0.5;

const smooth = (t) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _inv = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();

// Rotate a bone by a world-space rotation q (keeps everything below it attached).
export function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_pq);
  _inv.copy(_pq).invert();
  bone.quaternion.premultiply(_inv.multiply(q).multiply(_pq));
  bone.updateMatrixWorld(true);
}
function aim(bone, from, to) {
  _q.setFromUnitVectors(from, to);
  rotateWorld(bone, _q);
}

export class SwordArm {
  constructor(actor, weapon) {
    this.actor = actor;
    this.weapon = weapon;
    const b = {};
    actor.model.root.traverse((o) => { if (o.isBone) b[o.name] = o; });
    this.ok = !!(b.R_Upperarm && b.R_Forearm && b.R_Hand && b.Spine01 && b.Spine02);
    this.b = b;
    this.curves = {};
    for (const [k, c] of Object.entries(CUTS)) this.curves[k] = new THREE.CatmullRomCurve3(c.path.map((p) => p.clone().normalize()), false, 'centripetal');
    this.trail = new Trail(actor.game.scene);
  }

  // k: 0..1 through the attack state. Call after the mixer has posed the skeleton.
  apply(kind, k, dt) {
    this.trail.update(dt);
    if (!this.ok || !kind) return;
    const C = CUTS[kind], curve = this.curves[kind];
    const end = C.windup + C.strike;
    // Weight: ease in over the wind-up, hold through the strike, ease out over the recovery.
    const w = k < C.windup ? smooth(Math.min(1, k / (C.windup * 0.8))) : k < end + 0.08 ? 1 : 1 - smooth(Math.min(1, (k - end - 0.08) / Math.max(0.01, 0.95 - end - 0.08)));
    if (w <= 0.001) return;
    // Progress along the arc: hold at the start during the wind-up, then a fast eased sweep.
    const u = k < C.windup ? 0 : k < end ? 1 - Math.pow(1 - (k - C.windup) / C.strike, 2.2) : 1;
    const root = this.actor.root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const { R_Upperarm: up, R_Forearm: fo, R_Hand: hand, Spine01, Spine02 } = this.b;

    // Torso twist.
    const tw = THREE.MathUtils.lerp(C.twist[0], C.twist[1], u) * w;
    _q.setFromAxisAngle(UP, tw * 0.5); rotateWorld(Spine01, _q);
    _q.setFromAxisAngle(UP, tw * 0.5); rotateWorld(Spine02, _q);

    // Target for the hand: a direction from the shoulder, blended with the animated pose.
    up.getWorldPosition(_a); fo.getWorldPosition(_b); hand.getWorldPosition(_c);
    const lenA = _a.distanceTo(_b), lenB = _b.distanceTo(_c), reach = lenA + lenB;
    const dir = curve.getPoint(u).normalize().applyQuaternion(rq);
    const r = THREE.MathUtils.lerp(C.reach[0], C.reach[1], u) * reach * 0.98;
    _t.copy(_a).addScaledVector(dir, r);
    _t.lerpVectors(_c, _t, w);

    // Two-bone IK: elbow out to the side and down.
    const d = Math.min(Math.max(_a.distanceTo(_t), Math.abs(lenA - lenB) + 1e-3), reach - 1e-3);
    const toT = _t.clone().sub(_a).normalize();
    const pole = v3(-0.6, -0.8, -0.2).applyQuaternion(rq);
    const pn = pole.addScaledVector(toT, -pole.dot(toT)).normalize();
    const cosA = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = _a.clone().addScaledVector(toT, lenA * cosA).addScaledVector(pn, lenA * sinA);
    aim(up, _b.clone().sub(_a).normalize(), elbow.sub(_a).normalize());
    fo.getWorldPosition(_b); hand.getWorldPosition(_c);
    aim(fo, _c.clone().sub(_b).normalize(), _t.clone().sub(_b).normalize());

    // Blade along the arm, leaning into the direction of the swing.
    if (this.weapon) {
      const tan = curve.getTangent(Math.min(0.999, Math.max(0.001, u))).applyQuaternion(rq);
      const want = dir.clone().addScaledVector(tan, u > 0 && u < 1 ? 0.6 : 0.25).normalize();
      this.weapon.updateMatrixWorld(true);
      const cur = UP.clone().applyQuaternion(this.weapon.getWorldQuaternion(new THREE.Quaternion())).normalize();
      _q.setFromUnitVectors(cur, want);
      _q.slerp(new THREE.Quaternion(), 1 - w);
      rotateWorld(hand, _q);
      // Trail while the blade is moving fast.
      if (k > C.windup && k < end + 0.03) {
        this.weapon.updateMatrixWorld(true);
        this.trail.push(this.weapon.localToWorld(v3(0, 0.6, 0)), this.weapon.localToWorld(v3(0, 1.05, 0)));
      }
    }
  }
}

// A fading ribbon between the blade's base and tip.
class Trail {
  constructor(scene, n = 28) {
    this.n = n;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  push(base, tip) { this.pts.unshift({ base, tip, age: 0 }); if (this.pts.length > this.n) this.pts.pop(); }
  update(dt) {
    for (const p of this.pts) p.age += dt;
    this.pts = this.pts.filter((p) => p.age < 0.16);
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      if (!p) { pos.setXYZ(i * 2, 0, -999, 0); pos.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      const f = Math.pow(Math.max(0, 1 - p.age / 0.16), 1.5) * Math.pow(1 - i / this.n, 2) * 0.22;
      pos.setXYZ(i * 2, p.base.x, p.base.y, p.base.z);
      pos.setXYZ(i * 2 + 1, p.tip.x, p.tip.y, p.tip.z);
      col.setXYZ(i * 2, 0, 0, 0);
      col.setXYZ(i * 2 + 1, 0.9 * f, 0.78 * f, 0.7 * f);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
