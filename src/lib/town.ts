// Town life: thieves strike under-guarded towns; patrols catch them for a bounty.
import { _internal, getState, emit, townOrder, type GameState } from './state.ts';
import { dayStr } from './war.ts';
import { uid } from './study.ts';
import { ZERO } from './rewards.ts';

const { update, ledger, spend, event } = _internal;
export const MAX_THEFTS_PER_DAY = 3;
const town = (s: GameState) => { const t = s.world.town, d = dayStr(); return t && t.day === d ? t : { day: d, thefts: 0, caught: 0 }; };
/** Whether a thief may appear now: poorly guarded town, has homes, under the daily cap. */
export function thiefCanStrike(s = getState()) {
  const o = townOrder(s);
  return o.pop >= 6 && o.ratio < 0.5 && town(s).thefts + town(s).caught < MAX_THEFTS_PER_DAY && !s.world.threat;
}
/** A thief escaped: a small loss (at most 2% of gold, capped at 60). */
export const theft = () => update((s) => {
  const t = town(s); if (t.thefts >= MAX_THEFTS_PER_DAY) return;
  const gold = Math.min(60, Math.floor(s.res.gold * 0.02));
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
