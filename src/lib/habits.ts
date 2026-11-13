import type { Res } from './rewards.ts';

export type Freq = 'daily' | 'weekly';
export interface Habit { id: string; name: string; freq: Freq; reward: Res; done: string[]; created: number; best: number }

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function weekKey(d0: Date) {
  const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const wk = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${pad(wk)}`;
}
export const periodKey = (h: Pick<Habit, 'freq'>, d: Date) => (h.freq === 'daily' ? dayKey(d) : weekKey(d));
export const claimedNow = (h: Habit, d: Date) => h.done.includes(periodKey(h, d));

/** Current streak; an unfinished current period never breaks it (no rest-day punishment). */
export function streak(h: Habit, now: Date): number {
  const step = h.freq === 'daily' ? 1 : 7;
  const d = new Date(now);
  if (!claimedNow(h, d)) d.setDate(d.getDate() - step);
  let n = 0;
  while (h.done.includes(periodKey(h, d))) { n++; d.setDate(d.getDate() - step); }
  return n;
}

/** Returns updated habit or null if already claimed this period. */
export function claim(h: Habit, now: Date): Habit | null {
  if (claimedNow(h, now)) return null;
  const next = { ...h, done: [...h.done, periodKey(h, now)] };
  next.best = Math.max(h.best, streak(next, now));
  return next;
}

/** Streak bonus multiplier: +10% per streak period, capped at +100%. */
export const streakBonus = (s: number) => 1 + Math.min(s, 10) * 0.1;
