// Blood echoes: what the hunter spends at a lantern, and what he leaves behind when he dies.
// Pure rules (no rendering), so they are unit-tested in tests/unit/progress.test.js.

export const MAX_VIALS = 6;

// Seers pay 140 and the Hound 5,000: the first upgrade comes after three kills, and a full
// clear of the Ward (8 Seers) buys about three.
export const upgradeCost = (level) => 300 + 120 * (level - 1);

export const UPGRADES = [
  { key: 'vit', label: 'Vitality', desc: '+15 health', apply: (p) => { p.maxHp += 15; } },
  { key: 'end', label: 'Endurance', desc: '+10 stamina', apply: (p) => { p.maxStamina += 10; } },
  { key: 'str', label: 'Strength', desc: '+8% damage', apply: (p) => { p.dmgMul = +(p.dmgMul + 0.08).toFixed(2); } },
  { key: 'vial', label: 'Blood Vial', desc: '+1 vial', apply: (p) => { p.maxVials += 1; }, maxed: (p) => p.maxVials >= MAX_VIALS },
];

// The menu rows for the current state of the hunter.
export function upgradeRows(p) {
  const cost = upgradeCost(p.level);
  return UPGRADES.map((u) => {
    const maxed = !!u.maxed?.(p);
    return { key: u.key, label: u.label, desc: maxed ? 'at its limit' : u.desc, cost, can: !maxed && p.echoes >= cost };
  });
}

// Buy one upgrade; false (and no change) when it is unaffordable or at its limit.
export function buyUpgrade(p, key) {
  const u = UPGRADES.find((x) => x.key === key);
  const cost = upgradeCost(p.level);
  if (!u || u.maxed?.(p) || p.echoes < cost) return false;
  p.echoes -= cost;
  p.level += 1;
  u.apply(p);
  return true;
}

// Death: every echo stays where the hunter fell. An older, unclaimed stain is lost for good.
export function dropEchoes(p, at) {
  if (p.echoes <= 0) return null;
  const stain = { x: at.x, y: at.y, z: at.z, echoes: p.echoes };
  p.echoes = 0;
  return stain;
}
