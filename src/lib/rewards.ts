export type Res = { gold: number; wood: number; stone: number; renown: number };
export const RES_KEYS = ['gold', 'wood', 'stone', 'renown'] as const;
export const ZERO: Res = { gold: 0, wood: 0, stone: 0, renown: 0 };

/** Base reward per verified study minute (configurable in settings). Strictly proportional. */
export const DEFAULT_RATES: Res = { gold: 10, wood: 5, stone: 3, renown: 1 };
/** Manually logged minutes earn this fraction of the timed rate. */
export const MANUAL_FACTOR = 0.5;
export const MANUAL_MAX_PER_DAY_MIN = 480;

export type Mult = Res; // multipliers per resource, 1 = none

/** Exact proportional reward for a duration; floors only the final resource units, never minutes. */
export function studyReward(ms: number, rates: Res = DEFAULT_RATES, mult: Mult = { gold: 1, wood: 1, stone: 1, renown: 1 }, factor = 1): Res {
  const min = Math.max(0, ms) / 60000;
  const f = (k: keyof Res) => Math.floor(min * rates[k] * mult[k] * factor + 1e-9);
  return { gold: f('gold'), wood: f('wood'), stone: f('stone'), renown: f('renown') };
}

export const add = (a: Res, b: Partial<Res>, k = 1): Res => ({
  gold: a.gold + (b.gold ?? 0) * k, wood: a.wood + (b.wood ?? 0) * k, stone: a.stone + (b.stone ?? 0) * k, renown: a.renown + (b.renown ?? 0) * k,
});
export const sub = (a: Res, b: Res): Res => add(a, b, -1);
export const scale = (a: Partial<Res>, k: number): Res => ({
  gold: Math.round((a.gold ?? 0) * k), wood: Math.round((a.wood ?? 0) * k), stone: Math.round((a.stone ?? 0) * k), renown: Math.round((a.renown ?? 0) * k),
});
export const maxRes = (a: Res, b: Res): Res => ({ gold: Math.max(a.gold, b.gold), wood: Math.max(a.wood, b.wood), stone: Math.max(a.stone, b.stone), renown: Math.max(a.renown, b.renown) });
export const canAfford = (have: Res, cost: Partial<Res>, n = 1) => RES_KEYS.every((k) => have[k] + 1e-9 >= (cost[k] ?? 0) * n);
export const full = (c: Partial<Res>): Res => ({ ...ZERO, ...c });
export const isZero = (r: Res) => RES_KEYS.every((k) => r[k] === 0);
