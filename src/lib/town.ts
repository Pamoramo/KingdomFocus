// Town life: thieves strike under-guarded towns; patrols catch them for a bounty.
import { _internal, getState, emit, townOrder, neglect, type GameState } from './state.ts';
import { dayStr } from './war.ts';
import { uid } from './study.ts';
import { ZERO } from './rewards.ts';

const { update, ledger, spend, event } = _internal;
export const MAX_THEFTS_PER_DAY = 1;
const town = (s: GameState) => { const t = s.world.town, d = dayStr(); return t && t.day === d ? t : { day: d, thefts: 0, caught: 0 }; };
/** Whether a thief may appear now: poorly guarded town, has homes, under the daily cap. */
export function thiefCanStrike(s = getState()) {
  const o = townOrder(s), n = neglect(s);
  // a neglected realm breeds crime: thieves dare even moderately guarded towns, and come more often
  return o.pop >= 6 && o.ratio < (n > 0 ? 1 : 0.5) && town(s).thefts + town(s).caught < maxThefts(s) && !s.world.threat;
}
export const maxThefts = (s: GameState) => MAX_THEFTS_PER_DAY + Math.min(2, Math.ceil(neglect(s) / 2));
/** Chance per check (every 90s) that a thief appears. */
export const THIEF_CHECK_MS = 90_000;
export const thiefChance = (s = getState()) => Math.min(0.45, 0.12 + neglect(s) * 0.08);
/** A thief escaped: a small loss (1% of gold, at most 40). */
export const theft = () => update((s) => {
  const t = town(s); if (t.thefts >= maxThefts(s)) return;
  const gold = Math.min(40, Math.floor(s.res.gold * 0.01));
  emit({ kind: 'error', text: gold ? `A thief escaped with ${gold} gold. Set a battalion to patrol the town.` : 'A thief ran off empty-handed. Patrols would stop them.' });
  const o = gold ? spend(s, { gold }) : s;
  return event({ ...o, world: { ...o.world, town: { ...t, thefts: t.thefts + 1 } } }, 'town', gold ? `A thief stole ${gold} gold.` : 'A thief was seen in town.');
});
/** Guards caught a thief: a bounty. */
export const caught = () => update((s) => {
  const t = town(s);
  emit({ kind: 'reward', text: 'Your guards caught a thief!', res: { gold: 20, renown: 2 } });
  const o = ledger(s, 'loot', uid(), { ...ZERO, gold: 20, renown: 2 });
  return event({ ...o, world: { ...o.world, town: { ...t, caught: t.caught + 1 } } }, 'town', 'Guards caught a thief in the streets.');
});

export const MAX_EVENT_REWARDS = 6;
/** A town event finished: log it and grant its small reward (at most 6 rewarded events a day). */
export const townEvent = (title: string, res: Partial<{ gold: number; renown: number }> = {}, squadXp = 0) => update((s) => {
  const t = s.world.town && s.world.town.day === dayStr() ? s.world.town : { day: dayStr(), thefts: 0, caught: 0 };
  const n = t.events ?? 0, pays = n < MAX_EVENT_REWARDS && ((res.gold ?? 0) > 0 || (res.renown ?? 0) > 0 || squadXp > 0);
  let o: GameState = { ...s, world: { ...s.world, town: { ...t, events: n + 1 } } };
  if (pays) {
    o = ledger(o, 'loot', uid(), { ...ZERO, gold: res.gold ?? 0, renown: res.renown ?? 0 });
    if (squadXp && o.squads.length) { const q = o.squads[Math.floor(Math.random() * o.squads.length)]; o = _internal.mark({ ...o, squads: o.squads.map((x) => (x.id === q.id ? { ...x, xp: x.xp + squadXp } : x)) }, 'squads', q.id); }
    emit({ kind: 'reward', text: title, res: res as Partial<{ gold: number; wood: number; stone: number; renown: number }> });
  } else emit({ kind: 'info', text: title });
  return event(o, 'town', title);
});
