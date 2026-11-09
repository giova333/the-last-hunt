import * as THREE from 'three';
import { rotateWorld, ArmIK } from './swing.js';

// Blood vial drinking: the left hand brings a glowing vial to the mouth, the head tips
// back to drink, then the arm lowers. Two-bone IK on the left arm over the base pose.
// Actor frame: x = left, y = up, z = forward.

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const _q = new THREE.Quaternion();

// Phases (normalised over the heal state). The heal itself lands at ≈0.41.
const RAISE = 0.28, TO_MOUTH = 0.42, DRINK_END = 0.7, LOWER = 0.95;

// Built to match art/refs/vial_concept.png: a round bulb, a long slim neck with a lip, gold wire
// spiralled up the neck, a cork capped with red sealing wax. Procedural (not a Tripo model)
// because the glass must be see-through and the blood a separate mesh that drains.
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
function makeVial() {
  const g = new THREE.Group();
  // Glass (lathe profile, metres).
  const prof = V2([[0, 0], [0.018, 0.002], [0.03, 0.012], [0.036, 0.03], [0.035, 0.048], [0.028, 0.064], [0.016, 0.075], [0.011, 0.085], [0.0105, 0.135], [0.0145, 0.139], [0.0145, 0.144], [0.0105, 0.146], [0, 0.146]]);
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), new THREE.MeshStandardMaterial({ color: 0x9a8080, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));
  // Blood: the inner bulb, filled to just under the shoulder. Origin at the bottom, so
  // scaling y drains it from the top.
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0.003], [0.017, 0.004], [0.028, 0.013], [0.0335, 0.03], [0.033, 0.05], [0, 0.05]]), 16),
    new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xc01010, emissiveIntensity: 2.2, roughness: 0.3 }));
  liquid.renderOrder = -1;   // drawn before the glass around it
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0098, 0.022, 10), new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.95 }));
  cork.position.y = 0.151;
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.014, 0.005, 12), new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.45 }));
  wax.position.y = 0.163;
  // Gold wire: two and a half turns up the neck.
  const helix = new THREE.Curve();
  helix.getPoint = (u, out = new THREE.Vector3()) => out.set(Math.cos(u * Math.PI * 5) * 0.0118, 0.09 + u * 0.046, Math.sin(u * Math.PI * 5) * 0.0118);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(helix, 48, 0.0012, 4), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: 0.35 }));
  g.add(liquid, glass, cork, wax, wire);
  g.liquid = liquid;
  g.light = new THREE.PointLight(0xff2a14, 0, 2.2, 1.6);
  g.light.position.y = 0.05;
  g.add(g.light);
  g.visible = false;
  return g;
}

export class Drink {
  constructor(actor) {
    this.actor = actor;
    const b = {};
    actor.model.root.traverse((o) => { if (o.isBone) b[o.name] = o; });
    this.b = b;
    this.ok = !!(b.L_Upperarm && b.L_Forearm && b.L_Hand && b.Head);
    if (this.ok) this.ik = new ArmIK(b.L_Upperarm, b.L_Forearm, b.L_Hand);
    this.vial = makeVial();
    actor.game.scene.add(this.vial);
  }

  // k: 0..1 through the heal state, or null when not drinking.
  apply(k) {
    const vial = this.vial;
    if (k === null || !this.ok) { vial.visible = false; vial.light.intensity = 0; this.ik?.reset(); return; }
    const { L_Upperarm: up, L_Forearm: fo, L_Hand: hand, Head: head } = this.b;
    this.actor.model.protect([up, fo, hand, head]);
    const root = this.actor.root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const L = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(rq);

    const w = k < RAISE ? smooth(clamp01(k / RAISE)) : k < DRINK_END ? 1 : 1 - smooth(clamp01((k - DRINK_END) / (LOWER - DRINK_END)));
    const toMouth = smooth(clamp01((k - RAISE) / (TO_MOUTH - RAISE))) * (1 - smooth(clamp01((k - DRINK_END) / 0.15)));
    const tip = smooth(clamp01((k - TO_MOUTH + 0.04) / 0.1)) * (1 - smooth(clamp01((k - DRINK_END + 0.04) / 0.12)));

    // Head tips back while drinking.
    if (tip > 0) {
      _q.setFromAxisAngle(L(1, 0, 0), -0.45 * tip);
      rotateWorld(head, _q);
    }
    const hp = head.getWorldPosition(new THREE.Vector3());
    const chest = hp.clone().add(L(0.06, -0.42, 0.32));
    const mouth = hp.clone().add(L(0.0, -0.1, 0.16 - 0.04 * tip));
    const target = chest.lerp(mouth, toMouth);

    // Two-bone IK, elbow out to the left and down (blended in by w).
    this.ik.solve(target, L(0.7, -0.7, -0.1), w);

    // The vial sits in the hand: upright while raised, neck to the lips (bottom up) while drinking.
    hand.getWorldPosition(vial.position);
    const axis = L(0, 1, 0.15).normalize().lerp(L(0, -0.35, -1).normalize(), tip).normalize();
    vial.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    vial.position.addScaledVector(axis, -0.04);
    vial.visible = w > 0.05;
    vial.scale.setScalar(1.35 * Math.min(1, w * 1.5));
    // The blood glows brightest as it is drunk, then the vial empties.
    vial.light.intensity = 1.0 * w + 2.2 * tip;
    vial.liquid.scale.y = k < DRINK_END ? 1 : Math.max(0.12, 1 - (k - DRINK_END) * 4);
    vial.liquid.material.emissiveIntensity = 2.2 + 3 * tip;
  }
}
