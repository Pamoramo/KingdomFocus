// Actions for the court (decrees, petitions, the daily mood of the estates), expansion (settlements)
// and the military parade. Kept apart from state.ts so the pure rules stay testable on their own.
import { _internal, getState, emit, neglect, type GameState } from './state.ts';
import { awayBats } from './warActions.ts';
import { dayStr, isKnown, type WorldState } from './war.ts';
import { canAfford, ZERO, type Res } from './rewards.ts';
import { courtOf, courtDay, adjust, DECREES, FACTIONS, type DecreeId } from './politics.ts';
import { sitesFor, siteKnown, settleCap, foundCost, upgradeCost, upgradeStage, SETTLE } from './expansion.ts';
import { assignmentHooks } from './assignments.ts';
import { hash } from './names.ts';

const { update, ledger, spend, mark, event } = _internal;
const W = (s: GameState, w: WorldState): GameState => ({ ...s, world: w });
const withCourt = (s: GameState, f: (c: ReturnType<typeof courtOf>) => ReturnType<typeof courtOf>) => W(s, { ...s.world, court: f(courtOf(s.world)) });

// ---------------- the court ----------------
/** Proclaim a decree. Each can be changed once a day; those it favours cheer, those it burdens grumble. */
export const setDecree = (id: DecreeId, option: string) => update((s) => {
  const c = courtOf(s.world), today = dayStr(), opt = DECREES[id].options[option]; if (!opt) return;
  if (c.decrees[id] === option) return;
  if (c.decreed?.[id] === today) return 'The court will not hear another change to this decree until tomorrow';
  const shock = Object.fromEntries(Object.entries(opt.drift).map(([f, v]) => [f, (v ?? 0) * 3]));
  emit({ kind: 'info', text: `Decree: ${opt.name}.` });
  return event(withCourt(s, (x) => adjust({ ...x, decrees: { ...x.decrees, [id]: option }, decreed: { ...x.decreed, [id]: today } }, shock)), 'diplomacy', `You decreed ${opt.name.toLowerCase()}.`);
});
/** Grant or refuse an estate's petition. */
export const answerPetition = (id: string, grant: boolean) => update((s) => {
  const c = courtOf(s.world), p = c.petitions.find((x) => x.id === id); if (!p) return;
  if (grant && !canAfford(s.res, p.cost)) return 'You cannot afford it';
  let o = grant ? spend(s, p.cost) : s;
  o = withCourt(o, (x) => adjust({ ...x, petitions: x.petitions.filter((q) => q.id !== id) }, grant ? p.yes : p.no));
  emit({ kind: grant ? 'info' : 'error', text: grant ? `You granted "${p.title}". The ${FACTIONS[p.faction].name} are pleased.` : `You refused "${p.title}". The ${FACTIONS[p.faction].name} are displeased.` });
  return event(o, 'diplomacy', `${grant ? 'Granted' : 'Refused'} the ${FACTIONS[p.faction].name}' petition: ${p.title}.`);
});
/** Once a day: the estates' moods drift, petitions arrive, and angry estates make trouble. */
export const courtTick = () => {
  const s0 = getState(), today = dayStr(); if (courtOf(s0.world).day === today) return;
  let h = hash(`${s0.world.seed}:${today}:court`); const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const r = courtDay(courtOf(s0.world), { today, seed: s0.world.seed, neglect: neglect(s0), stage: s0.stage }, rnd);
  update((s) => {
    let o = withCourt(s, () => r.court);
    if (r.riot) { const g = Math.min(400, Math.floor(o.res.gold * 0.06)); if (g) o = spend(o, { gold: g }); }
    if (r.plot) { const k = Math.min(40, Math.floor(o.res.renown * 0.1)); if (k) o = spend(o, { renown: k }); }
    for (const n of r.news) emit({ kind: r.riot || r.plot ? 'error' : 'info', text: n });
    return r.news.length ? event(o, 'diplomacy', r.news.join(' ')) : o;
  });
};
// the estates watch your studies: finished coursework pleases the clergy and commons; missed work dismays everyone
assignmentHooks.push((s, a, what) => withCourt(s, (c) => adjust(c, what === 'done' ? { clergy: a.size === 'large' ? 4 : 2, commons: 1 } : { clergy: -4, commons: -2, nobles: -2, merchants: -2 })));

// ---------------- expansion ----------------
export const sitesOf = (s: GameState) => sitesFor(s.world.seed, s.world.rivals);
/** Lands your mapmakers know (all of those round your castle, and the roadside lands within reach of your maps). */
export const knownSites = (s: GameState) => sitesOf(s).filter((x) => siteKnown(x, { stage: s.stage, settlements: (s.world.settlements ?? []).length, known: s.world.rivals.filter(isKnown) }) || (s.world.settlements ?? []).some((h) => h.site === x.id));
/** How many settlements the realm can hold: by the castle's stage, and one more for each vassal (they guard your lands). */
export const landCap = (s: GameState) => settleCap(s.stage) + s.world.rivals.filter((r) => r.status === 'vassal').length;
export const foundSettlement = (siteId: string) => update((s) => {
  const site = knownSites(s).find((x) => x.id === siteId); if (!site) return 'Your mapmakers have not charted that land';
  const held = s.world.settlements ?? [], cap = landCap(s);
  if (held.some((x) => x.site === siteId)) return 'Already settled';
  if (held.length >= cap) return `Your realm can hold ${cap} settlement${cap === 1 ? '' : 's'} now. Grow your castle or take vassals to claim more.`;
  const cost = foundCost(site.kind, held.length, site); if (!canAfford(s.res, cost)) return 'Not enough resources';
  let o = W(spend(s, cost), { ...s.world, settlements: [...held, { site: siteId, level: 1, founded: Date.now() }] });
  if (site.kind === 'abbey') o = withCourt(o, (c) => adjust(c, { clergy: 8 }));
  if (site.kind === 'market') o = withCourt(o, (c) => adjust(c, { merchants: 6 }));
  o = withCourt(o, (c) => adjust(c, { commons: 3 }));
  emit({ kind: 'achieve', text: `Settlers found ${site.name}, a new ${SETTLE[site.kind].levels[0].toLowerCase()}!`, big: true });
  return event(o, 'build', `Founded ${site.name} (${SETTLE[site.kind].name}).`);
});
export const upgradeSettlement = (siteId: string) => update((s) => {
  const site = sitesOf(s).find((x) => x.id === siteId), st = (s.world.settlements ?? []).find((x) => x.site === siteId); if (!site || !st) return;
  if (st.level >= 3) return 'Already as great as it can be';
  if (s.stage < upgradeStage(st.level)) return `Needs your castle at stage ${upgradeStage(st.level)}`;
  const cost = upgradeCost(site.kind, st.level); if (!canAfford(s.res, cost)) return 'Not enough resources';
  const o = W(spend(s, cost), { ...s.world, settlements: (s.world.settlements ?? []).map((x) => (x.site === siteId ? { ...x, level: x.level + 1 } : x)) });
  emit({ kind: 'build', text: `${site.name} grows into a ${SETTLE[site.kind].levels[st.level].toLowerCase()}.` });
  return event(o, 'build', `${site.name} grew into a ${SETTLE[site.kind].levels[st.level].toLowerCase()}.`);
});

// ---------------- the military parade ----------------
/** Soldiers at home who would march. */
export const paradeSoldiers = (s: GameState) => { const away = awayBats(s); return s.squads.filter((q) => !away.has(q.bat)).reduce((a, q) => a + q.count, 0); };
export const paradeCost = (s: GameState): Partial<Res> => ({ gold: Math.min(3000, 100 + paradeSoldiers(s) * 3) });
/** What the parade earns: renown, the people's and the lords' favour, drilled soldiers, a day without thieves, and second thoughts among enemies. */
export const paradeReward = (s: GameState) => ({ renown: Math.min(150, 10 + Math.floor(paradeSoldiers(s) / 6)), xp: 20, commons: 6, nobles: 5, deter: 0.3 });
export const holdParade = () => update((s) => {
  const n = paradeSoldiers(s), today = dayStr(), c = courtOf(s.world);
  if (n < 6) return 'You need at least 6 soldiers at home to parade';
  if (c.lastParade === today) return 'One parade a day: the people need their sleep';
  const cost = paradeCost(s), r = paradeReward(s); if (!canAfford(s.res, cost)) return 'Not enough gold';
  let o = ledger(spend(s, cost), 'loot', `parade:${today}`, { ...ZERO, renown: r.renown });
  const away = awayBats(o); o = { ...o, squads: o.squads.map((q) => (away.has(q.bat) ? q : { ...q, xp: q.xp + r.xp })) }; for (const q of o.squads) if (!away.has(q.bat)) o = mark(o, 'squads', q.id);
  o = W(o, { ...o.world, warnings: (o.world.warnings ?? []).map((w) => ({ ...w, chance: Math.round(w.chance * (1 - r.deter) * 100) / 100 })) });
  o = withCourt(o, (x) => adjust({ ...x, lastParade: today }, { commons: r.commons, nobles: r.nobles }));
  o = W(o, { ...o.world, festival: Math.max(o.world.festival ?? 0, Date.now() + 3 * 60_000) }); // the town celebrates
  emit({ kind: 'reward', text: `${n} soldiers parade through the streets! The realm cheers.`, res: { renown: r.renown } });
  return event(o, 'command', `A military parade of ${n} soldiers marched before the court.`);
});
