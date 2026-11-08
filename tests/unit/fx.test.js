import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FX } from '../../src/fx.js';

const at = new THREE.Vector3(0, 1, 0);

describe('FX particle ring', () => {
  it('counts live particles and lets them expire', () => {
    const fx = new FX(new THREE.Scene(), { max: 100 });
    fx.emit(10, at, { life: 0.5 });
    fx.update(0.01);
    expect(fx.alive).toBe(10);
    for (let i = 0; i < 100; i++) fx.update(0.05);
    expect(fx.alive).toBe(0);
  });
  it('never grows past its cap; overflow reuses the oldest slots', () => {
    const fx = new FX(new THREE.Scene(), { max: 50 });
    fx.emit(180, at, { life: 5 });
    expect(fx.p.length).toBe(50);
    expect(fx.head).toBe(180 % 50);
    fx.update(0.01);
    expect(fx.alive).toBe(50);
  });
  it('hides dead slots by giving them zero size', () => {
    const fx = new FX(new THREE.Scene(), { max: 20 });
    fx.emit(5, at, { life: 0.1 });
    fx.update(0.01);
    expect(Array.from(fx.size).filter((s) => s > 0).length).toBe(5);
    fx.update(1);
    expect(Array.from(fx.size).every((s) => s === 0)).toBe(true);
  });
  it('keeps particles above the floor', () => {
    const fx = new FX(new THREE.Scene(), { max: 30 });
    fx.heightAt = () => 0.5;
    fx.emit(30, new THREE.Vector3(0, 0.6, 0), { life: 3, gravity: 30, up: 0 });
    for (let i = 0; i < 60; i++) fx.update(0.02);
    for (const q of fx.p) if (q.life > 0) expect(q.y).toBeGreaterThanOrEqual(0.5);
  });
});

describe('FX blood decals', () => {
  it('caps decals, removes the oldest from the scene and frees its geometry', () => {
    const scene = new THREE.Scene();
    const fx = new FX(scene, { max: 10, maxDecals: 5 });
    const first = [];
    for (let i = 0; i < 12; i++) { fx.splat(i, 0, 0.3); if (i < 7) first.push(fx.decals.at(-1)); }
    expect(fx.decals.length).toBe(5);
    const decalsInScene = scene.children.filter((c) => c.isMesh);
    expect(decalsInScene.length).toBe(5);
    let disposed = 0;
    const g = new THREE.CircleGeometry(1, 4); g.addEventListener('dispose', () => disposed++);
    fx.decals[0].geometry = g; // the next splat evicts this one
    fx.splat(0, 0, 0.3);
    expect(disposed).toBe(1);
    expect(scene.children.includes(first[0])).toBe(false);
  });
});
