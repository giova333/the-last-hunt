import { describe, it, expect } from 'vitest';
import { upgradeCost, upgradeRows, buyUpgrade, dropEchoes, MAX_VIALS } from '../../src/progress.js';

const hunter = (o = {}) => ({ echoes: 0, level: 1, maxHp: 120, maxStamina: 100, dmgMul: 1, maxVials: 4, ...o });

describe('upgrades', () => {
  it('prices rise with every upgrade bought', () => {
    expect(upgradeCost(1)).toBe(300);
    expect(upgradeCost(2)).toBeGreaterThan(upgradeCost(1));
  });

  it('buying spends echoes, raises the level and applies the stat', () => {
    const p = hunter({ echoes: 1000 });
    expect(buyUpgrade(p, 'vit')).toBe(true);
    expect(p).toMatchObject({ echoes: 700, level: 2, maxHp: 135 });
    expect(buyUpgrade(p, 'str')).toBe(true);
    expect(p.dmgMul).toBeCloseTo(1.08);
  });

  it('refuses when the hunter cannot afford it, changing nothing', () => {
    const p = hunter({ echoes: 299 });
    expect(buyUpgrade(p, 'end')).toBe(false);
    expect(p).toMatchObject({ echoes: 299, level: 1, maxStamina: 100 });
  });

  it('caps blood vials and shows the row as at its limit', () => {
    const p = hunter({ echoes: 99999, maxVials: MAX_VIALS });
    expect(buyUpgrade(p, 'vial')).toBe(false);
    const row = upgradeRows(p).find((r) => r.key === 'vial');
    expect(row).toMatchObject({ can: false, desc: 'at its limit' });
  });
});

describe('bloodstain', () => {
  it('leaves every echo at the place of death', () => {
    const p = hunter({ echoes: 420 });
    expect(dropEchoes(p, { x: 1, y: 0, z: 2 })).toEqual({ x: 1, y: 0, z: 2, echoes: 420 });
    expect(p.echoes).toBe(0);
  });

  it('leaves nothing when the hunter carried nothing', () => {
    expect(dropEchoes(hunter(), { x: 0, y: 0, z: 0 })).toBeNull();
  });
});
