import * as THREE from 'three';
import { rotateWorld } from './swing.js';

// Blood vial drinking: the left hand brings a glowing vial to the mouth, the head tips
// back to drink, then the arm lowers. Two-bone IK on the left arm over the base pose.
// Actor frame: x = left, y = up, z = forward.

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const _q = new THREE.Quaternion();

// Phases (normalised over the heal state). The heal itself lands at ≈0.41.
const RAISE = 0.28, TO_MOUTH = 0.42, DRINK_END = 0.7, LOWER = 0.95;

function makeVial() {
  const g = new THREE.Group();
  // Flask: round body + slim neck (lathe profile, metres).
  const prof = [[0, 0], [0.028, 0.004], [0.04, 0.03], [0.04, 0.06], [0.026, 0.09], [0.012, 0.105], [0.011, 0.14], [0.015, 0.145], [0.0, 0.145]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), new THREE.MeshStandardMaterial({ color: 0x5a3030, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }));
  const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xc01010, emissiveIntensity: 2.2, roughness: 0.3 }));
  liquid.position.y = 0.045;
  liquid.scale.y = 0.9;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.01, 0.022, 8), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 }));
  cork.position.y = 0.152;
  g.add(glass, liquid, cork);
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
    this.vial = makeVial();
    actor.game.scene.add(this.vial);
  }

  // k: 0..1 through the heal state, or null when not drinking.
  apply(k) {
    const vial = this.vial;
    if (k === null || !this.ok) { vial.visible = false; vial.light.intensity = 0; return; }
    const { L_Upperarm: up, L_Forearm: fo, L_Hand: hand, Head: head } = this.b;
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
    const a = up.getWorldPosition(new THREE.Vector3()), b0 = fo.getWorldPosition(new THREE.Vector3()), c0 = hand.getWorldPosition(new THREE.Vector3());
    const target = chest.lerp(mouth, toMouth);
    target.lerpVectors(c0, target, w);

    // Two-bone IK, elbow out to the left and down.
    const lenA = a.distanceTo(b0), lenB = b0.distanceTo(c0), reach = lenA + lenB;
    const d = Math.min(Math.max(a.distanceTo(target), Math.abs(lenA - lenB) + 1e-3), reach - 1e-3);
    const toT = target.clone().sub(a).normalize();
    const pole = L(0.7, -0.7, -0.1);
    const pn = pole.addScaledVector(toT, -pole.dot(toT)).normalize();
    const cosA = (lenA * lenA + d * d - lenB * lenB) / (2 * lenA * d);
    const elbow = a.clone().addScaledVector(toT, lenA * cosA).addScaledVector(pn, lenA * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
    _q.setFromUnitVectors(b0.clone().sub(a).normalize(), elbow.sub(a).normalize()); rotateWorld(up, _q);
    const b1 = fo.getWorldPosition(new THREE.Vector3()), c1 = hand.getWorldPosition(new THREE.Vector3());
    _q.setFromUnitVectors(c1.clone().sub(b1).normalize(), target.clone().sub(b1).normalize()); rotateWorld(fo, _q);

    // The vial sits in the hand: upright while raised, neck to the lips (bottom up) while drinking.
    hand.getWorldPosition(vial.position);
    const axis = L(0, 1, 0.15).normalize().lerp(L(0, -0.35, -1).normalize(), tip).normalize();
    vial.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    vial.position.addScaledVector(axis, -0.04);
    vial.visible = w > 0.05;
    vial.scale.setScalar(1.35 * Math.min(1, w * 1.5));
    // The blood glows brightest as it is drunk, then the vial empties.
    vial.light.intensity = 1.0 * w + 2.2 * tip;
    vial.liquid.scale.setScalar(k < DRINK_END ? 1 : Math.max(0.15, 1 - (k - DRINK_END) * 4));
    vial.liquid.material.emissiveIntensity = 2.2 + 3 * tip;
  }
}
