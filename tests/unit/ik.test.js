import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { twoBoneIK } from '../../src/swing.js';

// A straight arm along +x: shoulder at the origin, elbow at 1, hand at 2.
function arm() {
  const root = new THREE.Object3D();
  const up = new THREE.Object3D(); root.add(up);
  const fo = new THREE.Object3D(); fo.position.set(1, 0, 0); up.add(fo);
  const hand = new THREE.Object3D(); hand.position.set(1, 0, 0); fo.add(hand);
  root.updateMatrixWorld(true);
  return { up, fo, hand };
}
const world = (o) => o.getWorldPosition(new THREE.Vector3());
const down = new THREE.Vector3(0, -1, 0);

describe('twoBoneIK', () => {
  it('puts the hand on a reachable target', () => {
    const { up, fo, hand } = arm();
    const target = new THREE.Vector3(0.8, 0.6, 0.9);
    const reach = twoBoneIK(up, fo, hand, target, down);
    expect(reach).toBeCloseTo(2);
    expect(world(hand).distanceTo(target)).toBeLessThan(1e-3);
  });
  it('keeps bone lengths', () => {
    const { up, fo, hand } = arm();
    twoBoneIK(up, fo, hand, new THREE.Vector3(-0.5, 1.1, 0.4), down);
    expect(world(up).distanceTo(world(fo))).toBeCloseTo(1);
    expect(world(fo).distanceTo(world(hand))).toBeCloseTo(1);
  });
  it('bends the elbow toward the pole', () => {
    const { up, fo, hand } = arm();
    twoBoneIK(up, fo, hand, new THREE.Vector3(1.2, 0, 0), down);
    expect(world(fo).y).toBeLessThan(0);
  });
  it('reaches straight toward an out-of-range target without NaNs', () => {
    const { up, fo, hand } = arm();
    const target = new THREE.Vector3(0, 0, 10);
    twoBoneIK(up, fo, hand, target, down);
    const h = world(hand);
    expect(Number.isFinite(h.x + h.y + h.z)).toBe(true);
    expect(h.clone().normalize().z).toBeGreaterThan(0.99);
  });
  it('survives a pole that points along the arm', () => {
    const { up, fo, hand } = arm();
    const target = new THREE.Vector3(1.5, 0, 0);
    twoBoneIK(up, fo, hand, target, new THREE.Vector3(1, 0, 0));
    expect(world(hand).distanceTo(target)).toBeLessThan(1e-3);
  });
});
