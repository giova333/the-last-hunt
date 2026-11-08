import * as THREE from 'three';

// Procedural sword cuts layered over a lunge stance.
// Tripo's only slash preset is an overhead chop, so the hunter's cuts are driven here, full body:
//  - legs: a wide stride frozen from the run clip (set up by the Player),
//  - hips drop and the spine leans into the blow, the torso twists through the arc,
//  - the head counter-rotates to keep the eyes on the target,
//  - right arm: two-bone IK along an arc (anticipation hold → fast strike → follow-through),
//  - left arm: counterbalance (reaches toward the target on the wind-up, pulls back on the cut),
//  - the blade is aligned with the swing and leaves a trail.
// Paths are directions from the shoulder in the actor's frame (x = left, y = up, z = forward).
// The last path point is the follow-through, reached while the blade decelerates.

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const CUTS = {
  // Forehand: high right → down through the target → low left.
  fore: {
    path: [v3(-0.6, 0.75, -0.5), v3(-0.5, 0.5, 0.75), v3(0.2, -0.05, 1), v3(0.8, -0.5, 0.4), v3(0.85, -0.7, -0.15)],
    reach: [0.72, 1], twist: [-0.8, 0.65], lean: [-0.06, 0.2], drop: 0.1, windup: 0.32, strike: 0.16,
  },
  // Backhand: low left → up across → high right.
  back: {
    path: [v3(0.8, -0.45, 0.25), v3(0.5, -0.05, 1), v3(-0.3, 0.3, 0.95), v3(-0.9, 0.5, 0.15), v3(-0.85, 0.75, -0.35)],
    reach: [0.85, 1], twist: [0.65, -0.75], lean: [0.12, 0.18], drop: 0.06, windup: 0.25, strike: 0.16,
  },
  // Sweep (combo finisher): a wide horizontal cut at chest height with a big turn.
  sweep: {
    path: [v3(-0.95, 0.2, -0.25), v3(-0.6, 0.08, 0.85), v3(0.35, 0.02, 1), v3(0.95, 0, 0.25), v3(0.75, -0.1, -0.6)],
    reach: [0.8, 1], twist: [-1.15, 1.0], lean: [0.0, 0.22], drop: 0.14, windup: 0.34, strike: 0.18,
  },
  // Heavy: a big cleave from over the right shoulder down through the target.
  heavy: {
    path: [v3(-0.3, 1, -0.7), v3(-0.2, 0.85, 0.6), v3(0.1, -0.1, 1), v3(0.4, -0.85, 0.45), v3(0.45, -0.95, -0.1)],
    reach: [0.65, 1], twist: [-1.05, 0.75], lean: [-0.15, 0.32], drop: 0.2, windup: 0.43, strike: 0.15,
  },
};
// Normalised time of the blade passing through the middle of its arc.
export const cutImpact = (c) => c.windup + c.strike * 0.5;

export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0);
const STRIKE_U = 0.78;       // share of the path covered by the fast strike; the rest is follow-through
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _inv = new THREE.Quaternion();

// Rotate a bone by a world-space rotation q (keeps everything below it attached).
export function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_pq);
  _inv.copy(_pq).invert();
  bone.quaternion.premultiply(_inv.multiply(q).multiply(_pq));
  bone.updateMatrixWorld(true);
}
const _id = new THREE.Quaternion();
function aim(bone, from, to, wt = 1) {
  _q.setFromUnitVectors(from, to);
  if (wt < 1) _q.slerp(_id, 1 - wt);
  rotateWorld(bone, _q);
}

// Analytic two-bone IK: put `hand` at `target`, bending the elbow toward `pole` (world dir).
// `wt` blends the solved rotations in from the animated pose (no elbow snap when it starts).
export function twoBoneIK(up, fo, hand, target, pole, wt = 1) {
  const a = up.getWorldPosition(new THREE.Vector3()), b = fo.getWorldPosition(new THREE.Vector3()), c = hand.getWorldPosition(new THREE.Vector3());
  const lenA = a.distanceTo(b), lenB = b.distanceTo(c), reach = lenA + lenB;
  const d = Math.min(Math.max(a.distanceTo(target), Math.abs(lenA - lenB) + 1e-3), reach - 1e-3);
  const toT = target.clone().sub(a).normalize();
  const pn = pole.clone().addScaledVector(toT, -pole.dot(toT));
  if (pn.lengthSq() < 1e-6) pn.set(0, -1, 0).addScaledVector(toT, toT.y);   // pole along the arm: fall back to down
  pn.normalize();
  const cosA = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
  const elbow = a.clone().addScaledVector(toT, lenA * cosA).addScaledVector(pn, lenA * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  aim(up, b.clone().sub(a).normalize(), elbow.sub(a).normalize(), wt);
  fo.getWorldPosition(b); hand.getWorldPosition(c);
  aim(fo, c.clone().sub(b).normalize(), target.clone().sub(b).normalize(), wt);
  return reach;
}

// Two-bone arm IK that is stable frame to frame: each solve starts from the previous frame's
// solution (small, well-conditioned rotations, no flips or forearm spin), and the result is
// blended with the animated pose by weight.
// Slerp that never switches to the "other way round": with q and -q kept continuous over time,
// the blend is continuous even when the two poses are ~180° apart (three's slerp would flip there).
function slerpContinuous(out, a, b, t) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let k0, k1;
  if (Math.abs(cos) > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(Math.max(-1, Math.min(1, cos))), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
  out.set(a.x * k0 + b.x * k1, a.y * k0 + b.y * k1, a.z * k0 + b.z * k1, a.w * k0 + b.w * k1).normalize();
  return out;
}
// Flip q's sign (same rotation) to stay on ref's side, so sequences of quaternions are continuous.
const align = (q, ref) => { if (ref && q.x * ref.x + q.y * ref.y + q.z * ref.z + q.w * ref.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); return q; };

// Set a bone's world rotation so that its local (axisL, hingeL) frame maps onto (axisW, hingeW).
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function setBasis(bone, axisL, hingeL, axisW, hingeW) {
  const frame = (x, h) => { const z = h.clone().addScaledVector(x, -h.dot(x)).normalize(); return [x.clone().normalize(), z.clone().cross(x).normalize(), z]; };
  const [xl, yl, zl] = frame(axisL, hingeL), [xw, yw, zw] = frame(axisW, hingeW);
  _m1.makeBasis(xw, yw, zw).multiply(_m2.makeBasis(xl, yl, zl).transpose());
  const world = new THREE.Quaternion().setFromRotationMatrix(_m1);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

// Two-bone arm IK. The upper arm and forearm get their FULL orientation from the elbow's hinge
// axis (measured once from a bent animated pose and cached on the bones), so there is no
// accumulated roll / skin twist. Falls back to aim-only IK until a hinge is known.
// The hand is oriented incrementally from last frame's solution; the result is blended with
// the animated pose by weight, with a flip-free slerp.
export class ArmIK {
  constructor(up, fo, hand) { this.bones = [up, fo, hand]; this.solved = null; this.prevMix = null; }
  reset() { this.solved = null; this.prevMix = null; }

  learnHinge() {
    const [up, fo, hand] = this.bones;
    const a = up.getWorldPosition(new THREE.Vector3()), e = fo.getWorldPosition(new THREE.Vector3()), h = hand.getWorldPosition(new THREE.Vector3());
    if (!up.userData.axisL) {
      up.userData.axisL = up.worldToLocal(e.clone()).normalize();
      fo.userData.axisL = fo.worldToLocal(h.clone()).normalize();
    }
    const ed = e.clone().sub(a).normalize(), fd = h.clone().sub(e).normalize(), c = ed.clone().cross(fd);
    if (c.length() < 0.35 || up.userData.hingeL) return;            // need an elbow bent ≥ ~20°
    c.normalize();
    const toLocal = (bone) => c.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    up.userData.hingeL = toLocal(up); fo.userData.hingeL = toLocal(fo);
  }

  solve(target, pole, w, orient) {
    const bones = this.bones, [up, fo, hand] = bones;
    const mix = bones.map((b) => b.quaternion.clone());
    if (!this.solved) this.learnHinge();   // only between motions: switching solver mid-motion would pop
    // Fresh start: glide the target in from where the hand is.
    if (!this.solved) { this.age = 0; this.start = hand.getWorldPosition(new THREE.Vector3()); }
    let glide = 1;
    if (this.age < 10) { glide = smooth(++this.age / 10); target = this.start.clone().lerp(target, glide); }
    if (up.userData.hingeL) {
      const a = up.getWorldPosition(new THREE.Vector3()), e = fo.getWorldPosition(new THREE.Vector3()), h = hand.getWorldPosition(new THREE.Vector3());
      const lenA = a.distanceTo(e), lenB = e.distanceTo(h), reach = lenA + lenB;
      const toT = target.clone().sub(a).normalize();
      const d = Math.min(Math.max(a.distanceTo(target), Math.abs(lenA - lenB) + 1e-3), reach - 1e-3);
      const pn = pole.clone().addScaledVector(toT, -pole.dot(toT));
      if (pn.lengthSq() < 1e-6) pn.set(0, -1, 0).addScaledVector(toT, toT.y);
      pn.normalize();
      const cosA = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
      const elbow = a.clone().addScaledVector(toT, lenA * cosA).addScaledVector(pn, lenA * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
      const hinge = pn.clone().cross(toT).normalize();                 // bend-plane normal, same sense as learnHinge
      setBasis(up, up.userData.axisL, up.userData.hingeL, elbow.clone().sub(a), hinge);
      const goal = a.clone().addScaledVector(toT, d);
      setBasis(fo, fo.userData.axisL, fo.userData.hingeL, goal.sub(fo.getWorldPosition(new THREE.Vector3())), hinge);
      if (this.solved) { hand.quaternion.copy(this.solved[2]); hand.updateMatrixWorld(true); }
    } else {
      if (this.solved) { bones.forEach((b, i) => b.quaternion.copy(this.solved[i])); up.updateMatrixWorld(true); }
      twoBoneIK(up, fo, hand, target, pole, 1);
    }
    if (orient) orient(hand, glide);
    const prevSolved = this.solved;
    this.solved = bones.map((b, i) => align(b.quaternion.clone(), prevSolved?.[i]));
    mix.forEach((q, i) => align(q, this.prevMix?.[i]));
    this.prevMix = mix;
    if (w < 1) { bones.forEach((b, i) => slerpContinuous(b.quaternion, mix[i], this.solved[i], w)); up.updateMatrixWorld(true); }
  }
}

// Exponential approach: smooth but responsive (rate ~ 1/time-constant).
export const follow = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class SwordArm {
  constructor(actor, weapon) {
    this.actor = actor;
    this.weapon = weapon;
    const b = {};
    actor.model.root.traverse((o) => { if (o.isBone) b[o.name] = o; });
    this.ok = !!(b.R_Upperarm && b.R_Forearm && b.R_Hand && b.Spine01 && b.Spine02);
    this.left = !!(b.L_Upperarm && b.L_Forearm && b.L_Hand);
    this.b = b;
    this.curves = {};
    for (const [k, c] of Object.entries(CUTS)) this.curves[k] = new THREE.CatmullRomCurve3(c.path.map((p) => p.clone().normalize()), false, 'centripetal');
    this.trail = new Trail(actor.game.scene);
    if (this.ok) this.rIK = new ArmIK(b.R_Upperarm, b.R_Forearm, b.R_Hand);
    if (this.left) this.lIK = new ArmIK(b.L_Upperarm, b.L_Forearm, b.L_Hand);
    this.reset();
  }

  reset() { this.lastKind = null; this.lastK = 0; this.lastW = 0; this.carry = 0; this.fromT = null; this.fromWant = null; this.lastT = null; this.lastWant = null; this.lLocal = null; this.lw = 0; this.tw = 0; this.lean = 0; this.drop = 0; this.rIK?.reset(); this.lIK?.reset(); }

  // Timing for normalised attack time k: weight w, path progress u, strike amount s (0..1..0).
  timing(C, k) {
    const end = C.windup + C.strike, settle = end + 0.14;
    // Ease into the wind-up, hold, then release after the follow-through.
    const w = k < C.windup ? smooth(clamp01(k / (C.windup * 0.75))) : k < settle ? 1 : 1 - smooth(clamp01((k - settle) / Math.max(0.01, 0.97 - settle)));
    let u;
    if (k < C.windup) u = 0;
    else if (k < end) { const t = (k - C.windup) / C.strike; u = STRIKE_U * (t * t * (3 - 2 * t) * 0.7 + t * 0.3); }   // swing accelerates, peaks mid-arc
    else u = STRIKE_U + (1 - STRIKE_U) * (1 - Math.pow(1 - clamp01((k - end) / 0.14), 2));       // decelerating follow-through
    // Anticipation: coil a little further back late in the wind-up, released smoothly by the strike.
    const coil = k < C.windup ? smooth(clamp01((k - C.windup * 0.55) / (C.windup * 0.45))) : 1 - smooth(clamp01((k - C.windup) / (C.strike * 0.45)));
    const s = k < C.windup ? 0 : k < end ? clamp01((k - C.windup) / C.strike) : 1 - smooth(clamp01((k - end) / 0.3));
    return { w, u, s, end, coil };
  }

  // k: 0..1 through the attack state, kind null when idle. Call after the mixer has posed the skeleton.
  apply(kind, k, dt) {
    this.trail.update(dt);
    if (!this.ok) return;
    // Interrupted (roll, hurt, drink…): fade the pose out over ~0.1 s instead of snapping.
    let fadeOut = null;
    if (!kind) {
      if (this.lastKind && this.lastW > 0.03) { fadeOut = this.lastW * Math.exp(-16 * dt); kind = this.lastKind; k = this.lastK; }
      else { this.reset(); return; }
    }
    this.lastKind = kind;
    const C = CUTS[kind], curve = this.curves[kind];
    const T = this.timing(C, k);
    const { u, s, end, coil } = T;
    // A chained attack restarts k at 0: carry the previous weight so the pose never snaps back.
    if (k < this.lastK - 0.05) { this.carry = this.lastW; this.fromT = this.lastT?.clone(); this.fromWant = this.lastWant?.clone(); }
    if (this.lastW === 0) { this.fromT = null; this.fromWant = null; }
    this.lastK = k;
    const w = fadeOut ?? (k < C.windup ? Math.max(T.w, this.carry) : T.w);   // a chained cut stays fully posed
    this.lastW = w;
    const uc = clamp01(u);
    const actor = this.actor, root = actor.root, mr = actor.model.root;
    const B = this.b;
    actor.model.protect([B.Spine01, B.Spine02, B.Head, B.R_Upperarm, B.R_Forearm, B.R_Hand, B.L_Upperarm, B.L_Forearm, B.L_Hand]);

    // Body targets, smoothed so nothing jumps between cuts (time constant ≈ 35 ms).
    const twT = (lerp(C.twist[0], C.twist[1], clamp01(u / STRIKE_U)) + C.twist[0] * 0.18 * coil) * w;
    const leanT = lerp(C.lean[0], C.lean[1], clamp01(u / STRIKE_U)) * w;
    const dropT = C.drop * Math.sin(Math.min(1, s * 1.2) * Math.PI * 0.5) * w;
    this.tw = follow(this.tw, twT, 28, dt);
    this.lean = follow(this.lean, leanT, 28, dt);
    this.drop = follow(this.drop, dropT, 20, dt);
    mr.position.y = -this.drop;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const L = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(rq);
    const { R_Upperarm: up, R_Forearm: fo, R_Hand: hand, Spine01, Spine02, Head } = B;

    // Torso: twist through the arc and lean into the blow; the head stays on the target.
    const left = L(1, 0, 0), tw = this.tw, lean = this.lean;
    _q.setFromAxisAngle(UP, tw * 0.45); rotateWorld(Spine01, _q);
    _q.setFromAxisAngle(left, lean * 0.5); rotateWorld(Spine01, _q);
    _q.setFromAxisAngle(UP, tw * 0.55); rotateWorld(Spine02, _q);
    _q.setFromAxisAngle(left, lean * 0.5); rotateWorld(Spine02, _q);
    if (Head) { _q.setFromAxisAngle(UP, -tw * 0.75); rotateWorld(Head, _q); _q.setFromAxisAngle(left, -lean * 0.95); rotateWorld(Head, _q); }

    // Sword arm along the arc (full-weight target; ArmIK blends with the animation by w).
    const a = up.getWorldPosition(new THREE.Vector3());
    const dir = curve.getPoint(uc).normalize();
    if (coil > 0) dir.add(curve.getTangent(0.001).multiplyScalar(-0.35 * coil)).normalize();   // coil back against the swing
    const reachK = lerp(C.reach[0], C.reach[1], clamp01(u / STRIKE_U)) - (u > STRIKE_U ? (u - STRIKE_U) * 0.6 : 0);
    const armLen = a.distanceTo(fo.getWorldPosition(new THREE.Vector3())) + fo.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
    // Hand target and blade direction in the actor frame (shoulder-relative).
    let localT = dir.clone().multiplyScalar(reachK * armLen * 0.98);
    const tanL = curve.getTangent(Math.min(0.999, Math.max(0.001, uc)));
    let localWant = dir.clone().addScaledVector(tanL, 0.2 + 0.4 * Math.sin(Math.min(1, s) * Math.PI * 0.5)).normalize();
    // Chained cut: travel from where the previous cut ended to this cut's wind-up.
    if (this.fromT) {
      const b = smooth(clamp01(k / (C.windup * 0.85)));
      localT = this.fromT.clone().lerp(localT, b);
      localWant = this.fromWant.clone().lerp(localWant, b).normalize();
    }
    this.lastT = localT; this.lastWant = localWant;
    const target = a.clone().add(localT.clone().applyQuaternion(rq));
    const want = localWant.clone().applyQuaternion(rq);
    const weapon = this.weapon;
    this.rIK.solve(target, L(-0.6, -0.8, -0.2), w, weapon && ((h, glide) => {
      weapon.updateMatrixWorld(true);
      const cur = UP.clone().applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion())).normalize();
      _q.setFromUnitVectors(cur, glide < 1 ? cur.clone().lerp(want, glide).normalize() : want);
      rotateWorld(h, _q);
    }));

    // Left arm counterbalance: reach toward the target while coiling, pull back to the chest on the cut.
    if (this.left) {
      const { L_Upperarm: lu, L_Forearm: lf, L_Hand: lh } = B;
      const la = lu.getWorldPosition(new THREE.Vector3());
      const lArm = la.distanceTo(lf.getWorldPosition(new THREE.Vector3())) + lf.getWorldPosition(new THREE.Vector3()).distanceTo(lh.getWorldPosition(new THREE.Vector3()));
      const reachOut = v3(0.15, 0.05, 1).normalize().multiplyScalar(lArm * 0.85);
      const tuck = v3(0.45, -0.75, -0.35).normalize().multiplyScalar(lArm * 0.62);
      const goal = reachOut.lerp(tuck, smooth(clamp01(u / STRIKE_U)));
      // Smoothed in the actor frame so a chained cut eases the hand back out instead of snapping.
      if (!this.lLocal) this.lLocal = goal.clone();
      this.lLocal.lerp(goal, 1 - Math.exp(-9 * dt));
      const lt = la.clone().add(this.lLocal.clone().applyQuaternion(rq));
      this.lw = follow(this.lw ?? 0, w * (kind === 'back' ? 0.6 : 1), 14, dt);
      this.lIK.solve(lt, L(0.7, -0.7, -0.2), this.lw);
    }

    if (weapon && fadeOut === null && k > C.windup && k < end + 0.06) {
      weapon.updateMatrixWorld(true);
      this.trail.push(weapon.localToWorld(v3(0, 0.55, 0)), weapon.localToWorld(v3(0, 1.08, 0)), a);
    }
  }
}

// A fading ribbon between the blade's base and tip.
export class Trail {
  constructor(scene, n = 64, color = [0.95, 0.8, 0.72], strength = 0.26) {
    this.n = n;
    this.color = color; this.strength = strength;
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
  // Add a blade sample. Between frames the blade moves far, so fill the gap with points
  // swung around the shoulder (pivot): the ribbon follows an arc instead of a chord.
  push(base, tip, pivot) {
    const prev = this.pts[0];
    if (prev && pivot && prev.age < 0.05) {
      const steps = 4;
      const arc = (from, to, t) => {
        const a = from.clone().sub(pivot), b = to.clone().sub(pivot);
        const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
        const len = THREE.MathUtils.lerp(a.length(), b.length(), t);
        return a.normalize().applyQuaternion(new THREE.Quaternion().slerp(q, t)).multiplyScalar(len).add(pivot);
      };
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        this.pts.unshift({ base: arc(prev.base, base, t), tip: arc(prev.tip, tip, t), age: prev.age * (1 - t) });
      }
    }
    this.pts.unshift({ base, tip, age: 0 });
    while (this.pts.length > this.n) this.pts.pop();
  }
  update(dt) {
    for (const p of this.pts) p.age += dt;
    this.pts = this.pts.filter((p) => p.age < 0.18);
    const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      if (!p) { pos.setXYZ(i * 2, 0, -999, 0); pos.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      const f = Math.pow(Math.max(0, 1 - p.age / 0.18), 1.5) * Math.pow(1 - i / this.n, 1.6) * this.strength;
      pos.setXYZ(i * 2, p.base.x, p.base.y, p.base.z);
      pos.setXYZ(i * 2 + 1, p.tip.x, p.tip.y, p.tip.z);
      col.setXYZ(i * 2, 0, 0, 0);
      col.setXYZ(i * 2 + 1, this.color[0] * f, this.color[1] * f, this.color[2] * f);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
