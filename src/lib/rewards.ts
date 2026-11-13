export type Res = { gold: number; wood: number; stone: number; renown: number };
export const ZERO: Res = { gold: 0, wood: 0, stone: 0, renown: 0 };
export const RES_KEYS = ['gold', 'wood', 'stone', 'renown'] as const;

/** Gold per minute rises with continuous verified study time. */
export const GOLD_TIERS = [
  { upTo: 25, rate: 10 },
  { upTo: 50, rate: 15 },
  { upTo: 75, rate: 20 },
  { upTo: 100, rate: 25 },
  { upTo: Infinity, rate: 30 },
];

/** Proportional per-verified-minute rates (configurable). */
export const RATES = { wood: 4, stone: 2, renown: 0.25 };

export function goldForMinutes(min: number): number {
  let total = 0, prev = 0;
  for (const t of GOLD_TIERS) {
    if (min <= prev) break;
    total += (Math.min(min, t.upTo) - prev) * t.rate;
    prev = t.upTo;
  }
  return total;
}

export function currentRate(min: number): number {
  return (GOLD_TIERS.find((t) => min < t.upTo) ?? GOLD_TIERS[GOLD_TIERS.length - 1]).rate;
}

/** Rewards for a list of uninterrupted chains (minutes). */
export function rewardsForChains(chainsMin: number[]): Res {
  const total = chainsMin.reduce((a, b) => a + b, 0);
  return {
    gold: chainsMin.reduce((a, m) => a + goldForMinutes(m), 0),
    wood: Math.floor(total * RATES.wood),
    stone: Math.floor(total * RATES.stone),
    renown: Math.floor(total * RATES.renown),
  };
}

export const add = (a: Res, b: Res, k = 1): Res => ({
  gold: a.gold + b.gold * k, wood: a.wood + b.wood * k, stone: a.stone + b.stone * k, renown: a.renown + b.renown * k,
});
export const canAfford = (have: Res, cost: Partial<Res>, n = 1) =>
  RES_KEYS.every((k) => have[k] >= (cost[k] ?? 0) * n);
export const full = (c: Partial<Res>): Res => ({ ...ZERO, ...c });
