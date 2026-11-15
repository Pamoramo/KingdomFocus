// The court: four estates whose approval rises and falls with your decrees, your answers to their petitions,
// your studies and your deeds. Content estates help the realm; angry ones make trouble. Pure: no game-state imports.
import type { Res } from './rewards.ts';

export type Faction = 'nobles' | 'clergy' | 'merchants' | 'commons';
export const FACTIONS: Record<Faction, { name: string; desc: string; high: string; low: string }> = {
  nobles: { name: 'Nobility', desc: 'Lords and knights: they want glory, war and honours.', high: 'Loyal lords: commanders fight +0.5 better.', low: 'Plotting lords: renown is lost to scheming.' },
  clergy: { name: 'Clergy', desc: 'Priests and scholars: they prize learning and piety.', high: 'Blessings: +5% renown from study.', low: 'Sermons against you: -5% renown from study.' },
  merchants: { name: 'Merchants', desc: 'Guilds and traders: they want low tolls and open roads.', high: 'Busy markets: +5% gold from study.', low: 'Guild strikes: -5% gold from study.' },
  commons: { name: 'Commons', desc: 'Farmers and townsfolk: they want bread, safety and fair taxes.', high: 'Content people: half as much crime.', low: 'Unrest: twice the crime, and riots.' },
};
export const FACTION_IDS = Object.keys(FACTIONS) as Faction[];
type Drift = Partial<Record<Faction, number>>;
export interface DecreeOption { name: string; desc: string; drift: Drift; fx: Partial<CourtFx> }
export type DecreeId = 'tax' | 'levy' | 'faith' | 'trade';
export const DECREES: Record<DecreeId, { name: string; options: Record<string, DecreeOption> }> = {
  tax: { name: 'Taxes', options: {
    low: { name: 'Light taxes', desc: '-10% gold; the commons love it.', drift: { commons: 1.5, merchants: 0.5 }, fx: { gold: -0.1 } },
    normal: { name: 'Customary taxes', desc: 'No change.', drift: {}, fx: {} },
    high: { name: 'Heavy taxes', desc: '+15% gold, but commons and merchants grumble daily.', drift: { commons: -2, merchants: -1 }, fx: { gold: 0.15 } } } },
  levy: { name: 'Levy', options: {
    volunteers: { name: 'Volunteers', desc: 'Only willing men serve.', drift: { commons: 0.5, nobles: -0.5 }, fx: {} },
    conscription: { name: 'Conscription', desc: 'Recruits cost 20% less and +15% army capacity; the commons resent it.', drift: { commons: -1.5, nobles: 1 }, fx: { recruit: 0.2, cap: 0.15 } } } },
  faith: { name: 'Faith', options: {
    tolerant: { name: 'Tolerance', desc: 'Foreign traders are welcome.', drift: { merchants: 0.5, clergy: -0.5 }, fx: {} },
    devout: { name: 'Devotion', desc: '+8% renown from study; merchants find the rules tiresome.', drift: { clergy: 1.5, merchants: -0.5 }, fx: { renown: 0.08 } } } },
  trade: { name: 'Trade', options: {
    open: { name: 'Open roads', desc: '+10% better trade with other kingdoms.', drift: { merchants: 1.5, nobles: -0.5 }, fx: { trade: 0.1 } },
    protect: { name: 'Protected markets', desc: '+5% gold; foreign trade suffers.', drift: { merchants: -1, commons: 0.5 }, fx: { gold: 0.05, trade: -0.1 } } } },
};
export const DEFAULT_DECREES: Record<DecreeId, string> = { tax: 'normal', levy: 'volunteers', faith: 'tolerant', trade: 'open' };

export interface Petition { id: string; faction: Faction; title: string; text: string; cost: Partial<Res>; yes: Drift; no: Drift; day: string }
export interface Court { approval: Record<Faction, number>; decrees: Record<DecreeId, string>; petitions: Petition[]; day?: string; decreed?: Partial<Record<DecreeId, string>>; lastParade?: string }
export const newCourt = (): Court => ({ approval: { nobles: 55, clergy: 55, merchants: 55, commons: 55 }, decrees: { ...DEFAULT_DECREES }, petitions: [] });
export const courtOf = (w: { court?: Court } | undefined | null): Court => w?.court ?? newCourt();
export const adjust = (c: Court, d: Drift): Court => ({ ...c, approval: Object.fromEntries(FACTION_IDS.map((f) => [f, Math.max(0, Math.min(100, Math.round((c.approval[f] + (d[f] ?? 0)) * 10) / 10))])) as Record<Faction, number> });
export const mood = (v: number) => (v >= 70 ? 'devoted' : v >= 55 ? 'content' : v >= 40 ? 'uneasy' : v >= 25 ? 'angry' : 'rebellious');

export interface CourtFx { gold: number; wood: number; stone: number; renown: number; cap: number; recruit: number; trade: number; crime: number; command: number }
/** What the court's decrees and moods do to the realm. */
export function courtFx(c: Court): CourtFx {
  const fx: CourtFx = { gold: 0, wood: 0, stone: 0, renown: 0, cap: 0, recruit: 0, trade: 0, crime: 1, command: 0 };
  for (const id of Object.keys(DECREES) as DecreeId[]) { const o = DECREES[id].options[c.decrees[id]]?.fx ?? {}; for (const k of Object.keys(o) as (keyof CourtFx)[]) fx[k] += o[k] ?? 0; }
  const a = c.approval;
  if (a.merchants >= 70) fx.gold += 0.05; else if (a.merchants < 30) fx.gold -= 0.05;
  if (a.clergy >= 70) fx.renown += 0.05; else if (a.clergy < 30) fx.renown -= 0.05;
  if (a.nobles >= 70) fx.command += 0.5;
  if (a.commons >= 70) fx.crime *= 0.5; else if (a.commons < 30) fx.crime *= 2;
  return fx;
}

const PETITIONS: Record<Faction, Omit<Petition, 'id' | 'faction' | 'day'>[]> = {
  nobles: [
    { title: 'A tourney', text: 'The lords ask for a grand tourney to show their prowess.', cost: { gold: 300 }, yes: { nobles: 10, commons: 2 }, no: { nobles: -6 } },
    { title: 'Grants of land', text: 'Your knights ask for estates as reward for their service.', cost: { gold: 200, renown: 10 }, yes: { nobles: 12, commons: -3 }, no: { nobles: -7 } },
  ],
  clergy: [
    { title: 'A new chapel', text: 'The bishop asks for stone to raise a chapel.', cost: { stone: 120, gold: 80 }, yes: { clergy: 12, commons: 2 }, no: { clergy: -6 } },
    { title: 'Books for the abbey', text: 'The scholars beg for a library of books.', cost: { gold: 180 }, yes: { clergy: 10 }, no: { clergy: -5 } },
  ],
  merchants: [
    { title: 'Lower the tolls', text: 'The guilds ask you to waive the bridge tolls this season.', cost: { gold: 150 }, yes: { merchants: 12, nobles: -2 }, no: { merchants: -6 } },
    { title: 'A paved market road', text: 'The traders want their wagons out of the mud.', cost: { stone: 100, wood: 60 }, yes: { merchants: 10, commons: 3 }, no: { merchants: -5 } },
  ],
  commons: [
    { title: 'Bread for the poor', text: 'A hard winter: the people ask for grain from your stores.', cost: { gold: 150 }, yes: { commons: 12, nobles: -2 }, no: { commons: -7 } },
    { title: 'Mend the well', text: 'The village well has cracked. The people ask for timber and stone.', cost: { wood: 80, stone: 40 }, yes: { commons: 10 }, no: { commons: -5 } },
  ],
};
/** One day at court: moods drift back toward the middle, decrees push them, neglected studies dismay the clergy,
 *  and an estate may bring a petition. Returns the new court and the news of the day. */
export function courtDay(c0: Court, ctx: { today: string; seed: number; neglect: number; stage: number }, rnd: () => number): { court: Court; news: string[]; riot: boolean; plot: boolean } {
  if (c0.day === ctx.today) return { court: c0, news: [], riot: false, plot: false };
  let c: Court = { ...c0, day: ctx.today };
  const drift: Drift = {};
  for (const f of FACTION_IDS) drift[f] = Math.sign(50 - c.approval[f]) * Math.min(1, Math.abs(50 - c.approval[f]) / 10);
  for (const id of Object.keys(DECREES) as DecreeId[]) for (const [f, v] of Object.entries(DECREES[id].options[c.decrees[id]]?.drift ?? {})) drift[f as Faction] = (drift[f as Faction] ?? 0) + (v ?? 0);
  if (ctx.neglect > 0) { drift.clergy = (drift.clergy ?? 0) - Math.min(4, ctx.neglect); drift.commons = (drift.commons ?? 0) - Math.min(2, ctx.neglect * 0.5); }
  c = adjust(c, drift);
  const news: string[] = [];
  // petitions left unanswered for three days offend those who brought them
  for (const p of c.petitions) if (p.day < ctx.today && daysBetween(p.day, ctx.today) >= 3) { c = adjust(c, { [p.faction]: -4 }); news.push(`The ${FACTIONS[p.faction].name} feel ignored: their petition "${p.title}" went unanswered.`); }
  c = { ...c, petitions: c.petitions.filter((p) => daysBetween(p.day, ctx.today) < 3) };
  if (c.petitions.length < 3 && rnd() < 0.45) {
    const f = FACTION_IDS.slice().sort((a, b) => c.approval[a] - c.approval[b])[rnd() < 0.6 ? 0 : Math.floor(rnd() * 4)], t = PETITIONS[f][Math.floor(rnd() * PETITIONS[f].length)];
    if (!c.petitions.some((p) => p.title === t.title)) {
      const k = 1 + (Math.max(1, ctx.stage) - 1) * 0.5, cost = Object.fromEntries(Object.entries(t.cost).map(([r, v]) => [r, Math.round((v ?? 0) * k)])) as Partial<Res>;
      c = { ...c, petitions: [...c.petitions, { ...t, cost, id: `pet-${ctx.today}-${f}`, faction: f, day: ctx.today }] }; news.push(`The ${FACTIONS[f].name} bring a petition: ${t.title}.`);
    }
  }
  const riot = c.approval.commons < 25 && rnd() < 0.5, plot = c.approval.nobles < 25 && rnd() < 0.4;
  if (riot) news.push('Riots in the streets! The angry commons smash shop windows.');
  if (plot) news.push('A plot among the nobles is uncovered. The scandal costs you renown.');
  return { court: c, news, riot, plot };
}
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
