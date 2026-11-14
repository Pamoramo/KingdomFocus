// Rival kingdoms, diplomacy, siege engines, campaigns and defence. Pure functions on WorldState.
import type { Res } from './rewards.ts';
import { type Unit, type Terrain, sidePower } from './battle.ts';
import { TROOPS, type TClass } from './economy.ts';
import { nameFor, hash } from './names.ts';

export type Personality = 'aggressive' | 'mercantile' | 'honorable' | 'treacherous' | 'pious';
export type RStatus = 'neutral' | 'ally' | 'war' | 'vassal';
export interface Rival {
  id: string; name: string; ruler: string; personality: Personality; color: number; emblem: string;
  x: number; y: number; terrain: Terrain; level: number; power: number; garrison: number; wallMax: number;
  relation: number; status: RStatus; trades: number; lastTradeDay: string; bandits?: boolean; friends: string[]; foes: string[]; beaten?: number;
}
export type Engine = 'ram' | 'mangonel' | 'tower' | 'ballista' | 'trebuchet';
export const ENGINES: Record<Engine, { name: string; cost: Partial<Res>; siege: number; bombard: number; desc: string }> = {
  ram: { name: 'Battering Ram', cost: { gold: 300, wood: 200 }, siege: 1, bombard: 0, desc: 'Weakens gates during an assault (-8% wall defence each).' },
  tower: { name: 'Siege Tower', cost: { gold: 900, wood: 600 }, siege: 1, bombard: 0, desc: 'Puts troops on the walls (-12% wall defence each in assaults).' },
  mangonel: { name: 'Mangonel', cost: { gold: 600, wood: 300, stone: 150 }, siege: 1, bombard: 12, desc: 'Hurls stones at walls: 12 damage per siege day.' },
  ballista: { name: 'Ballista', cost: { gold: 700, wood: 250, stone: 200 }, siege: 1, bombard: 4, desc: 'Giant crossbow. Adds firepower to field battles.' },
  trebuchet: { name: 'Trebuchet', cost: { gold: 2000, wood: 800, stone: 600, renown: 20 }, siege: 2, bombard: 35, desc: 'The great wall-breaker: 35 damage per siege day.' },
};
export const ENGINE_IDS = Object.keys(ENGINES) as Engine[];
export type Engines = Record<Engine, number>;
export const NO_ENGINES: Engines = { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 };

export type Stance = 'bombard' | 'blockade' | 'sap';
export interface Campaign {
  target: string; battalions: string[]; engines: Engines; supplies: number; phase: 'march' | 'field' | 'siege'; arrive?: number; next?: 'field' | 'siege';
  day: number; progressMin: number; wallHp: number; wallMax: number; garrison: number; garrisonMorale: number; morale: number;
  stance: Stance; allies: string[]; log: string[]; started: number;
}
export interface Threat { rival: string; power: number; since: number; allyHelp: string[] }
export interface Missive { id: string; rival: string; kind: 'tribute_demand' | 'trade_offer' | 'aid_request' | 'alliance_offer' | 'peace_offer' | 'news'; text: string; amount?: number; day: string }
export interface Loan { bat: string; rival: string; leftMin: number }
export interface Report { id: string; t: number; title: string; win: boolean; lines: string[]; you: number; foe: number; lostYou: number; lostFoe: number; loot?: Partial<Res> }
export type JourneyKind = 'envoy' | 'caravan' | 'gift' | 'aid' | 'army' | 'return' | 'reinforce' | 'raid';
/** Someone on the road between your kingdom and another. Effects apply when they arrive. */
/** `to` is set for places that are not a realm (bandit outposts); otherwise the journey runs to the rival's castle. */
export interface Journey { id: string; kind: JourneyKind; rival: string; depart: number; arrive: number; home?: boolean; label: string; bats?: string[]; data?: Record<string, unknown>; to?: { x: number; y: number } }
/** A small bandit camp on the road: easy prey with a small purse. */
export interface Outpost { id: string; name: string; x: number; y: number; power: number; loot: Res; biome: 'grassland' | 'forest' | 'highlands' | 'swamp' }
export interface WorldState { seed: number; lastDay: string; rivals: Rival[]; engines: Engines; supplies: number; campaign: Campaign | null; threat: Threat | null; inbox: Missive[]; loans: Loan[]; reports: Report[]; conquests: number; town?: { day: string; thefts: number; caught: number; events?: number }; journeys?: Journey[]; outposts?: Outpost[]; outpostDay?: string }

export const SIEGE_DAY_MIN = 20;          // verified study minutes per siege day
export const SUPPLY_COST = { gold: 15, wood: 5 }; // buys 10 supplies
const KINGDOM_NAMES = ['Valdren', 'Ashmoor', 'Elrath', 'Corvane', 'Thornwick', 'Highmarch', 'Dunmere', 'Westfold', 'Kaelholm', 'Brightwater'];
const PERS: Personality[] = ['aggressive', 'mercantile', 'honorable', 'treacherous', 'pious', 'aggressive'];
const BASE: Record<Personality, number> = { aggressive: -15, mercantile: 10, honorable: 5, treacherous: -10, pious: 0 };
export const PERSONALITY_TEXT: Record<Personality, string> = { aggressive: 'Warlike: grows fast and resents strong neighbours.', mercantile: 'Merchant princes: generous trade rates.', honorable: 'Keeps their word; values aid and alliances.', treacherous: 'Unpredictable; relations drift downward.', pious: 'Cautious and slow to anger.' };
const TERRAINS: Terrain[] = ['plains', 'forest', 'hills', 'river', 'marsh'];
export const relationLabel = (r: number) => (r >= 60 ? 'Trusted' : r >= 25 ? 'Friendly' : r > -25 ? 'Neutral' : r > -50 ? 'Unfriendly' : 'Hostile');
const clamp = (v: number, a = -100, b = 100) => Math.max(a, Math.min(b, v));
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function initWorld(seed: number): WorldState {
  const R = rng(seed), names = [...KINGDOM_NAMES].sort(() => R() - 0.5);
  const rivals: Rival[] = [{ id: 'bandits', name: 'Bandit Lord of the Crags', ruler: 'Grimbald the Red', personality: 'aggressive', color: 0x3a3a3a, emblem: 'sword', x: 0.62, y: 0.42, terrain: 'hills', level: 1, power: 45, garrison: 25, wallMax: 60, relation: -60, status: 'war', trades: 0, lastTradeDay: '', bandits: true, friends: [], foes: [] }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R() * 0.4, d = 0.28 + R() * 0.14, level = 1 + Math.floor(i / 2) + (R() < 0.3 ? 1 : 0);
    const power = Math.round(120 * level ** 2.2 * (0.8 + R() * 0.5));
    rivals.push({ id: 'k' + i, name: names[i], ruler: nameFor(names[i] + seed), personality: PERS[i], color: [0x2a5aa8, 0x8a2a8a, 0x2a8a5a, 0xa86a2a, 0x7a1d1a, 0x4a6a8a][i], emblem: ['eagle', 'stag', 'tower', 'cross', 'dragon', 'star'][i],
      x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d * 0.8, terrain: TERRAINS[Math.floor(R() * TERRAINS.length)], level, power, garrison: Math.round(power * 0.4), wallMax: Math.round(200 * level ** 1.5),
      relation: BASE[PERS[i]] + Math.round(R() * 20 - 10), status: 'neutral', trades: 0, lastTradeDay: '', friends: [], foes: [] });
  }
  for (let i = 1; i < rivals.length; i++) for (let j = i + 1; j < rivals.length; j++) { const v = R(); if (v < 0.25) { rivals[i].friends.push(rivals[j].id); rivals[j].friends.push(rivals[i].id); } else if (v > 0.8) { rivals[i].foes.push(rivals[j].id); rivals[j].foes.push(rivals[i].id); } }
  return { seed, lastDay: dayStr(), rivals, engines: { ...NO_ENGINES }, supplies: 50, campaign: null, threat: null, inbox: [], loans: [], reports: [], conquests: 0 };
}

/** Enemy army composition matching a power level and castle level. */
export function armyOf(r: Pick<Rival, 'power' | 'level' | 'id'>, power = r.power): Unit[] {
  const pool: TClass[][] = [['peasant', 'militia', 'spearman', 'archer'], ['swordsman', 'pikeman', 'longbow', 'lightcav'], ['manatarms', 'crossbow', 'shieldman', 'knight'], ['heavyinf', 'halberdier', 'mknight'], ['royalguard', 'vetcav', 'royalarcher']];
  const classes = pool.slice(0, Math.min(5, r.level)).flat().slice(-6), rank = Math.min(4, r.level - 1), units: Unit[] = [];
  const per = power / classes.length;
  classes.forEach((c, i) => { const unitP = TROOPS[c].power * (1 + rank * 0.25); const n = Math.max(1, Math.round(per / unitP)); units.push({ cls: c, count: n, rank: Math.max(0, rank - (i % 2)), ref: r.id + i }); });
  return units;
}

// ---------------- daily world turn ----------------
export interface Context { stage: number; myPower: number; fort: number; active: boolean; neglect?: number }
/** Processes elapsed days (max 3 at a time, so absences never snowball). */
export function advanceDays(w: WorldState, ctx: Context, today = dayStr()): WorldState {
  if (w.lastDay === today) return w;
  const last = new Date(w.lastDay), now = new Date(today);
  const days = Math.min(3, Math.max(1, Math.round((now.getTime() - last.getTime()) / 864e5)));
  let out: WorldState = { ...w, lastDay: today, rivals: w.rivals.map((r) => ({ ...r })), inbox: w.inbox.filter((m) => m.day >= dayStr(new Date(now.getTime() - 4 * 864e5))) };
  const R = rng(w.seed + hash(today));
  for (let d = 0; d < days; d++) for (const r of out.rivals) {
    if (r.status === 'vassal') { r.relation = clamp(r.relation + 1); continue; }
    const base = BASE[r.personality] - (r.personality === 'aggressive' ? (ctx.stage - 1) * 4 : 0) + (r.status === 'ally' ? 30 : 0);
    r.relation = clamp(Math.round(r.relation + Math.sign(base - r.relation) * Math.min(2, Math.abs(base - r.relation))));
    if (r.personality === 'treacherous' && R() < 0.3) r.relation = clamp(r.relation - 3);
    r.power = Math.round(r.power * (1 + (r.personality === 'aggressive' ? 0.015 : 0.008)) + (r.bandits ? 2 : 0));
    r.garrison = Math.max(r.garrison, Math.round(r.power * 0.4));
    if (r.status === 'ally' && r.relation < 30) r.status = 'neutral';
  }
  // a lord who neglects their studies looks weak: warlike neighbours grow bolder each idle day past the grace period
  const n = ctx.neglect ?? 0;
  if (n > 0) for (const r of out.rivals) if (!r.bandits && r.status !== 'vassal' && r.status !== 'ally' && (r.personality === 'aggressive' || r.personality === 'treacherous')) r.relation = clamp(r.relation - Math.min(12, 3 * n));
  if (!ctx.active) return out;
  if (n > 0) {
    const foe = out.rivals.filter((r) => !r.bandits && r.status !== 'vassal' && r.status !== 'ally').sort((a, b) => a.relation - b.relation)[0];
    if (foe) out.inbox.push({ id: `${today}-neglect`, rival: foe.id, kind: 'news', day: today, text: n >= 3
      ? `${foe.ruler} of ${foe.name} writes: "Your halls fall silent and your scholars idle. Study, or we will come for your lands."`
      : `Word spreads that your studies have lapsed. ${foe.name} watches your borders with interest.` });
  }
  // diplomatic events (only processed when the player is actually present)
  for (const r of out.rivals.filter((x) => !x.bandits && x.status !== 'vassal')) {
    const roll = R(), id = `${today}-${r.id}`;
    if (r.status === 'ally' && roll < 0.15) out.inbox.push({ id, rival: r.id, kind: 'aid_request', text: `${r.name} asks for troops against their enemies.`, day: today });
    else if (r.personality === 'mercantile' && r.relation > 0 && roll < 0.25) out.inbox.push({ id, rival: r.id, kind: 'trade_offer', text: `${r.name} offers a favourable trade.`, amount: 200 + r.level * 100, day: today });
    else if (r.relation >= 60 && r.status === 'neutral' && roll < 0.3) out.inbox.push({ id, rival: r.id, kind: 'alliance_offer', text: `${r.ruler} of ${r.name} proposes an alliance.`, day: today });
    else if (r.personality === 'aggressive' && r.relation < 0 && r.power > ctx.myPower && roll < 0.2) out.inbox.push({ id, rival: r.id, kind: 'tribute_demand', text: `${r.name} demands tribute.`, amount: Math.round(100 * r.level + ctx.stage * 80), day: today });
  }
  // a siege on your castle: only once you are a fortress (stage 4+) and at odds, or when a kingdom truly hates you
  if (!out.threat && !out.campaign) {
    const angry = out.rivals.filter((r) => !r.bandits && r.status !== 'vassal' && r.status !== 'ally' && (r.relation <= -50 || (ctx.stage >= 4 && (r.status === 'war' || (r.personality === 'aggressive' && r.relation < -20)))));
    const foe = angry.sort((a, b) => a.relation - b.relation)[0];
    if (foe && R() < (foe.personality === 'aggressive' ? 0.45 : 0.3)) {
      out.threat = { rival: foe.id, power: Math.round(foe.power * 0.6), since: Date.now(), allyHelp: [] };
      foe.status = 'war';
      out.inbox.push({ id: `${today}-siege`, rival: foe.id, kind: 'news', text: `${foe.name} marches on your castle! Their host surrounds your walls.`, day: today });
    }
  }
  return out;
}

// ---------------- diplomacy ----------------
const VALUE: Record<keyof Res, number> = { gold: 1, wood: 1.5, stone: 2.5, renown: 10 };
export const valueOf = (r: Partial<Res>) => (Object.keys(r) as (keyof Res)[]).reduce((a, k) => a + (r[k] ?? 0) * VALUE[k], 0);
/** Trade: give one resource, receive another at a rate that improves with relations and merchants. */
export function tradeQuote(r: Rival, give: keyof Res, amount: number, want: keyof Res) {
  const rate = 0.75 + Math.max(0, r.relation) / 400 + (r.personality === 'mercantile' ? 0.15 : 0) + (r.status === 'ally' ? 0.05 : 0);
  const got = Math.floor((amount * VALUE[give] * rate) / VALUE[want]);
  const rel = Math.min(8, 1 + Math.round((amount * VALUE[give]) / (150 * r.level)));
  return { got, rel, rate };
}
export function canTrade(r: Rival, today = dayStr()) {
  if (r.bandits) return 'Bandits do not trade';
  if (r.status === 'war') return 'You are at war';
  if (r.lastTradeDay === today && r.trades >= 3) return 'Three trades per kingdom per day';
  return null;
}
export const giftRelation = (r: Rival, gold: number) => Math.min(15, Math.round(gold / (40 * r.level)));
export function shiftRelations(w: WorldState, id: string, delta: number, ripple = true): WorldState {
  const tgt = w.rivals.find((r) => r.id === id);
  return { ...w, rivals: w.rivals.map((r) => {
    if (r.id === id) return { ...r, relation: clamp(r.relation + delta) };
    if (!ripple || !tgt) return r;
    if (tgt.friends.includes(r.id)) return { ...r, relation: clamp(r.relation + Math.round(delta * 0.35)) };
    if (tgt.foes.includes(r.id)) return { ...r, relation: clamp(r.relation - Math.round(delta * 0.25)) };
    return r;
  }) };
}
export const setStatus = (w: WorldState, id: string, status: RStatus): WorldState => ({ ...w, rivals: w.rivals.map((r) => (r.id === id ? { ...r, status } : r)) });

// ---------------- campaigns ----------------
/** Travel time from your kingdom: envoys ride fast, caravans trundle, armies march slowly. */
export function travelMs(kind: JourneyKind, r: Pick<Rival, 'x' | 'y'>) {
  const d = Math.hypot(r.x - 0.5, r.y - 0.5);
  return Math.round((kind === 'envoy' ? 40 + d * 300 : kind === 'caravan' || kind === 'gift' ? 60 + d * 420 : 90 + d * 560) * 1000);
}
export function newCampaign(r: Rival, battalions: string[], engines: Engines, supplies: number, allies: string[], now = Date.now()): Campaign {
  return { target: r.id, battalions, engines, supplies, phase: 'march', arrive: now + travelMs('army', r), next: r.power * 0.6 > 10 ? 'field' : 'siege', day: 0, progressMin: 0, wallHp: r.wallMax, wallMax: r.wallMax, garrison: r.garrison,
    garrisonMorale: 100, morale: 100, stance: 'bombard', allies, log: [`Your host marches on ${r.name}.`], started: Date.now() };
}
export const bombardPerDay = (e: Engines) => ENGINE_IDS.reduce((a, k) => a + e[k] * ENGINES[k].bombard, 0);
export const consumption = (soldiers: number) => Math.max(1, Math.ceil(soldiers / 10));
/** Studying advances the siege: every SIEGE_DAY_MIN verified minutes is one siege day. */
export function siegeProgress(c: Campaign, minutes: number, soldiers: number, engineering: boolean): { c: Campaign; days: number; desert: number } {
  if (c.phase !== 'siege' || minutes <= 0) return { c, days: 0, desert: 0 };
  const out = { ...c, log: [...c.log] }; out.progressMin += minutes;
  let days = 0, desert = 0;
  while (out.progressMin >= SIEGE_DAY_MIN) {
    out.progressMin -= SIEGE_DAY_MIN; out.day++; days++;
    const need = consumption(soldiers);
    if (out.supplies >= need) { out.supplies -= need; out.morale = Math.min(100, out.morale + 2); }
    else { out.supplies = 0; out.morale = Math.max(0, out.morale - 15); desert += Math.ceil(soldiers * 0.03); out.log.push(`Day ${out.day}: supplies ran out. Morale falls and some soldiers desert.`); }
    if (out.stance === 'bombard') { const d = bombardPerDay(out.engines); out.wallHp = Math.max(0, out.wallHp - d); if (d) out.log.push(`Day ${out.day}: siege engines batter the walls (-${d}).`); else out.log.push(`Day ${out.day}: without engines your bombardment does nothing. Build some at the siege workshop.`); }
    if (out.stance === 'blockade') { out.garrisonMorale = Math.max(0, out.garrisonMorale - 10); out.garrison = Math.floor(out.garrison * 0.97); out.log.push(`Day ${out.day}: the blockade tightens; the garrison grows hungry.`); }
    if (out.stance === 'sap') { if (engineering) { const d = Math.round(out.wallMax * 0.08); out.wallHp = Math.max(0, out.wallHp - d); out.morale = Math.max(0, out.morale - 3); out.log.push(`Day ${out.day}: sappers undermine the walls (-${d}).`); } else out.log.push(`Day ${out.day}: your sappers lack the Engineering knowledge.`); }
    out.garrisonMorale = Math.max(0, out.garrisonMorale - (out.wallHp < out.wallMax * 0.3 ? 4 : 1));
  }
  out.log = out.log.slice(-30);
  return { c: out, days, desert };
}
export const surrenderChance = (c: Campaign) => Math.max(0, Math.min(0.95, (60 - c.garrisonMorale) / 60 + (c.wallHp < c.wallMax * 0.2 ? 0.25 : 0)));
export const wallFort = (c: Campaign) => 0.25 + 0.6 * (c.wallHp / Math.max(1, c.wallMax));

/** Your castle's defensive strength 0..0.85 from walls, towers, gates, keep and moat. */
export function castleFort(counts: { wall: number; palisade: number; tower: number; gatehouse: number; gate: number; moat: number; keep: number; watchtower: number }) {
  const score = counts.palisade * 2 + counts.wall * 5 + counts.tower * 60 + counts.gatehouse * 120 + counts.gate * 40 + counts.moat * 6 + counts.keep * 80 + counts.watchtower * 15;
  return Math.min(0.85, score / 2000);
}
export const yourPower = (units: Unit[]) => sidePower(units);

// ---------------- spoils of war (one source of truth for what victories pay and what the UI promises) ----------------
const lv = (r: Pick<Rival, 'level'>) => Math.max(1, r.level);
/** Winning the field battle before a siege. */
export const fieldSpoils = (r: Pick<Rival, 'level'>): Res => ({ gold: 0, wood: 0, stone: 0, renown: 10 * lv(r) });
/** Taking the castle by assault or surrender: its treasury and quarried stone. */
export const conquestSpoils = (r: Pick<Rival, 'level'>): Res => ({ gold: 300 * lv(r) ** 2, wood: 0, stone: 80 * lv(r) ** 2, renown: 60 * lv(r) });
/** Breaking an enemy host that attacks your castle. */
export const defenceSpoils = (r: Pick<Rival, 'level'>): Res => ({ gold: 150 * lv(r), wood: 0, stone: 0, renown: 30 * lv(r) });
/** Lasting tribute from each vassal, applied to every study session. */
export const VASSAL_GOLD = 0.05, VASSAL_GOLD_MAX = 0.3, VASSAL_RENOWN = 0.02;

// ---------------- bandit outposts ----------------
const OUTPOST_NAMES = ['Cutthroat Camp', 'Wolf Hollow', 'Raven Rock', 'Smugglers\' Ford', 'Black Thicket', 'Gallows Hill', 'Rat\'s Nest', 'Old Mill Hideout', 'Crooked Bridge', 'Poacher\'s Den', 'Thieves\' Copse', 'Broken Tower'];
/** How many outposts a realm at this stage has to deal with. */
export const outpostCap = (stage: number) => 2 + Math.min(2, Math.floor(stage / 2));
/** A new outpost along the road to a random realm; small, and stronger (with a fatter purse) as your kingdom grows. */
export function newOutpost(w: Pick<WorldState, 'rivals' | 'outposts' | 'seed'>, stage: number, salt: number): Outpost {
  const R = rng(hash(`${w.seed}:${salt}`)), rv = w.rivals[Math.floor(R() * w.rivals.length)] ?? { x: 0.8, y: 0.3 };
  const t = 0.35 + R() * 0.3, nx = -(rv.y - 0.5), ny = rv.x - 0.5, j = (R() - 0.5) * 0.25;
  const x = Math.min(0.92, Math.max(0.08, 0.5 + (rv.x - 0.5) * t + nx * j)), y = Math.min(0.9, Math.max(0.1, 0.5 + (rv.y - 0.5) * t + ny * j));
  const lvl = Math.max(1, stage), power = Math.round((10 + R() * 14) * (1 + lvl * 0.6));
  const loot: Res = { gold: Math.round((40 + R() * 50) * lvl), wood: Math.round(R() * 30 * lvl), stone: Math.round(R() * 18 * lvl), renown: 3 + Math.floor(R() * 3) + lvl };
  const used = new Set((w.outposts ?? []).map((o) => o.name)), name = OUTPOST_NAMES.find((n, i) => !used.has(n) && i >= Math.floor(R() * OUTPOST_NAMES.length)) ?? OUTPOST_NAMES.find((n) => !used.has(n)) ?? 'Bandit Camp';
  const biomes = ['grassland', 'forest', 'highlands', 'swamp'] as const;
  return { id: `op-${salt}-${Math.floor(R() * 1e6)}`, name, x, y, power, loot, biome: biomes[Math.floor(R() * biomes.length)] };
}
/** Once a day bandits set up a new camp, until there are outpostCap of them. */
export function refreshOutposts(w: WorldState, stage: number, today = dayStr()): WorldState {
  if (w.outpostDay === today) return w;
  let outposts = [...(w.outposts ?? [])];
  const add = w.outposts ? 1 : 2; // a new world starts with two
  for (let i = 0; i < add && outposts.length < outpostCap(stage); i++) outposts = [...outposts, newOutpost({ ...w, outposts }, stage, hash(today) + i + outposts.length * 7)];
  return { ...w, outposts, outpostDay: today };
}

