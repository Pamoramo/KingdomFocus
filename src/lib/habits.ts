import { type Res, scale } from './rewards.ts';

export type Freq = 'daily' | 'weekly';
export interface Habit {
  id: string; name: string; freq: Freq; target: number; unit: string; weight: number; requireNote: boolean;
  log: Record<string, number>;   // period -> progress count
  done: string[];                // periods completed (rewarded once each)
  created: number; best: number; archived?: boolean; earned: Res;
}
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function weekKey(d0: Date) {
  const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  return `${y}-W${pad(Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7))}`;
}
export const periodKey = (h: Pick<Habit, 'freq'>, d: Date) => (h.freq === 'daily' ? dayKey(d) : weekKey(d));
export const doneNow = (h: Habit, d: Date) => h.done.includes(periodKey(h, d));

/** Streak of consecutive completed periods; the current unfinished period never breaks it. */
export function streak(h: Habit, now: Date): number {
  const step = h.freq === 'daily' ? 1 : 7, d = new Date(now);
  if (!doneNow(h, d)) d.setDate(d.getDate() - step);
  let n = 0;
  while (h.done.includes(periodKey(h, d))) { n++; d.setDate(d.getDate() - step); }
  return n;
}
export const BASE_HABIT: Res = { gold: 40, wood: 20, stone: 10, renown: 4 };
export const WEIGHTS = ['Minor', 'Normal', 'Important', 'Major', 'Vital'];
/** Reward for completing one period. Streaks add up to +50%; weekly habits are worth 4x. */
export function habitReward(h: Habit, streakAfter: number): Res {
  return scale(BASE_HABIT, h.weight * (h.freq === 'weekly' ? 4 : 1) * (1 + Math.min(Math.max(0, streakAfter - 1), 10) * 0.05));
}
export const MILESTONES: [number, number][] = [[7, 25], [30, 100], [100, 400]]; // streak -> bonus renown x weight

/** Adds progress; returns updated habit and whether this completed the period (reward once). */
export function progress(h: Habit, now: Date, amount = 1): { habit: Habit; completed: boolean } | null {
  const k = periodKey(h, now);
  if (h.done.includes(k)) return null;
  const count = Math.min(h.target, (h.log[k] ?? 0) + amount);
  const habit = { ...h, log: { ...h.log, [k]: count } };
  if (count < h.target) return { habit, completed: false };
  habit.done = [...h.done, k];
  habit.best = Math.max(h.best, streak(habit, now));
  return { habit, completed: true };
}
/** Fraction of periods completed over the last n periods (excluding the current, unfinished one). */
export function consistency(h: Habit, now: Date, n = 30): number {
  const step = h.freq === 'daily' ? 1 : 7, d = new Date(now); let hit = 0, total = 0;
  if (doneNow(h, d)) { hit++; total++; }
  for (let i = 0; i < n; i++) { d.setDate(d.getDate() - step); if (d.getTime() < h.created - step * 864e5) break; total++; if (h.done.includes(periodKey(h, d))) hit++; }
  return total ? hit / total : 0;
}
