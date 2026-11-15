// Rival kingdoms, diplomacy, siege engines, campaigns and defence. Pure functions on WorldState.
import type { Res } from './rewards.ts';
import type { Assignment } from './assignments.ts';
import type { Court } from './politics.ts';
import type { Settlement } from './expansion.ts';
import { type Unit, type Terrain, sidePower } from './battle.ts';
import { TROOPS, type TClass } from './economy.ts';
import { nameFor, hash } from './names.ts';

export type Personality = 'aggressive' | 'mercantile' | 'honorable' | 'treacherous' | 'pious';
export type RStatus = 'neutral' | 'ally' | 'war' | 'vassal';
export interface Rival {
  id: string; name: string; ruler: string; personality: Personality; color: number; emblem: string;
  x: number; y: number; terrain: Terrain; level: number; power: number; garrison: number; wallMax: number;
  relation: number; status: RStatus; trades: number; lastTradeDay: string; bandits?: boolean; friends: string[]; foes: string[]; beaten?: number;
  /** false until your mapmakers have charted it (older saves: undefined = known) */
  known?: boolean;
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
/** Intelligence of a possible invasion. It may come to nothing: `chance` is how likely the attack is when `due` arrives. */
export interface Warning { id: string; rival: string; issued: string; due: string; chance: number; source: 'scouts' | 'spies' | 'merchants' | 'refugees'; text: string }
export interface Missive { id: string; rival: string; kind: 'tribute_demand' | 'trade_offer' | 'aid_request' | 'alliance_offer' | 'peace_offer' | 'news'; text: string; amount?: number; day: string }
export interface Loan { bat: string; rival: string; leftMin: number }
/** Minutes of study a lent battalion serves abroad before it marches home. */
export const LOAN_MIN = 60;
export interface Report { id: string; t: number; title: string; win: boolean; lines: string[]; you: number; foe: number; lostYou: number; lostFoe: number; loot?: Partial<Res> }
export type JourneyKind = 'envoy' | 'caravan' | 'gift' | 'aid' | 'army' | 'return' | 'reinforce' | 'raid' | 'explore';
/** Someone on the road between your kingdom and another. Effects apply when they arrive. */
/** `to` is set for places that are not a realm (bandit outposts); otherwise the journey runs to the rival's castle. */
export interface Journey { id: string; kind: JourneyKind; rival: string; depart: number; arrive: number; home?: boolean; label: string; bats?: string[]; data?: Record<string, unknown>; to?: { x: number; y: number } }
/** A small bandit camp on the road: easy prey with a small purse. */
export interface Outpost { id: string; name: string; x: number; y: number; power: number; loot: Res; biome: 'grassland' | 'forest' | 'highlands' | 'swamp' }
export interface WorldState { seed: number; lastDay: string; rivals: Rival[]; engines: Engines; supplies: number; campaign: Campaign | null; threat: Threat | null; inbox: Missive[]; loans: Loan[]; reports: Report[]; conquests: number; town?: { day: string; thefts: number; caught: number; events?: number }; journeys?: Journey[]; outposts?: Outpost[]; outpostDay?: string; warnings?: Warning[]; assignments?: Assignment[]; court?: Court; settlements?: Settlement[]; v?: number;
  /** until when the town celebrates a victory */ festival?: number;
  /** buildings damaged in a lost battle, shown blackened and smoking until `until` */ scars?: { ids: string[]; until: number } }

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
// ---------------- the wide world: distance, tiers, discovery ----------------
/** The map is this many times the width of your home region. Positions are fractions of the whole map. */
export const WORLD_SCALE = 2.6;
/** Distance from your castle in leagues (your old neighbours sit 0.3 to 0.45 away; the edge of the world about 1.25). */
export const leagues = (p: { x: number; y: number }) => Math.hypot((p.x - 0.5) * WORLD_SCALE, (p.y - 0.5) * WORLD_SCALE);
export type Tier = 'neighbour' | 'distant' | 'far';
/** The farther a kingdom, the less it has to do with you. */
export const tierOf = (r: Pick<Rival, 'x' | 'y' | 'bandits'>): Tier => (r.bandits || leagues(r) < 0.6 ? 'neighbour' : leagues(r) < 1.0 ? 'distant' : 'far');
export const TIER: Record<Tier, { name: string; desc: string; weight: number }> = {
  neighbour: { name: 'Neighbour', desc: 'On your borders: they trade, quarrel, ally and invade.', weight: 1 },
  distant: { name: 'Distant realm', desc: 'Days away: they deal with you now and then, and only march on you if at war.', weight: 0.45 },
  far: { name: 'Far kingdom', desc: 'At the edge of the world: great powers who barely notice you, for now.', weight: 0.15 },
};
export const isKnown = (r: Pick<Rival, 'known'>) => r.known !== false;
/** How far your mapmakers' knowledge reaches: grows with your castle, your settlements, allies and vassals. */
export const reachOf = (stage: number, settlements = 0) => 0.6 + 0.1 * (Math.max(1, stage) - 1) + 0.03 * settlements;
/** Charts kingdoms within reach, and those near your allies and vassals (who share their maps). */
export function discover(w: WorldState, stage: number, settlements = 0): { w: WorldState; found: Rival[] } {
  const reach = reachOf(stage, settlements), friends = w.rivals.filter((r) => isKnown(r) && (r.status === 'ally' || r.status === 'vassal')), found: Rival[] = [];
  const rivals = w.rivals.map((r) => {
    if (isKnown(r)) return r;
    if (leagues(r) <= reach || friends.some((f) => Math.hypot((f.x - r.x) * WORLD_SCALE, (f.y - r.y) * WORLD_SCALE) < 0.5)) { const k = { ...r, known: true }; found.push(k); return k; }
    return r;
  });
  return found.length ? { w: { ...w, rivals }, found } : { w, found };
}
const MORE_NAMES = ['Aldermoor', 'Brennhall', 'Caer Lowen', 'Dravensfeld', 'Eldmark', 'Frosthaven', 'Galvorn', 'Harrowgate', 'Isenwald', 'Jorvik', 'Kestrelmount', 'Lyonesse', 'Marrowdeep', 'Northmere', 'Ostervald', 'Penmarch', 'Quellmoor', 'Ravenspire', 'Sundermere', 'Tamsk', 'Umberfall', 'Varrowmoor', 'Wyrmhold', 'Ystrad'];
const MORE_COLORS = [0x5a7a2a, 0x2a6a8a, 0x8a5a2a, 0x6a2a5a, 0x2a2a7a, 0x9a3a2a, 0x3a7a6a, 0x7a6a2a, 0x5a3a8a, 0x8a2a3a, 0x2a5a4a, 0x6a6a6a, 0x9a6a3a, 0x3a4a7a];
const MORE_EMBLEMS = ['griffin', 'crown', 'lion', 'sword', 'eagle', 'stag', 'tower', 'cross', 'dragon', 'star'];
const PERS_ALL: Personality[] = ['aggressive', 'mercantile', 'honorable', 'treacherous', 'pious'];
/** Kingdoms beyond your old horizon: a ring of distant realms and a ring of far, older, richer powers. */
function wideKingdoms(seed: number, existing: Rival[]): Rival[] {
  const R = rng(seed * 7 + 991), used = new Set(existing.map((r) => r.name)), names = MORE_NAMES.filter((n) => !used.has(n)).sort(() => R() - 0.5), out: Rival[] = [];
  const all = () => [...existing, ...out];
  const ring = (n: number, d0: number, d1: number, l0: number, l1: number) => {
    const turn = R() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let t = 0; t < 30; t++) { // keep realms apart and on the map
        const a = turn + (i / n) * Math.PI * 2 + (R() - 0.5) * 0.5, d = (d0 + R() * (d1 - d0)) / WORLD_SCALE;
        x = Math.min(0.94, Math.max(0.06, 0.5 + Math.cos(a) * d)); y = Math.min(0.92, Math.max(0.08, 0.5 + Math.sin(a) * d * 0.95));
        if (all().every((r) => Math.hypot((r.x - x) * WORLD_SCALE, (r.y - y) * WORLD_SCALE) > 0.28)) break;
      }
      const k = out.length, name = names[k % names.length], level = Math.min(5, l0 + Math.floor(R() * (l1 - l0 + 1))), pers = PERS_ALL[Math.floor(R() * PERS_ALL.length)];
      const power = Math.round(120 * level ** 2.2 * (0.9 + R() * 0.7));
      out.push({ id: 'w' + k, name, ruler: nameFor(name + seed), personality: pers, color: MORE_COLORS[k % MORE_COLORS.length], emblem: MORE_EMBLEMS[k % MORE_EMBLEMS.length], x, y,
        terrain: TERRAINS[Math.floor(R() * TERRAINS.length)], level, power, garrison: Math.round(power * 0.4), wallMax: Math.round(200 * level ** 1.5),
        relation: Math.round(BASE[pers] * 0.5 + R() * 10 - 5), status: 'neutral', trades: 0, lastTradeDay: '', friends: [], foes: [], known: false });
    }
  };
  ring(6, 0.66, 0.95, 2, 4); ring(8, 1.02, 1.25, 3, 5);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const v = R(); if (v < 0.18) { out[i].friends.push(out[j].id); out[j].friends.push(out[i].id); } else if (v > 0.85) { out[i].foes.push(out[j].id); out[j].foes.push(out[i].id); } }
  return out;
}
/** Version 2: the world grows. Your old region shrinks to the middle of a far larger map (distances in leagues stay the same) and new kingdoms appear beyond it. */
export function upgradeWorld(w: WorldState): WorldState {
  if ((w.v ?? 1) >= 2) return w;
  const sc = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: 0.5 + (p.x - 0.5) / WORLD_SCALE, y: 0.5 + (p.y - 0.5) / WORLD_SCALE });
  const rivals = w.rivals.map((r) => ({ ...sc(r), known: true }));
  return { ...w, v: 2, rivals: [...rivals, ...wideKingdoms(w.seed, rivals)], outposts: w.outposts?.map(sc), journeys: w.journeys?.map((j) => (j.to ? { ...j, to: sc(j.to) } : j)) };
}

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
  return upgradeWorld({ seed, lastDay: dayStr(), rivals, engines: { ...NO_ENGINES }, supplies: 50, campaign: null, threat: null, inbox: [], loans: [], reports: [], conquests: 0 });
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
    r.relation = clamp(Math.round(r.relation + Math.sign(base - r.relation) * Math.min(tierOf(r) === 'far' ? 1 : 2, Math.abs(base - r.relation)))); // far kingdoms barely think of you
    if (r.personality === 'treacherous' && R() < 0.3) r.relation = clamp(r.relation - 3);
    r.power = Math.round(r.power * (1 + (r.personality === 'aggressive' ? 0.015 : 0.008)) + (r.bandits ? 2 : 0));
    r.garrison = Math.max(r.garrison, Math.round(r.power * 0.4));
    if (r.status === 'ally' && r.relation < 30) r.status = 'neutral';
  }
  // a lord who neglects their studies looks weak: warlike neighbours grow bolder each idle day past the grace period
  const n = ctx.neglect ?? 0;
  if (n > 0) for (const r of out.rivals) if (!r.bandits && isKnown(r) && tierOf(r) !== 'far' && r.status !== 'vassal' && r.status !== 'ally' && (r.personality === 'aggressive' || r.personality === 'treacherous')) r.relation = clamp(r.relation - Math.min(12, 3 * n) * TIER[tierOf(r)].weight);
  if (!ctx.active) return out;
  if (n > 0) {
    const foe = out.rivals.filter((r) => !r.bandits && isKnown(r) && tierOf(r) === 'neighbour' && r.status !== 'vassal' && r.status !== 'ally').sort((a, b) => a.relation - b.relation)[0];
    if (foe) out.inbox.push({ id: `${today}-neglect`, rival: foe.id, kind: 'news', day: today, text: n >= 3
      ? `${foe.ruler} of ${foe.name} writes: "Your halls fall silent and your scholars idle. Study, or we will come for your lands."`
      : `Word spreads that your studies have lapsed. ${foe.name} watches your borders with interest.` });
  }
  // diplomatic events (only processed when the player is actually present)
  for (const r of out.rivals.filter((x) => !x.bandits && x.status !== 'vassal' && isKnown(x))) {
    const tier = tierOf(r), roll = R() / TIER[tier].weight, id = `${today}-${r.id}`; // the farther they are, the rarer their letters
    if (r.status === 'ally' && roll < 0.15) out.inbox.push({ id, rival: r.id, kind: 'aid_request', text: `${r.name} asks for troops against their enemies.`, day: today });
    else if (r.personality === 'mercantile' && r.relation > 0 && roll < 0.25) out.inbox.push({ id, rival: r.id, kind: 'trade_offer', text: `${r.name} offers a favourable trade.`, amount: 200 + r.level * 100, day: today });
    else if (r.relation >= 60 && r.status === 'neutral' && roll < 0.3) out.inbox.push({ id, rival: r.id, kind: 'alliance_offer', text: `${r.ruler} of ${r.name} proposes an alliance.`, day: today });
    else if (tier === 'neighbour' && r.personality === 'aggressive' && r.relation < 0 && r.power > ctx.myPower && roll < 0.2) out.inbox.push({ id, rival: r.id, kind: 'tribute_demand', text: `${r.name} demands tribute.`, amount: Math.round(100 * r.level + ctx.stage * 80), day: today });
  }
  // invasions come with warning: scouts and spies report hosts gathering; some reports come to nothing
  let warnings = (out.warnings ?? []).filter((x) => x.due >= dayStr(new Date(now.getTime() - 2 * 864e5)));
  for (const wr of warnings.filter((x) => x.due <= today)) {
    const foe = out.rivals.find((r) => r.id === wr.rival); if (!foe) continue;
    // a gift or treaty since the warning can stay their hand; strong walls and a fearsome host deter them
    const calm = foe.status === 'ally' || foe.status === 'vassal' ? 0 : foe.relation > -20 ? 0.4 : 1, p = wr.chance * calm * (ctx.fort > 0.5 ? 0.85 : 1);
    if (!out.threat && !out.campaign && R() < p) {
      out.threat = { rival: foe.id, power: Math.round(foe.power * 0.6), since: Date.now(), allyHelp: [] }; foe.status = 'war';
      out.inbox.push({ id: `${today}-siege`, rival: foe.id, kind: 'news', text: `The warning was true: ${foe.name} marches on your castle! Their host surrounds your walls.`, day: today });
    } else out.inbox.push({ id: `${today}-calm-${foe.id}`, rival: foe.id, kind: 'news', text: calm < 1 ? `${foe.name}'s host has stood down. Your diplomacy kept the peace.` : `False alarm: ${foe.name}'s host turned back from your border.`, day: today });
  }
  warnings = warnings.filter((x) => x.due > today);
  if (!out.threat && !out.campaign) {
    // the real danger: a kingdom at odds with you (only once you are a fortress), or one that truly hates you
    const reachable = (r: Rival) => isKnown(r) && (tierOf(r) === 'neighbour' || (tierOf(r) === 'distant' && r.status === 'war')); // far kingdoms do not march across the world for you
    const angry = out.rivals.filter((r) => !r.bandits && reachable(r) && r.status !== 'vassal' && r.status !== 'ally' && !warnings.some((x) => x.rival === r.id) && (r.relation <= -50 || (ctx.stage >= 4 && (r.status === 'war' || (r.personality === 'aggressive' && r.relation < -20)))));
    const foe = angry.sort((a, b) => a.relation - b.relation)[0];
    if (foe && R() < (foe.personality === 'aggressive' ? 0.45 : 0.3)) {
      if (R() < 0.06) { // rarely, no one sees them coming
        out.threat = { rival: foe.id, power: Math.round(foe.power * 0.6), since: Date.now(), allyHelp: [] }; foe.status = 'war';
        out.inbox.push({ id: `${today}-siege`, rival: foe.id, kind: 'news', text: `Without warning, ${foe.name} marches on your castle! Their host surrounds your walls.`, day: today });
      } else warnings.push(warning(foe, today, 0.45 + R() * 0.4, R));
    }
    // rumours: some reports are about kingdoms that merely mistrust you
    const uneasy = out.rivals.filter((r) => !r.bandits && reachable(r) && r.status !== 'vassal' && r.status !== 'ally' && r.relation < 10 && !warnings.some((x) => x.rival === r.id));
    if (uneasy.length && R() < 0.12) warnings.push(warning(uneasy[Math.floor(R() * uneasy.length)], today, 0.1 + R() * 0.2, R));
  }
  for (const wr of warnings) if (wr.issued === today && !(w.warnings ?? []).some((x) => x.id === wr.id)) out.inbox.push({ id: `${wr.id}-news`, rival: wr.rival, kind: 'news', text: wr.text, day: today });
  out.warnings = warnings;
  // news from afar: the wide world goes on without you, and hints at what lies beyond your maps
  if (R() < 0.3) {
    const far = out.rivals.filter((r) => !r.bandits && tierOf(r) !== 'neighbour'), r = far[Math.floor(R() * far.length)];
    if (r) {
      const dir = (r.y < 0.4 ? 'north' : r.y > 0.6 ? 'south' : '') + (r.x < 0.4 ? 'west' : r.x > 0.6 ? 'east' : ''), foe = out.rivals.find((x) => r.foes.includes(x.id) && isKnown(x));
      const text = !isKnown(r) ? `Travellers speak of a great kingdom far to the ${dir || 'distance'}, beyond your maps. Grow your realm, or send an expedition, to find it.`
        : foe && R() < 0.5 ? `News from afar: ${r.name} and ${foe.name} skirmish along their border.`
        : R() < 0.5 ? `News from afar: ${r.name} raises new towers; ${r.ruler} grows ever stronger.` : `A merchant from ${r.name} tells of their markets and their king, ${r.ruler}.`;
      if (isKnown(r)) r.power = Math.round(r.power * 1.01);
      out.inbox.push({ id: `${today}-afar`, rival: r.id, kind: 'news', day: today, text });
    }
  }
  return out;
}

const SOURCES: Warning['source'][] = ['scouts', 'spies', 'merchants', 'refugees'];
/** How sure the realm is of a report, in words. */
export const likelihood = (p: number) => (p >= 0.7 ? 'very likely' : p >= 0.5 ? 'likely' : p >= 0.3 ? 'possible' : 'doubtful');
function warning(foe: Rival, today: string, chance: number, R: () => number): Warning {
  const src = SOURCES[Math.floor(R() * SOURCES.length)], inDays = 1 + Math.floor(R() * 2), due = dayStr(new Date(new Date(today).getTime() + inDays * 864e5));
  const what = { scouts: `Scouts report ${foe.name}'s banners gathering on the border`, spies: `A spy in ${foe.name} whispers that ${foe.ruler} plans an invasion`, merchants: `Merchants say ${foe.name} is buying up grain and spears`, refugees: `Villagers flee ahead of ${foe.name}'s riders` }[src];
  return { id: `warn-${today}-${foe.id}`, rival: foe.id, issued: today, due, chance: Math.round(chance * 100) / 100, source: src, text: `${what}. An attack is ${likelihood(chance)} within ${inDays === 1 ? 'a day' : `${inDays} days`}.` };
}

// ---------------- diplomacy ----------------
const VALUE: Record<keyof Res, number> = { gold: 1, wood: 1.5, stone: 2.5, renown: 10 };
export const valueOf = (r: Partial<Res>) => (Object.keys(r) as (keyof Res)[]).reduce((a, k) => a + (r[k] ?? 0) * VALUE[k], 0);
/** Trade: give one resource, receive another at a rate that improves with relations and merchants. */
export function tradeQuote(r: Rival, give: keyof Res, amount: number, want: keyof Res, bonus = 0) {
  const rate = 0.75 + Math.max(0, r.relation) / 400 + (r.personality === 'mercantile' ? 0.15 : 0) + (r.status === 'ally' ? 0.05 : 0) + bonus - Math.max(0, leagues(r) - 0.6) * 0.15; // goods carried far cost more
  const got = Math.floor((amount * VALUE[give] * rate) / VALUE[want]);
  const rel = Math.min(8, 1 + Math.round((amount * VALUE[give]) / (150 * r.level)));
  return { got, rel, rate };
}
export function canTrade(r: Rival, today = dayStr()) {
  if (r.bandits) return 'Bandits do not trade';
  if (r.known === false) return 'You have not charted their lands';
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
  const d = leagues(r);
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
/** A realm's strength for its spoils: its army, but never less than its castle's size (beating their field army first does not shrink the prize). */
export const strengthOf = (r: Pick<Rival, 'level' | 'power'>) => Math.max(r.power, 120 * lv(r) ** 2.2 * 0.8);
/** Winning the field battle before a siege: renown and a share of their baggage, more for a stronger realm. */
export const fieldSpoils = (r: Pick<Rival, 'level' | 'power'>): Res => { const p = strengthOf(r); return { gold: Math.round(p * 0.4), wood: 0, stone: 0, renown: Math.round(6 + p / 50) }; };
/** Taking the castle by assault or surrender: its treasury, timber and quarried stone; great powers are rich prizes. */
export const conquestSpoils = (r: Pick<Rival, 'level' | 'power'>): Res => { const p = strengthOf(r); return { gold: Math.round(p * 2.2), wood: Math.round(p * 0.4), stone: Math.round(p * 0.6), renown: Math.round(30 + p / 15) }; };
/** Breaking an enemy host that attacks your castle: the stronger the attacker, the richer its abandoned camp. */
export const defenceSpoils = (r: Pick<Rival, 'level' | 'power'>): Res => { const p = strengthOf(r); return { gold: Math.round(p * 0.5), wood: 0, stone: 0, renown: Math.round(10 + p / 40) }; };
/** Lasting tribute from each vassal, applied to every study session: a greater realm pays more (4% gold at castle level 1, 8% at level 5). */
export const vassalGold = (r: Pick<Rival, 'level'>) => 0.03 + 0.01 * lv(r), vassalRenown = (r: Pick<Rival, 'level'>) => 0.01 + 0.004 * lv(r);
export const VASSAL_GOLD_MAX = 0.4;

// ---------------- bandit outposts ----------------
const OUTPOST_NAMES = ['Cutthroat Camp', 'Wolf Hollow', 'Raven Rock', 'Smugglers\' Ford', 'Black Thicket', 'Gallows Hill', 'Rat\'s Nest', 'Old Mill Hideout', 'Crooked Bridge', 'Poacher\'s Den', 'Thieves\' Copse', 'Broken Tower'];
/** How many outposts a realm at this stage has to deal with. */
export const outpostCap = (stage: number) => 2 + Math.min(2, Math.floor(stage / 2));
/** A new outpost along the road to a random realm; small, and stronger (with a fatter purse) as your kingdom grows. */
export function newOutpost(w: Pick<WorldState, 'rivals' | 'outposts' | 'seed'>, stage: number, salt: number): Outpost {
  const near = w.rivals.filter((r) => leagues(r) < 0.7), R = rng(hash(`${w.seed}:${salt}`)), rv = near[Math.floor(R() * near.length)] ?? { x: 0.6, y: 0.45 };
  const t = 0.35 + R() * 0.3, nx = -(rv.y - 0.5), ny = rv.x - 0.5, j = (R() - 0.5) * 0.25; // along the road to a neighbour
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

