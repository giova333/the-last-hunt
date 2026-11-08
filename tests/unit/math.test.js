import { describe, it, expect } from 'vitest';
import { angleDiff, lerpAngle } from '../../src/actor.js';
import { smooth, clamp01, follow, cutImpact, CUTS } from '../../src/swing.js';
import { CLAW, clawImpact } from '../../src/claws.js';

const PI = Math.PI;

describe('angleDiff', () => {
  it('returns the plain difference for small angles', () => {
    expect(angleDiff(0.5, 0.2)).toBeCloseTo(0.3);
    expect(angleDiff(0.2, 0.5)).toBeCloseTo(-0.3);
  });
  it('takes the short way round across the ±π seam', () => {
    // 170° to -170° is 20°, not 340°.
    expect(angleDiff(-170 * PI / 180, 170 * PI / 180)).toBeCloseTo(20 * PI / 180);
    expect(angleDiff(170 * PI / 180, -170 * PI / 180)).toBeCloseTo(-20 * PI / 180);
  });
  it('ignores whole turns', () => {
    expect(angleDiff(0.3 + 4 * PI, 0)).toBeCloseTo(0.3);
  });
  it('always lies in [-π, π]', () => {
    for (let a = -10; a <= 10; a += 0.37) for (let b = -10; b <= 10; b += 0.41) {
      const d = angleDiff(a, b);
      expect(Math.abs(d)).toBeLessThanOrEqual(PI + 1e-9);
    }
  });
});

describe('lerpAngle', () => {
  it('hits both endpoints', () => {
    expect(lerpAngle(1, 2, 0)).toBeCloseTo(1);
    expect(lerpAngle(1, 2, 1)).toBeCloseTo(2);
  });
  it('turns through the seam instead of spinning the long way', () => {
    const a = 170 * PI / 180, b = -170 * PI / 180;
    const mid = lerpAngle(a, b, 0.5);
    // Halfway is 180°, i.e. ±π, not 0°.
    expect(Math.abs(angleDiff(mid, PI))).toBeLessThan(1e-9);
  });
});

describe('smooth / clamp01', () => {
  it('smoothstep has fixed points 0, ½, 1 and is monotonic', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(smooth(1)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.01) { const s = smooth(t); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
  it('clamp01 clamps', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(7)).toBe(1);
  });
});

describe('follow (exponential approach)', () => {
  it('does nothing with dt = 0 and moves toward the target otherwise', () => {
    expect(follow(0, 10, 5, 0)).toBe(0);
    const v = follow(0, 10, 5, 0.016);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
  });
  it('never overshoots, even with a huge dt', () => {
    expect(follow(0, 10, 5, 100)).toBeLessThanOrEqual(10);
    expect(follow(0, 10, 5, 100)).toBeCloseTo(10);
  });
  it('is frame-rate independent: one 1/30 step equals two 1/60 steps', () => {
    const one = follow(0, 1, 8, 1 / 30);
    const two = follow(follow(0, 1, 8, 1 / 60), 1, 8, 1 / 60);
    expect(two).toBeCloseTo(one, 10);
  });
});

describe('attack timings', () => {
  it('every sword cut lands inside its own animation window', () => {
    const names = Object.keys(CUTS);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const c = CUTS[n];
      expect(c.windup, n).toBeGreaterThan(0);
      expect(c.strike, n).toBeGreaterThan(0);
      const hit = cutImpact(c);
      expect(hit, n).toBeGreaterThan(c.windup);
      expect(hit, n).toBeLessThan(c.windup + c.strike);
    }
  });
  it('the claw hit lands during the strike', () => {
    expect(clawImpact).toBeGreaterThan(CLAW.windup);
    expect(clawImpact).toBeLessThan(CLAW.windup + CLAW.strike);
  });
});
