// Assignments: real coursework with due dates. Finish on time for a reward that grows with the work;
// miss one and the realm pays for it: gold wasted, soldiers lost, or an enemy at the gates.
import { _internal, getState, emit, armySize, type GameState } from './state.ts';
import { awayBats } from './warActions.ts';
import { type Res, scale } from './rewards.ts';
import { dayStr, type WorldState } from './war.ts';
import { uid } from './study.ts';

const { update, ledger, spend, mark, kill, event } = _internal;
export type Size = 'small' | 'medium' | 'large';
export interface Assignment { id: string; title: string; subject: string; due: number; size: Size; created: number; done?: number; missed?: number; penalty?: string; paid?: Res }
export const SIZE: Record<Size, { name: string; example: string; reward: Res; penalty: string }> = {
  small: { name: 'Small', example: 'a worksheet, a short reading', reward: { gold: 120, wood: 40, stone: 20, renown: 10 }, penalty: 'The treasury is mismanaged: you lose a tenth of your gold.' },
  medium: { name: 'Medium', example: 'an essay, a problem set, a lab', reward: { gold: 320, wood: 100, stone: 60, renown: 30 }, penalty: 'Fever sweeps the barracks: some of your soldiers at home die.' },
  large: { name: 'Major', example: 'a project, an exam, a term paper', reward: { gold: 800, wood: 240, stone: 160, renown: 80 }, penalty: 'Your enemies smell weakness: a hostile kingdom besieges your castle.' },
};
export const EARLY_MS = 24 * 3600_000, LATE_MS = 3 * 24 * 3600_000;
/** Reward for an assignment finished at `at`: scaled by stage; +25% a day early; 30% if handed in late. */
export function rewardFor(a: Pick<Assignment, 'size' | 'due'>, stage: number, at = Date.now()): Res {
  const k = (1 + (Math.max(1, stage) - 1) * 0.25) * (at <= a.due - EARLY_MS ? 1.25 : at <= a.due ? 1 : 0.3);
  return scale(SIZE[a.size].reward, k);
}
const list = (s: GameState) => s.world.assignments ?? [];
const W = (s: GameState, w: WorldState): GameState => ({ ...s, world: w });
const put = (s: GameState, f: (l: Assignment[]) => Assignment[]) => W(s, { ...s.world, assignments: f(list(s)).sort((a, b) => a.due - b.due).slice(-120) });

export const addAssignment = (title: string, subject: string, due: number, size: Size) => update((s) => {
  title = title.trim().slice(0, 80); if (!title) return 'Give the assignment a name';
  if (!(due > Date.now())) return 'The due date must be in the future';
  if (list(s).filter((a) => !a.done && !a.missed).length >= 40) return 'Too many open assignments';
  const a: Assignment = { id: uid(), title, subject: subject.slice(0, 40) || 'General', due, size, created: Date.now() };
  return event(put(s, (l) => [...l, a]), 'study', `New assignment: ${title} (due ${new Date(due).toLocaleString()}).`);
});
export const removeAssignment = (id: string) => update((s) => { const a = list(s).find((x) => x.id === id); if (!a || a.done || a.missed) return 'Only open assignments can be withdrawn'; return put(s, (l) => l.filter((x) => x.id !== id)); });
/** Hand it in: reward now (or a little, if late and the penalty has already struck). */
export const completeAssignment = (id: string) => update((s) => {
  const a = list(s).find((x) => x.id === id); if (!a) return; if (a.done) return 'Already done';
  const now = Date.now(); if (a.missed && now > a.due + LATE_MS) return 'Too late to hand in';
  const r = rewardFor(a, s.stage, now);
  let o = ledger(put(s, (l) => l.map((x) => (x.id === id ? { ...x, done: now, paid: r } : x))), 'loot', `assign:${a.id}`, r);
  o = assignmentHooks.reduce((acc, h) => h(acc, a, 'done'), o);
  emit({ kind: 'reward', text: now <= a.due - EARLY_MS ? `${a.title} done a day early! Bonus reward.` : now <= a.due ? `${a.title} done on time!` : `${a.title} handed in late.`, res: r });
  return event(o, 'study', `Finished the assignment "${a.title}".`);
});

/** Kills a share of the soldiers at home (at least one). */
function cull(s: GameState, share: number): [GameState, number] {
  const away = awayBats(s), sq = s.squads.filter((q) => !away.has(q.bat)); let o = s, dead = 0;
  for (const q of sq) {
    const k = Math.min(q.count, Math.max(dead === 0 && q === sq[0] ? 1 : 0, Math.round(q.count * share)));
    if (!k) continue; dead += k;
    o = q.count - k <= 0 ? kill({ ...o, squads: o.squads.filter((x) => x.id !== q.id) }, 'squads', q.id) : mark({ ...o, squads: o.squads.map((x) => (x.id === q.id ? { ...x, count: x.count - k } : x)) }, 'squads', q.id);
  }
  return [o, dead];
}
/** The penalty for a missed assignment, applied to the realm. Returns the new state and what happened. */
export function penalize(s: GameState, a: Assignment): [GameState, string] {
  const goldLoss = (k: number, max: number) => Math.min(max, Math.floor(s.res.gold * k));
  if (a.size === 'small') { const g = goldLoss(0.1, 300); return [g ? spend(s, { gold: g }) : s, `The treasury was mismanaged: ${g} gold lost.`]; }
  if (a.size === 'medium') {
    if (armySize(s) - s.squads.filter((q) => awayBats(s).has(q.bat)).reduce((x, q) => x + q.count, 0) <= 0) { const g = goldLoss(0.2, 800); return [g ? spend(s, { gold: g }) : s, `With no soldiers to fall ill, the fever emptied the treasury instead: ${g} gold lost.`]; }
    const [o, dead] = cull(s, 0.12); return [o, `Fever swept the barracks: ${dead} soldiers died.`];
  }
  // major: an invasion, if anyone is able to come; otherwise the army and treasury suffer badly
  const w = s.world, foe = w.rivals.filter((r) => r.status !== 'ally' && r.status !== 'vassal').sort((x, y) => x.relation - y.relation)[0];
  if (foe && !w.threat && !w.campaign) {
    const nw: WorldState = { ...w, threat: { rival: foe.id, power: Math.round(foe.power * 0.6), since: Date.now(), allyHelp: [] }, rivals: w.rivals.map((r) => (r.id === foe.id ? { ...r, status: 'war' as const } : r)),
      inbox: [...w.inbox, { id: `${dayStr()}-assign-${a.id}`, rival: foe.id, kind: 'news', day: dayStr(), text: `${foe.name} heard your realm was distracted and marches on your castle!` }] };
    return [W(s, nw), `${foe.name} took advantage and laid siege to your castle.`];
  }
  const [o, dead] = cull(s, 0.2), g = Math.min(1200, Math.floor(o.res.gold * 0.15));
  return [g ? spend(o, { gold: g }) : o, `Chaos at home: ${dead} soldiers died and ${g} gold was lost.`];
}
/** Missed deadlines strike when they pass. Run every few seconds. */
export const assignmentsTick = (now = Date.now()) => {
  const due = list(getState()).filter((a) => !a.done && !a.missed && a.due < now);
  if (!due.length) return;
  update((s) => {
    let o = s;
    for (const a of due) {
      const [p, what] = penalize(o, a);
      o = put(p, (l) => l.map((x) => (x.id === a.id ? { ...x, missed: now, penalty: what } : x)));
      o = assignmentHooks.reduce((acc, h) => h(acc, a, 'missed'), o);
      emit({ kind: 'error', text: `Missed "${a.title}". ${what}` });
      o = event(o, 'town', `Missed the assignment "${a.title}". ${what}`);
    }
    return o;
  });
};
/** Other systems (the court) react to assignments. */
export const assignmentHooks: ((s: GameState, a: Assignment, what: 'done' | 'missed') => GameState)[] = [];
