export type Res = { gold: number; wood: number; stone: number; renown: number };
export const RES_KEYS = ['gold', 'wood', 'stone', 'renown'] as const;
export const ZERO: Res = { gold: 0, wood: 0, stone: 0, renown: 0 };

/** Base reward per verified study minute (configurable in settings). Strictly proportional. */
export const DEFAULT_RATES: Res = { gold: 10, wood: 5, stone: 3, renown: 1 };
/** Manually logged minutes earn this fraction of the timed rate. */
export const MANUAL_FACTOR = 0.5;
export const MANUAL_MAX_PER_DAY_MIN = 480;

export type Mult = Res; // multipliers per resource, 1 = none

/** Focus growth: each continuous minute pays 1% more than the last, up to 3x (reached after ~110 minutes). */
export const FOCUS_GROWTH = 1.01, FOCUS_CAP = 3;
const CAP_MIN = Math.log(FOCUS_CAP) / Math.log(FOCUS_GROWTH);
/** Pay multiplier for the minute you are studying right now. */
export const focusMultiplier = (min: number) => Math.min(FOCUS_CAP, FOCUS_GROWTH ** Math.max(0, min));
/** Reward-weighted minutes: the integral of the focus multiplier over a session (always increasing). */
export function focusMinutes(min: number) {
  const m = Math.max(0, min), L = Math.log(FOCUS_GROWTH);
  return m <= CAP_MIN ? (FOCUS_GROWTH ** m - 1) / L : (FOCUS_CAP - 1) / L + (m - CAP_MIN) * FOCUS_CAP;
}
/** Reward for a verified duration. Grows exponentially with session length; floors only the final units. */
export function studyReward(ms: number, rates: Res = DEFAULT_RATES, mult: Mult = { gold: 1, wood: 1, stone: 1, renown: 1 }, factor = 1): Res {
  const fm = focusMinutes(Math.max(0, ms) / 60000);
  const f = (k: keyof Res) => Math.floor(fm * rates[k] * mult[k] * factor + 1e-9);
  return { gold: f('gold'), wood: f('wood'), stone: f('stone'), renown: f('renown') };
}

/** Most a verified minute may pay, as enforced by the cloud database (migration 0004); manual minutes count half.
 *  LEGACY is the ceiling of databases that have not re-run setup.sql since rewards became exponential. */
export const REWARD_CEILING: Res = { gold: 100, wood: 50, stone: 30, renown: 12 };
export const LEGACY_CEILING: Res = { gold: 40, wood: 15, stone: 9, renown: 4 };
/** The most a session with this many verified seconds may be paid under a ceiling. */
export function ceilingFor(verifiedSec: number, manual: boolean, c: Res = REWARD_CEILING): Res {
  const m = Math.max(0, Math.floor(verifiedSec)) / 60 * (manual ? 0.5 : 1);
  return { gold: Math.floor(m * c.gold), wood: Math.floor(m * c.wood), stone: Math.floor(m * c.stone), renown: Math.floor(m * c.renown) };
}
export const minRes = (a: Res, b: Res): Res => ({ gold: Math.min(a.gold, b.gold), wood: Math.min(a.wood, b.wood), stone: Math.min(a.stone, b.stone), renown: Math.min(a.renown, b.renown) });
export const fitsCeiling = (amt: Res, verifiedSec: number, manual: boolean, c: Res = REWARD_CEILING) => { const cap = ceilingFor(verifiedSec, manual, c); return amt.gold <= cap.gold + 1 && amt.wood <= cap.wood + 1 && amt.stone <= cap.stone + 1 && amt.renown <= cap.renown + 1; };

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
