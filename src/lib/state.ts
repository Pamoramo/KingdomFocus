import { type Res, ZERO, DEFAULT_RATES, MANUAL_FACTOR, MANUAL_MAX_PER_DAY_MIN, add, sub, maxRes, canAfford, full, scale, studyReward, isZero, ceilingFor, minRes, workReward } from './rewards.ts';
import { type Session, type SessionCfg, DEFAULT_CFG, startSession, tick, checkIn, pause, takeBreak, endSession, uid, MIN } from './study.ts';
import { type Habit, type Freq, progress, streak, habitReward, MILESTONES, dayKey, periodKey } from './habits.ts';
import { BUILDINGS, TROOPS, TECHS, STAGES, RANKS, OFFICERS, SQUAD_SIZE, SQUADS_PER_COMPANY, TCLASSES, XP_PER_MIN, DRILL_XP, COLORS, type BKind, type TClass, type TechId, type Effects, type Formation, type Req } from './economy.ts';
import { nameFor } from './names.ts';
import type { Biome } from './realms.ts';
import { traitsFor, has as hasTrait, type TraitId } from './commanders.ts';
import { courtOf, courtFx } from './politics.ts';
import { sitesFor, settlementFx } from './expansion.ts';
import { type WorldState, type Engines, initWorld, vassalGold, vassalRenown, VASSAL_GOLD_MAX, GARRISON_TRIBUTE, travelMs, type Journey } from './war.ts';
import type { Unit, BattleResult } from './battle.ts';

// ---------------- types ----------------
export interface Building { id: string; kind: BKind; x: number; y: number; level: number; at: number }
/** traits/wins/battles/honors are optional so older saves load; traits default from the seed (see commanders.ts). */
export interface Commander { name: string; rank: number; seed: string; traits?: TraitId[]; wins?: number; battles?: number; honors?: number }
export type Orders = 'formation' | 'patrol' | 'garrison';
export interface Battalion { id: string; name: string; army: string; color: number; emblem: string; formation: Formation; orders?: Orders; x: number; y: number; commander: Commander }
export interface Squad { id: string; cls: TClass; count: number; xp: number; rank: number; bat: string }
export type Source = 'timer' | 'pomodoro' | 'manual';
export interface StudyRecord { id: string; subject: string; source: Source; startedAt: number; endedAt: number | null; verifiedSec: number; forfeitedSec: number; checkIns: number; missed: number; notes: string; reward: Res }
export interface Completion { id: string; habitId: string; period: string; count: number; done: boolean; at: number; note?: string }
export type LedgerKind = 'start' | 'study' | 'manual' | 'habit' | 'milestone' | 'achievement' | 'spend' | 'refund' | 'trade' | 'loot';
export interface Ledger { kind: LedgerKind; ref: string; amt: Res; at: number }
export interface KEvent { id: string; t: number; type: string; text: string; n?: number }
export type Table = 'buildings' | 'battalions' | 'squads' | 'habits' | 'sessions' | 'completions';
/** hiddenSubjects: subjects you removed (the cloud keeps every subject ever used, so removals are remembered here). */
export interface Settings { /** activities for the productive-time timer */ workTasks?: string[]; hiddenSubjects?: string[]; ambVol?: number; rates: Res; cfg: SessionCfg; sound: boolean; requireNote: boolean; theme: string; dayNight: 'auto' | 'day' | 'night'; notify: boolean; music: number; sfx: number; ambience: boolean }
export interface GameState {
  v: 2; owner: string | null; updatedAt: number; res: Res; lifetime: Res;
  buildings: Building[]; battalions: Battalion[]; squads: Squad[]; techs: TechId[];
  session: (Session & { xpMs: number; source: Source }) | null; sessions: StudyRecord[]; subjects: string[];
  /** the productive-time timer (chores, exercise, work...): a separate, lesser-paying session */ work?: (Session & { xpMs: number; source: Source }) | null;
  habits: Habit[]; completions: Completion[]; achievements: string[]; events: KEvent[]; stage: number; world: WorldState;
  settings: Settings;
  outbox: { ledger: Ledger[]; dirty: Partial<Record<Table, string[]>>; dead: Partial<Record<Table, string[]>>; events: string[]; techs: boolean };
}

export const MAP_W = 96, MAP_H = 72, TILE = 16;
export const CAMP_X = 40, CAMP_Y = 34;

export function newGame(): GameState {
  const now = Date.now(), start: Res = { gold: 150, wood: 80, stone: 0, renown: 0 }, camp = uid();
  return {
    v: 2, owner: null, updatedAt: now, res: { ...start }, lifetime: { ...ZERO },
    buildings: [{ id: camp, kind: 'camp', x: CAMP_X, y: CAMP_Y, level: 1, at: now }],
    battalions: [], squads: [], techs: [],
    session: null, work: null, sessions: [], subjects: ['Mathematics', 'Languages', 'Science', 'History', 'Programming', 'Reading'],
    habits: [], completions: [], achievements: [], events: [{ id: uid(), t: now, type: 'stage', text: 'A lonely camp is pitched on barren land.' }], stage: 1,
    settings: { rates: { ...DEFAULT_RATES }, cfg: { ...DEFAULT_CFG }, sound: true, requireNote: false, theme: 'parchment', dayNight: 'auto', notify: true, music: 0.5, sfx: 0.7, ambience: true },
    world: initWorld(now % 100000),
    outbox: { ledger: [{ kind: 'start', ref: 'start', amt: start, at: now }], dirty: { buildings: [camp] }, dead: {}, events: [], techs: false },
  };
}

// ---------------- store ----------------
type L = () => void;
let state: GameState = newGame();
const listeners = new Set<L>();
export const fxBus = new EventTarget();
/** Where a battle is fought: the biome, and which side (0 = left, 1 = right) holds walls of stone or a palisade. */
export interface BattleSite { biome: Biome; walls?: { side: 0 | 1; kind: 'wall' | 'palisade' }; cry?: string }
export interface BattlePlay { title: string; a: Unit[]; b: Unit[]; result: BattleResult; aName: string; bName: string; aColor: number; bColor: number; engines?: Engines; site?: BattleSite }
export type Fx = { kind: 'reward' | 'build' | 'error' | 'info' | 'achieve' | 'stage' | 'promote' | 'battle' | 'war'; text: string; res?: Partial<Res>; x?: number; y?: number; id?: string; big?: boolean; battle?: BattlePlay };
export const emit = (fx: Fx) => fxBus.dispatchEvent(new CustomEvent('fx', { detail: fx }));
export const getState = () => state;
export const subscribe = (l: L) => (listeners.add(l), () => { listeners.delete(l); });
export function setState(next: GameState, touch = true) { state = touch ? { ...next, updatedAt: Date.now() } : next; listeners.forEach((l) => l()); }

/** Extra effects of verified study minutes (siege days, supplies, loans), registered by war actions. */
export const studyHooks: ((s: GameState, minutes: number) => GameState)[] = [];
/** Runs a pure transition; strings are user-facing errors. */
function update(fn: (s: GameState) => GameState | string | void): string | null {
  const r = fn(state);
  if (typeof r === 'string') { emit({ kind: 'error', text: r }); return r; }
  if (r) setState(post(r));
  return null;
}
/** Test hook: run actions against an explicit state. */
export function _with(s: GameState) { state = s; }

// ---------------- bookkeeping helpers ----------------
const mark = (s: GameState, t: Table, id: string): GameState => ({ ...s, outbox: { ...s.outbox, dirty: { ...s.outbox.dirty, [t]: [...new Set([...(s.outbox.dirty[t] ?? []), id])] } } });
const kill = (s: GameState, t: Table, id: string): GameState => ({ ...s, outbox: { ...s.outbox, dead: { ...s.outbox.dead, [t]: [...(s.outbox.dead[t] ?? []), id] } } });
function event(s: GameState, type: string, text: string, n?: number): GameState {
  const e = { id: uid(), t: Date.now(), type, text, n };
  return { ...s, events: [e, ...s.events].slice(0, 1500), outbox: { ...s.outbox, events: [...s.outbox.events, e.id] } };
}
/** Every resource change is a ledger entry (synced idempotently by kind+ref). */
function ledger(s: GameState, kind: LedgerKind, ref: string, amt: Res): GameState {
  if (isZero(amt)) return s;
  const gain = kind !== 'spend';
  return {
    ...s, res: add(s.res, amt), lifetime: gain ? add(s.lifetime, amt) : s.lifetime,
    outbox: { ...s.outbox, ledger: [...s.outbox.ledger, { kind, ref, amt, at: Date.now() }] },
  };
}
const spend = (s: GameState, cost: Partial<Res>, n = 1) => ledger(s, 'spend', uid(), scale(cost, -n));
/** Study rewards are cumulative per session: one ledger row per session, only ever increased. */
function studyLedger(s: GameState, kind: 'study' | 'manual', ref: string, total: Res, prev: Res): GameState {
  const delta = sub(maxRes(total, prev), prev);
  if (isZero(delta)) return s;
  const others = s.outbox.ledger.filter((l) => !(l.kind === kind && l.ref === ref));
  return { ...s, res: add(s.res, delta), lifetime: add(s.lifetime, delta), outbox: { ...s.outbox, ledger: [...others, { kind, ref, amt: maxRes(total, prev), at: Date.now() }] } };
}

// ---------------- derived ----------------
export const count = (s: GameState, k: BKind) => s.buildings.filter((b) => b.kind === k).length;
export const maxLevel = (s: GameState, k: BKind) => s.buildings.reduce((m, b) => (b.kind === k ? Math.max(m, b.level) : m), 0);
export const has = (s: GameState, t?: TechId) => !t || s.techs.includes(t);
export function effects(s: GameState): Required<Effects> {
  const e = { cap: 0, gold: 0, wood: 0, stone: 0, renown: 0, xp: 0, green: 0, discount: 0 };
  for (const b of s.buildings) { const f = BUILDINGS[b.kind].fx(b.level); for (const k of Object.keys(f) as (keyof Effects)[]) if (k !== 'green') e[k] += f[k] ?? 0; }
  if (has(s, 'veterancy')) e.xp += 0.25;
  e.discount = Math.min(0.3, e.discount);
  if (s.world) { const st = settlementFx(s.world.settlements, sitesFor(s.world.seed, s.world.rivals)); e.cap = Math.round((e.cap + st.cap) * (1 + courtFx(courtOf(s.world)).cap)); }
  return e;
}
export const armyCap = (s: GameState) => effects(s).cap;
export const armySize = (s: GameState) => s.squads.reduce((a, q) => a + q.count, 0);
export const batSize = (s: GameState, id: string) => s.squads.reduce((a, q) => (q.bat === id ? a + q.count : a), 0);
/** Days of rest that never cost anything. */
export const GRACE_DAYS = 2;
/** Whole days since the last day with verified study (or since the kingdom was founded). */
export function idleDays(s: GameState, now = Date.now()) {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const studied = s.sessions.filter((r) => r.verifiedSec >= 300 && !isWork(r)).map((r) => r.endedAt ?? r.startedAt);
  const founded = Math.min(...s.events.map((e) => e.t), now);
  const last = Math.max(founded, ...studied, s.session && s.session.verifiedMs > 0 ? now : 0);
  return Math.max(0, Math.round((day(now) - day(last)) / 864e5));
}
/** Neglect beyond the grace period: 0 while you study regularly, then 1, 2, 3... */
export const neglect = (s: GameState, now = Date.now()) => Math.max(0, idleDays(s, now) - GRACE_DAYS);
/** Soldiers on duty (patrol or garrison) at most this many per battalion. */
export const DUTY_CAP = 24;
// ---------------- quarters: where soldiers off duty live ----------------
/** Beds for soldiers off duty: barracks, guardhouses, the keep and great hall, the palace, and tents at the old camp. */
export const quartersCap = (s: GameState) => s.buildings.reduce((a, b) => a + (b.kind === 'barracks' ? 40 * b.level : b.kind === 'guardhouse' ? 12 * b.level : b.kind === 'greathall' ? 25 * b.level : b.kind === 'keep' ? 8 * b.level : b.kind === 'palace' ? 40 : b.kind === 'camp' ? 16 : 0), 0);
/** Battalions away from home (campaign, loans, garrisons abroad, on the road). */
export const awayOf = (s: GameState) => new Set([...(s.world?.campaign?.battalions ?? []), ...(s.world?.loans ?? []).map((l) => l.bat), ...(s.world?.garrisons ?? []).map((g) => g.bat), ...(s.world?.journeys ?? []).flatMap((j) => j.bats ?? [])]);
export const inQuarters = (s: GameState, id: string) => (s.world?.quartered ?? []).includes(id);
/** How many of each battalion's soldiers are off duty in quarters, while beds last: battalions sent to quarters first,
 *  then the men a patrol or garrison does not need on duty. Whoever finds no bed stands in formation. */
export function quarterPlan(s: GameState): { per: Map<string, number>; used: number; cap: number; wanting: number } {
  const away = awayOf(s), cap = quartersCap(s), per = new Map<string, number>(); let left = cap, wanting = 0;
  const home = s.battalions.filter((b) => !away.has(b.id));
  const want = (b: Battalion) => { const n = batSize(s, b.id); return inQuarters(s, b.id) ? n : b.orders && b.orders !== 'formation' ? Math.max(0, n - DUTY_CAP) : 0; };
  for (const b of [...home.filter((b) => inQuarters(s, b.id)), ...home.filter((b) => !inQuarters(s, b.id))]) { const w = want(b); if (!w) continue; const got = Math.min(w, left); left -= got; wanting += w - got; if (got) per.set(b.id, got); }
  return { per, used: cap - left, cap, wanting };
}
/** Give a battalion its orders: hold formation, patrol, garrison, or rest in quarters (where they drill between duties). */
export const setOrders = (id: string, o: Orders | 'quarters') => update((s) => {
  const q = (s.world.quartered ?? []).filter((x) => x !== id), w = { ...s.world, quartered: o === 'quarters' ? [...q, id] : q };
  return mark({ ...s, world: w, battalions: s.battalions.map((b) => (b.id === id ? { ...b, orders: o === 'quarters' ? 'formation' : o } : b)) }, 'battalions', id);
});
/** Town order: guards on duty versus what the population needs. */
export function townOrder(s: GameState) {
  const pop = s.buildings.reduce((a, b) => a + (b.kind === 'hut' ? 3 * b.level : b.kind === 'house' ? 6 * b.level : b.kind === 'market' ? 10 * b.level : b.kind === 'farm' ? 2 : 0), 0);
  const away = new Set([...(s.world?.campaign?.battalions ?? []), ...(s.world?.loans ?? []).map((l) => l.bat)]);
  const guards = s.battalions.filter((b) => b.orders && b.orders !== 'formation' && !away.has(b.id)).reduce((a, b) => a + Math.min(DUTY_CAP, batSize(s, b.id)), 0);
  const needed = 2 + Math.floor(pop / 12);
  return { pop, guards, needed, ratio: guards / needed };
}
/** Study multipliers: buildings, vassal tribute (+5% gold each, max 30%), and an enemy blockade (-25% gold). */
export const studyMult = (s: GameState): Res => {
  const e = effects(s), w = s.world, vs = w ? w.rivals.filter((r) => r.status === 'vassal') : [], tribute = vs.reduce((t, r) => t + vassalGold(r) * ((w.garrisons ?? []).some((g) => g.at === r.id) ? 1 + GARRISON_TRIBUTE : 1), 0), tributeRenown = vs.reduce((t, r) => t + vassalRenown(r), 0);
  const safe = townOrder(s).ratio >= 1 && townOrder(s).needed > 2 ? 0.03 : 0;
  // the court's decrees and moods, and the settlements you hold
  const c = w ? courtFx(courtOf(w)) : null, st = w ? settlementFx(w.settlements, sitesFor(w.seed, w.rivals)) : null;
  return { gold: Math.max(0.5, 1 + e.gold + safe + Math.min(VASSAL_GOLD_MAX, tribute) - (w?.threat ? 0.25 : 0) + (c?.gold ?? 0) + (st?.gold ?? 0)), wood: 1 + e.wood + (st?.wood ?? 0), stone: 1 + e.stone + (st?.stone ?? 0), renown: Math.max(0.5, 1 + e.renown + tributeRenown + (c?.renown ?? 0) + (st?.renown ?? 0)) };
};
export function costOf(s: GameState, kind: BKind, lvlIdx: number): Res {
  const d = BUILDINGS[kind], c = full(d.levels[lvlIdx].cost);
  return d.cat === 'castle' ? scale(c, 1 - effects(s).discount) : c;
}
export function reqMet(s: GameState, r: Req) {
  if (r.troops) return armySize(s) >= r.troops;
  const k = r.kind!;
  if (r.level) return maxLevel(s, k) >= r.level;
  return count(s, k) >= (r.count ?? 1);
}
export const computeStage = (s: GameState) => { let st = 1; for (let i = 1; i < STAGES.length; i++) { if (STAGES[i].reqs.every((r) => reqMet(s, r))) st = i + 1; else break; } return st; };
/** Why a building level can't be built yet (null = ok). */
export function lockReason(s: GameState, kind: BKind, lvlIdx: number): string | null {
  const d = BUILDINGS[kind], l = d.levels[lvlIdx];
  const stage = Math.max(d.stage, l.stage ?? 0), tech = l.tech ?? (lvlIdx === 0 ? d.tech : undefined);
  if (s.stage < stage) return `Requires stage ${stage}: ${STAGES[stage - 1].name}`;
  if (tech && !has(s, tech)) return `Requires ${TECHS[tech].name}`;
  if (lvlIdx === 0 && d.tech && !has(s, d.tech)) return `Requires ${TECHS[d.tech].name}`;
  return null;
}
export function troopLock(s: GameState, c: TClass): string | null {
  const d = TROOPS[c];
  for (const t of d.tech ?? []) if (!has(s, t)) return `Requires ${TECHS[t].name}`;
  for (const [k, l] of Object.entries(d.req)) if (maxLevel(s, k as BKind) < l!) return `Requires ${BUILDINGS[k as BKind].levels[l! - 1].name}`;
  return null;
}
export function rankLock(s: GameState, rank: number): string | null {
  const r = RANKS[rank]?.req; if (!r) return null;
  if (r.kind && !count(s, r.kind)) return `Requires ${r.label}`;
  if (r.tech && !has(s, r.tech)) return `Requires ${r.label}`;
  return null;
}
export const kingdomScore = (s: GameState) => Math.floor(s.buildings.reduce((a, b) => a + BUILDINGS[b.kind].levels.slice(0, b.level).reduce((x, l) => x + (l.cost.gold ?? 0), 0), 0) / 100 + s.squads.reduce((a, q) => a + q.count * TROOPS[q.cls].power * (1 + q.rank * 0.5), 0));
export const kingdomLevel = (s: GameState) => 1 + Math.floor(Math.sqrt(kingdomScore(s) / 20));

// ---------------- placement ----------------
export const RIVER = (() => { // deterministic winding river: x-range per row
  const rows: [number, number][] = [];
  for (let y = 0; y < MAP_H; y++) { const c = 80 + Math.round(Math.sin(y / 9) * 4 + Math.sin(y / 4.3) * 1.5); rows.push([c - 1, c + 1]); }
  return rows;
})();
export const isRiver = (x: number, y: number) => y >= 0 && y < MAP_H && x >= RIVER[y][0] && x <= RIVER[y][1];
export const footprint = (k: BKind) => [BUILDINGS[k].w, BUILDINGS[k].h] as const;
export function canPlace(s: GameState, kind: BKind, x: number, y: number, ignore?: string) {
  const [w, h] = footprint(kind);
  if (x < 1 || y < 2 || x + w > MAP_W - 1 || y + h > MAP_H - 1) return false;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (isRiver(x + i, y + j) && kind !== 'road') return false;
  return !s.buildings.some((b) => {
    if (b.id === ignore) return false;
    const [bw, bh] = footprint(b.kind);
    return x < b.x + bw && x + w > b.x && y < b.y + bh && y + h > b.y;
  });
}
const center = (b: { kind: BKind; x: number; y: number }) => { const [w, h] = footprint(b.kind); return { x: (b.x + w / 2) * TILE, y: (b.y + h / 2) * TILE }; };

// ---------------- construction ----------------
/** Building kinds the signed-in account's cloud database cannot store yet (it needs supabase/setup.sql re-run). */
export const cloudLacks = new Set<BKind>();
export const NEEDS_SCHEMA: Partial<Record<BKind, number>> = { tavern: 6 };
export const build = (kind: BKind, x: number, y: number) => update((s) => {
  const d = BUILDINGS[kind];
  if (cloudLacks.has(kind)) return `Your cloud database must be updated before it can save a ${d.name}: see Settings → Account`;
  if (d.unique && count(s, kind)) return `Only one ${d.name} allowed`;
  const lock = lockReason(s, kind, 0); if (lock) return lock;
  if (!canPlace(s, kind, x, y)) return 'Cannot build there';
  const cost = costOf(s, kind, 0);
  if (!canAfford(s.res, cost)) return 'Not enough resources';
  const b: Building = { id: uid(), kind, x, y, level: 1, at: Date.now() };
  emit({ kind: 'build', text: d.levels[0].name, ...center(b), id: b.id });
  let o = spend({ ...s, buildings: [...s.buildings, b] }, cost);
  if (!d.paint) o = event(o, 'build', `Built a ${d.levels[0].name}.`);
  return mark(o, 'buildings', b.id);
});
export const upgrade = (id: string) => update((s) => {
  const b = s.buildings.find((q) => q.id === id); if (!b) return;
  const d = BUILDINGS[b.kind], lv = d.levels[b.level]; if (!lv) return 'Already at maximum level';
  const lock = lockReason(s, b.kind, b.level); if (lock) return lock;
  const cost = costOf(s, b.kind, b.level);
  if (!canAfford(s.res, cost)) return 'Not enough resources';
  emit({ kind: 'build', text: lv.name, ...center(b), id: b.id, big: b.kind === 'keep' || b.kind === 'palace' });
  const o = spend({ ...s, buildings: s.buildings.map((q) => (q.id === id ? { ...q, level: q.level + 1, at: Date.now() } : q)) }, cost);
  return mark(d.paint ? o : event(o, 'upgrade', `Upgraded to ${lv.name}.`), 'buildings', id);
});
/** Upgrade every painted tile of a kind (walls, roads) that is below max, as far as resources allow. */
export const upgradeAll = (kind: BKind) => update((s) => {
  const d = BUILDINGS[kind]; let o = s, n = 0;
  for (const b of s.buildings) {
    if (b.kind !== kind || !d.levels[b.level] || lockReason(o, kind, b.level)) continue;
    const c = costOf(o, kind, b.level); if (!canAfford(o.res, c)) break;
    o = mark(spend({ ...o, buildings: o.buildings.map((q) => (q.id === b.id ? { ...q, level: q.level + 1, at: Date.now() } : q)) }, c), 'buildings', b.id); n++;
  }
  if (!n) return 'Nothing could be upgraded';
  emit({ kind: 'info', text: `Upgraded ${n} ${d.name} tiles` });
  return event(o, 'upgrade', `Upgraded ${n} ${d.name} sections.`, n);
});
/** Half of what a building cost in total (all its levels): paid back when it is demolished. */
export const refundOf = (b: Building) => scale(BUILDINGS[b.kind].levels.slice(0, b.level).reduce((a, l) => add(a, l.cost), { ...ZERO }), 0.5);
/** Demolishes many buildings at once (e.g. a stretch of wall), with one refund for the lot. */
export const demolishMany = (ids: string[]) => update((s) => {
  const gone = s.buildings.filter((b) => ids.includes(b.id) && b.kind !== 'camp'); if (!gone.length) return 'Nothing to remove there';
  const refund = gone.reduce((a, b) => add(a, refundOf(b)), { ...ZERO }), set = new Set(gone.map((b) => b.id));
  let o = ledger({ ...s, buildings: s.buildings.filter((b) => !set.has(b.id)) }, 'refund', uid(), refund);
  for (const b of gone) o = kill(o, 'buildings', b.id);
  emit({ kind: 'reward', text: `Cleared ${gone.length} section${gone.length > 1 ? 's' : ''}`, res: refund });
  return event(o, 'build', `Cleared ${gone.length} ${gone.length > 1 ? 'sections' : 'section'} of ${[...new Set(gone.map((b) => BUILDINGS[b.kind].name.toLowerCase()))].join(' and ')}.`, gone.length);
});
/** All sections of the same kind joined to this one (a whole wall, palisade or road), for removing them together. */
export const connectedOf = (s: GameState, id: string) => {
  const start = s.buildings.find((b) => b.id === id); if (!start) return [];
  const at = new Map(s.buildings.filter((b) => b.kind === start.kind).map((b) => [`${b.x},${b.y}`, b])), seen = new Set<string>([start.id]), q = [start];
  while (q.length) { const b = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at.get(`${b.x + dx},${b.y + dy}`); if (n && !seen.has(n.id)) { seen.add(n.id); q.push(n); } } }
  return [...seen];
};
export const demolish = (id: string) => update((s) => {
  const b = s.buildings.find((q) => q.id === id);
  if (!b || b.kind === 'camp') return 'The camp cannot be removed';
  const refund = scale(BUILDINGS[b.kind].levels.slice(0, b.level).reduce((a, l) => add(a, l.cost), { ...ZERO }), 0.5);
  return kill(ledger({ ...s, buildings: s.buildings.filter((q) => q.id !== id) }, 'refund', uid(), refund), 'buildings', id);
});
export const moveBuilding = (id: string, x: number, y: number) => update((s) => {
  const b = s.buildings.find((q) => q.id === id); if (!b) return;
  if (!canPlace(s, b.kind, x, y, id)) return 'Cannot move there';
  return mark({ ...s, buildings: s.buildings.map((q) => (q.id === id ? { ...q, x, y } : q)) }, 'buildings', id);
});
export const research = (t: TechId) => update((s) => {
  const d = TECHS[t];
  if (has(s, t)) return 'Already researched';
  if (s.stage < d.stage) return `Requires stage ${d.stage}`;
  const miss = d.req.find((r) => !has(s, r)); if (miss) return `Requires ${TECHS[miss].name}`;
  if (!canAfford(s.res, d.cost)) return 'Not enough resources';
  emit({ kind: 'achieve', text: `Researched ${d.name}` });
  const o = spend({ ...s, techs: [...s.techs, t], outbox: { ...s.outbox, techs: true } }, d.cost);
  return event(o, 'tech', `Scholars mastered ${d.name}.`);
});

// ---------------- army ----------------
function ensureBattalion(s: GameState): [GameState, string] {
  if (s.battalions.length) return [s, s.battalions[0].id];
  const b = newBat(s, '1st Royal Battalion');
  return [mark({ ...s, battalions: [b] }, 'battalions', b.id), b.id];
}
function newBat(s: GameState, name: string): Battalion {
  const i = s.battalions.length, id = uid();
  return { id, name, army: 'Royal Army', color: COLORS[i % COLORS.length], emblem: 'lion', formation: 'block', orders: 'formation', x: (CAMP_X + 2 + (i % 4) * 7) * TILE, y: (CAMP_Y + 9 + Math.floor(i / 4) * 6) * TILE, commander: { name: nameFor(id), rank: 0, seed: id, traits: traitsFor(id), wins: 0, battles: 0, honors: 0 } };
}
/** What one soldier costs to raise, after the court's levy decree. */
export const recruitCost = (s: GameState, cls: TClass) => { const k = 1 - (s.world ? courtFx(courtOf(s.world)).recruit : 0); return Object.fromEntries(Object.entries(TROOPS[cls].cost).map(([r, v]) => [r, Math.ceil((v ?? 0) * k)])) as Partial<Res>; };
export const recruit = (cls: TClass, n: number, batId?: string) => update((s0) => {
  const d = TROOPS[cls]; const lock = troopLock(s0, cls); if (lock) return lock;
  if (n < 1) return;
  if (armySize(s0) + n > armyCap(s0)) return `Army capacity reached (${armySize(s0)}/${armyCap(s0)}). Build farms, huts and houses.`;
  const cost = recruitCost(s0, cls); // conscription makes soldiers cheaper
  if (!canAfford(s0.res, cost, n)) return 'Not enough resources';
  let [s, bat] = ensureBattalion(s0); if (batId && s.battalions.some((b) => b.id === batId)) bat = batId;
  // soldiers can't appear at a distant siege: recruits for a battalion that is away muster at home, and those meant for the siege march there
  let join: string | null = null;
  const away = awayFromHome(s), c = s.world?.campaign, target = c ? s.world.rivals.find((r) => r.id === c.target) : undefined;
  if (away.has(bat)) {
    if (s.battalions.length >= 40) return 'Too many battalions';
    const src = s.battalions.find((b) => b.id === bat)!;
    if (c && target && c.battalions.includes(bat)) {
      const nb: Battalion = { ...newBat(s, `${src.name.slice(0, 44)} reinforcements`), army: src.army, color: src.color, emblem: src.emblem };
      s = mark({ ...s, battalions: [...s.battalions, nb] }, 'battalions', nb.id); join = bat; bat = nb.id;
    } else {
      const home = s.battalions.find((b) => !away.has(b.id));
      if (home) bat = home.id; else { const nb = newBat(s, 'Home Guard'); s = mark({ ...s, battalions: [...s.battalions, nb] }, 'battalions', nb.id); bat = nb.id; }
    }
  }
  let left = n; const touched: string[] = [];
  const squads = s.squads.map((q) => {
    if (left && q.bat === bat && q.cls === cls && q.rank === 0 && q.count < SQUAD_SIZE) { const t = Math.min(left, SQUAD_SIZE - q.count); left -= t; touched.push(q.id); return { ...q, count: q.count + t }; }
    return q;
  });
  while (left > 0) { const t = Math.min(left, SQUAD_SIZE), id = uid(); squads.push({ id, cls, count: t, xp: 0, rank: 0, bat }); touched.push(id); left -= t; }
  let o = spend({ ...s, squads }, cost, n);
  if (join && target) { // they set off along the road to the siege
    const now = Date.now(), ms = travelMs('army', target), j: Journey = { id: uid(), kind: 'reinforce', rival: target.id, depart: now, arrive: now + ms, label: `Reinforcements marching to ${target.name}`, bats: [bat], data: { join } };
    o = { ...o, world: { ...o.world, journeys: [...(o.world.journeys ?? []), j] } };
    emit({ kind: 'info', text: `Recruited ${n} ${d.name}${n > 1 ? 's' : ''}. They march to the siege of ${target.name} (${Math.max(1, Math.round(ms / 60000))} min).` });
  } else emit({ kind: 'info', text: `Recruited ${n} ${d.name}${n > 1 ? 's' : ''}` });
  o = event(o, 'recruit', `Recruited ${n} ${d.name}${n > 1 ? 's' : ''}.`, n);
  for (const id of touched) o = mark(o, 'squads', id);
  return o;
});
export const drill = (squadId: string) => update((s) => {
  const q = s.squads.find((x) => x.id === squadId); if (!q) return;
  const cost = { gold: q.count * 2 };
  if (!canAfford(s.res, cost)) return 'Not enough gold';
  const xp = Math.round(DRILL_XP * (1 + effects(s).xp));
  return mark(spend({ ...s, squads: s.squads.map((x) => (x.id === squadId ? { ...x, xp: x.xp + xp } : x)) }, cost), 'squads', squadId);
});
export const promoteCost = (q: Squad) => ({ renown: Math.ceil(q.count * (RANKS[q.rank + 1]?.renown ?? 0)) });
export const canPromote = (s: GameState, q: Squad) => {
  const next = RANKS[q.rank + 1]; if (!next) return 'Highest rank';
  if (q.xp < next.xp) return `Needs ${next.xp} XP`;
  return rankLock(s, q.rank + 1) ?? (canAfford(s.res, promoteCost(q)) ? null : 'Not enough renown');
};
function promoteOne(s: GameState, id: string): GameState | string {
  const q = s.squads.find((x) => x.id === id); if (!q) return 'Unknown squad';
  const why = canPromote(s, q); if (why) return why;
  return mark(spend({ ...s, squads: s.squads.map((x) => (x.id === id ? { ...x, rank: x.rank + 1 } : x)) }, promoteCost(q)), 'squads', id);
}
export const promote = (id: string) => update((s) => {
  const r = promoteOne(s, id); if (typeof r === 'string') return r;
  const q = r.squads.find((x) => x.id === id)!;
  emit({ kind: 'promote', text: `${q.count} ${TROOPS[q.cls].name}s promoted to ${RANKS[q.rank].name}` });
  return event(r, 'promote', `${q.count} ${TROOPS[q.cls].name}s rose to ${RANKS[q.rank].name}.`, q.count);
});
export const promoteAll = (batId?: string) => update((s) => {
  let o = s, n = 0;
  for (const q of s.squads) if ((!batId || q.bat === batId) && !canPromote(o, q)) { const r = promoteOne(o, q.id); if (typeof r !== 'string') { o = r; n += q.count; } }
  if (!n) return 'No squads ready for promotion';
  emit({ kind: 'promote', text: `${n} soldiers promoted` });
  return event(o, 'promote', `${n} soldiers were promoted.`, n);
});
export const newBattalion = (name: string) => update((s) => {
  if (s.battalions.length >= 40) return 'Too many battalions';
  const b = newBat(s, name || `${s.battalions.length + 1}th Battalion`);
  return mark(event({ ...s, battalions: [...s.battalions, b] }, 'command', `${b.name} was raised under ${b.commander.name}.`), 'battalions', b.id);
});
export const editBattalion = (id: string, p: Partial<Battalion>) => update((s) => mark({ ...s, battalions: s.battalions.map((b) => (b.id === id ? { ...b, ...p } : b)) }, 'battalions', id));
export const disbandBattalion = (id: string) => update((s) => {
  if (s.battalions.length <= 1) return 'Keep at least one battalion';
  const to = s.battalions.find((b) => b.id !== id)!.id;
  let o: GameState = { ...s, battalions: s.battalions.filter((b) => b.id !== id), squads: s.squads.map((q) => (q.bat === id ? { ...q, bat: to } : q)) };
  for (const q of s.squads) if (q.bat === id) o = mark(o, 'squads', q.id);
  return kill(o, 'battalions', id);
});
/** Battalions away from the realm (on campaign, lent to an ally, or on the road). */
export const awayFromHome = (s: GameState) => new Set([...(s.world?.campaign?.battalions ?? []), ...(s.world?.loans ?? []).map((l) => l.bat), ...(s.world?.journeys ?? []).flatMap((j) => j.bats ?? [])]);
/** A battalion's squads in muster order (by troop type, then rank); every SQUADS_PER_COMPANY of them form a company. */
export const musterOf = (s: GameState, batId: string) => s.squads.filter((q) => q.bat === batId).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
export const companiesOf = (s: GameState, batId: string) => { const m = musterOf(s, batId); return Array.from({ length: Math.ceil(m.length / SQUADS_PER_COMPANY) }, (_, i) => m.slice(i * SQUADS_PER_COMPANY, (i + 1) * SQUADS_PER_COMPANY)); };
export type SplitHow = { kind: 'half' } | { kind: 'company'; index: number } | { kind: 'class'; cls: TClass } | { kind: 'squads'; ids: string[] };
/** Squad ids that go to the detachment; for an even split a lone squad is halved instead (returns the men to move). */
function detachment(s: GameState, batId: string, how: SplitHow): { ids: string[]; halve?: Squad } {
  const m = musterOf(s, batId);
  if (how.kind === 'company') return { ids: (companiesOf(s, batId)[how.index] ?? []).map((q) => q.id) };
  if (how.kind === 'class') return { ids: m.filter((q) => q.cls === how.cls).map((q) => q.id) };
  if (how.kind === 'squads') return { ids: m.filter((q) => how.ids.includes(q.id)).map((q) => q.id) };
  if (m.length === 1) return { ids: [], halve: m[0] };
  // even split that keeps the mix of troop types: each squad goes to whichever side has fewer of its type, then fewer men
  const side = [{ ids: [] as string[], n: 0, by: new Map<TClass, number>() }, { ids: [] as string[], n: 0, by: new Map<TClass, number>() }];
  for (const q of [...m].sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.count - a.count)) {
    const [a, b] = side, ka = a.by.get(q.cls) ?? 0, kb = b.by.get(q.cls) ?? 0, t = ka !== kb ? (ka < kb ? a : b) : a.n <= b.n ? a : b;
    t.ids.push(q.id); t.n += q.count; t.by.set(q.cls, (t.by.get(q.cls) ?? 0) + q.count);
  }
  return { ids: side[1].ids };
}
/** Splits off part of a battalion as a new one (same army and colours) with its own orders: e.g. half stays to patrol while half marches. */
export const splitBattalion = (id: string, how: SplitHow, orders: Orders = 'formation', name?: string) => update((s) => {
  const src = s.battalions.find((b) => b.id === id); if (!src) return 'Unknown battalion';
  if (awayFromHome(s).has(id)) return 'This battalion is away from the realm';
  if (s.battalions.length >= 40) return 'Too many battalions';
  const { ids, halve } = detachment(s, id, how), all = musterOf(s, id);
  if (halve && halve.count < 2) return 'Too few soldiers to split';
  if (!halve && (!ids.length || ids.length === all.length)) return 'Choose some, but not all, of the squads';
  const fresh = newBat(s, (name?.trim() || `${src.name.slice(0, 46)} (detachment)`).slice(0, 60));
  const b: Battalion = { ...fresh, army: src.army, color: src.color, emblem: src.emblem, formation: src.formation, orders, ...clampPos(src.x + 14 * TILE, src.y) }; // forms up beside its parent, clear of its ranks
  let o: GameState = { ...s, battalions: [...s.battalions, b] };
  if (halve) {
    const nq: Squad = { ...halve, id: uid(), count: Math.floor(halve.count / 2), bat: b.id };
    o = mark(mark({ ...o, squads: [...o.squads.map((q) => (q.id === halve.id ? { ...q, count: q.count - nq.count } : q)), nq] }, 'squads', halve.id), 'squads', nq.id);
  } else { o = { ...o, squads: o.squads.map((q) => (ids.includes(q.id) ? { ...q, bat: b.id } : q)) }; for (const q of ids) o = mark(o, 'squads', q); }
  const n = batSize(o, b.id);
  emit({ kind: 'info', text: `${n} soldiers detached as ${b.name}` });
  return mark(event(o, 'command', `${n} soldiers of ${src.name} were detached as ${b.name} under ${b.commander.name}.`, n), 'battalions', b.id);
});
/** Folds one battalion into another; the emptied battalion is stood down. */
export const mergeBattalion = (from: string, into: string) => update((s) => {
  if (from === into) return;
  const a = s.battalions.find((b) => b.id === from), b = s.battalions.find((x) => x.id === into); if (!a || !b) return 'Unknown battalion';
  const away = awayFromHome(s); if (away.has(from) || away.has(into)) return 'Both battalions must be at home';
  let o: GameState = { ...s, battalions: s.battalions.filter((x) => x.id !== from), squads: s.squads.map((q) => (q.bat === from ? { ...q, bat: into } : q)) };
  for (const q of s.squads) if (q.bat === from) o = mark(o, 'squads', q.id);
  return kill(event(o, 'command', `${a.name} joined ${b.name}.`), 'battalions', from);
});
export const transferSquad = (sid: string, bat: string) => update((s) => {
  const q = s.squads.find((x) => x.id === sid), away = awayFromHome(s); if (!q) return;
  if (away.has(q.bat) || away.has(bat)) return 'Squads can only move between battalions at home';
  return mark({ ...s, squads: s.squads.map((x) => (x.id === sid ? { ...x, bat } : x)) }, 'squads', sid);
});
const clampPos = (x: number, y: number) => ({ x: Math.max(2 * TILE, Math.min((MAP_W - 2) * TILE, x)), y: Math.max(3 * TILE, Math.min((MAP_H - 1) * TILE, y)) });
/** On patrol, on guard or resting in quarters: the battalion keeps to its duties and cannot be marched about. */
export const onDuty = (s: GameState, b: Battalion) => (b.orders === 'patrol' || b.orders === 'garrison' || inQuarters(s, b.id));
const DUTY_MSG: Record<string, string> = { patrol: 'is on patrol', garrison: 'is on guard duty', quarters: 'is resting in quarters' };
export const marchTo = (id: string, x: number, y: number) => update((s) => {
  const b = s.battalions.find((q) => q.id === id); if (!b) return;
  if (onDuty(s, b)) return `${b.name} ${DUTY_MSG[inQuarters(s, id) ? 'quarters' : b.orders!]}. Give them "Hold formation" orders to march them.`;
  return mark({ ...s, battalions: s.battalions.map((q) => (q.id === id ? { ...q, ...clampPos(x, y) } : q)) }, 'battalions', id);
});
export const marchArmy = (army: string, x: number, y: number) => update((s) => {
  const all = s.battalions.filter((b) => b.army === army), bs = all.filter((b) => !onDuty(s, b)); if (!all.length) return;
  if (!bs.length) return `Every battalion of the ${army} is on patrol, on guard or in quarters`; // those on duty stay at their posts
  const cx = bs.reduce((a, b) => a + b.x, 0) / bs.length, cy = bs.reduce((a, b) => a + b.y, 0) / bs.length;
  let o = s;
  for (const b of bs) o = mark({ ...o, battalions: o.battalions.map((q) => (q.id === b.id ? { ...q, ...clampPos(b.x - cx + x, b.y - cy + y) } : q)) }, 'battalions', b.id);
  return o;
});
export const promoteCommander = (id: string) => update((s) => {
  const b = s.battalions.find((q) => q.id === id); if (!b) return;
  const next = OFFICERS[b.commander.rank + 1]; if (!next) return 'Already a General';
  if (batSize(s, id) < next.size) return `Battalion needs ${next.size} soldiers`;
  if (!canAfford(s.res, { renown: next.renown })) return 'Not enough renown';
  emit({ kind: 'promote', text: `${b.commander.name} is now ${next.name}` });
  const o = spend({ ...s, battalions: s.battalions.map((q) => (q.id === id ? { ...q, commander: { ...q.commander, rank: q.commander.rank + 1 } } : q)) }, { renown: next.renown });
  return mark(event(o, 'command', `${b.commander.name} was promoted to ${next.name}.`), 'battalions', id);
});

// ---------------- study ----------------
/** Soldiers in quarters drill between duties: a quarter faster, more with a training field or archery range to use. */
const drillBonus = (s: GameState, bat: string, plan: ReturnType<typeof quarterPlan>) => { const n = plan.per.get(bat) ?? 0, size = batSize(s, bat); if (!n || !size) return 1; return 1 + (n / size) * (count(s, 'trainfield') || count(s, 'range') ? 0.4 : 0.25); };
const XP_RATE = (s: GameState, bat: string, plan = quarterPlan(s)) => { const c = s.battalions.find((b) => b.id === bat)?.commander; return (1 + effects(s).xp + (OFFICERS[c?.rank ?? 0]?.bonus ?? 0)) * (c && hasTrait(c, 'drillmaster') ? 1.25 : 1) * drillBonus(s, bat, plan); };
function giveXp(s: GameState, minutes: number): GameState {
  if (minutes <= 0 || !s.squads.length) return s;
  const plan = quarterPlan(s); let o: GameState = { ...s, squads: s.squads.map((q) => ({ ...q, xp: q.xp + minutes * XP_PER_MIN * XP_RATE(s, q.bat, plan) })) };
  for (const q of s.squads) o = mark(o, 'squads', q.id);
  return o;
}
function record(sess: NonNullable<GameState['session']>, now: number): StudyRecord {
  return { id: sess.id, subject: sess.subject, source: sess.source, startedAt: sess.startedAt, endedAt: sess.status === 'ended' ? (sess.endedAt ?? now) : null,
    verifiedSec: Math.floor(sess.verifiedMs / 1000), forfeitedSec: Math.floor(sess.forfeitedMs / 1000), checkIns: sess.checkIns.filter((c) => !c.missed).length,
    missed: sess.checkIns.filter((c) => c.missed).length, notes: sess.notes.join(' · '), reward: sess.awarded };
}
/** Grants whatever the verified time has earned beyond what was already awarded. */
function settle(s: GameState, sess: NonNullable<GameState['session']>, slot: 'session' | 'work' = 'session'): GameState {
  const now = Date.now(), work = slot === 'work', k = work ? WORK_FACTOR : 1;
  // never more than the cloud database accepts per verified minute (big market/storehouse bonuses could exceed it)
  const total = minRes(work ? workReward(sess.verifiedMs, s.settings.rates, studyMult(s)) : studyReward(sess.verifiedMs, s.settings.rates, studyMult(s)), ceilingFor(sess.verifiedMs / 1000, false));
  const awarded = maxRes(total, sess.awarded), delta = sub(awarded, sess.awarded);
  let o = studyLedger(s, 'study', sess.id, total, sess.awarded);
  const xpMin = ((sess.verifiedMs - sess.xpMs) / MIN) * k; // productive time trains soldiers and moves sieges at the lesser rate too
  o = giveXp(o, xpMin);
  o = studyHooks.reduce((acc, h) => h(acc, xpMin), o);
  const sess2 = { ...sess, awarded, xpMs: sess.verifiedMs };
  const rec = record(sess2, now);
  o = mark({ ...o, sessions: [rec, ...o.sessions.filter((r) => r.id !== rec.id)] }, 'sessions', rec.id);
  const label = work ? taskOf(sess2.subject) : sess2.subject;
  if (sess2.status === 'ended') {
    o = { ...o, [slot]: null };
    const m = Math.floor(sess2.verifiedMs / MIN);
    o = event(o, 'study', work ? `Spent ${m} min on ${label.toLowerCase()} (productive time), earning ${awarded.gold} gold.` : `Studied ${label} for ${m} min, earning ${awarded.gold} gold.`, m);
    if (m > 0) emit({ kind: 'reward', text: work ? `Productive time: ${m} min of ${label}` : `Session complete: ${m} min of ${label}`, res: awarded, big: true });
  } else {
    o = { ...o, [slot]: sess2 };
    if (!isZero(delta)) emit({ kind: 'reward', text: work ? 'Productive time verified' : 'Study verified', res: delta });
  }
  return o;
}
/** The subject you are studying now, or studied last: the default everywhere a subject is asked for. */
export const currentSubject = (s: GameState) => s.session?.subject ?? s.sessions.map((r) => r.subject).find((x) => s.subjects.includes(x)) ?? s.subjects[0] ?? 'General';
/** Adds a subject of your own to the list (kept across devices). */
export const addSubject = (name: string) => update((s) => {
  name = name.trim().replace(/\s+/g, ' ').slice(0, 40); if (!name) return 'Name the subject';
  const hidden = (s.settings.hiddenSubjects ?? []).filter((x) => x.toLowerCase() !== name.toLowerCase()), settings = { ...s.settings, hiddenSubjects: hidden }; // adding one back un-hides it
  if (s.subjects.some((x) => x.toLowerCase() === name.toLowerCase())) return { ...s, settings };
  if (s.subjects.length >= 40) return 'Too many subjects';
  return { ...s, settings, subjects: [...s.subjects, name] };
});
export const removeSubject = (name: string) => update((s) => (s.subjects.length <= 1 ? 'Keep at least one subject'
  : { ...s, subjects: s.subjects.filter((x) => x !== name), settings: { ...s.settings, hiddenSubjects: [...new Set([...(s.settings.hiddenSubjects ?? []), name])] } }));
/** Subjects minus the ones you removed (applied whenever the cloud's list is merged in). */
export const visibleSubjects = (subjects: string[], settings: Settings) => { const h = new Set((settings.hiddenSubjects ?? []).map((x) => x.toLowerCase())); const v = subjects.filter((x) => !h.has(x.toLowerCase())); return v.length ? v : subjects.slice(0, 1); };
export const studyStart = (subject: string) => update((s) => {
  if (s.work) return 'Stop your productive-time timer first: one thing at a time';
  if (s.session) return 'A session is already running';
  const subjects = s.subjects.includes(subject) ? s.subjects : [...s.subjects, subject];
  s = { ...s, settings: { ...s.settings, hiddenSubjects: (s.settings.hiddenSubjects ?? []).filter((x) => x.toLowerCase() !== subject.toLowerCase()) } };
  const sess = { ...startSession(subject, Date.now(), s.settings.cfg), xpMs: 0, source: (s.settings.cfg.pomodoro ? 'pomodoro' : 'timer') as Source };
  return mark({ ...s, subjects, session: sess, sessions: [record(sess, Date.now()), ...s.sessions] }, 'sessions', sess.id);
});
export const studyTick = () => {
  for (const slot of ['session', 'work'] as const) {
    const s = state, sess = s[slot]; if (!sess) continue;
    const t = { ...sess, ...tick(sess, Date.now()) };
    if (t.status !== sess.status) {
      if (t.status === 'missed') emit({ kind: 'error', text: 'Check-in missed: timer paused. Everything already earned is kept.' });
      setState(post(settle(s, t, slot)));
    }
  }
};
const act = (f: (x: Session, now: number) => Session) => update((s) => (s.session ? settle(s, { ...s.session, ...f(s.session, Date.now()) }) : undefined));
export const studyCheckIn = (note?: string) => act((x, n) => checkIn(x, n, note));
export const studyPause = () => act(pause);
export const studyBreak = (note?: string) => act((x, n) => takeBreak(x, n, note));
export const studyEnd = () => act(endSession);
// ---------------- productive time: chores, exercise, work, practice ----------------
/** Productive time pays this share of study's base rate, without study's focus bonus. */
export const WORK_FACTOR = 0.4;
/** Productive sessions are saved like study sessions, with this mark before the activity's name. */
export const WORK_MARK = '⚒ ';
export const isWork = (r: { subject: string }) => r.subject.startsWith(WORK_MARK);
export const studyOnly = <T extends { subject: string }>(list: T[]) => list.filter((r) => !isWork(r));
export const taskOf = (subject: string) => (isWork({ subject }) ? subject.slice(WORK_MARK.length) : subject);
export const DEFAULT_TASKS = ['Chores', 'Exercise', 'Work', 'Errands', 'Cooking', 'Practice'];
export const workTasks = (s: GameState) => s.settings.workTasks ?? DEFAULT_TASKS;
export const workStart = (task: string) => update((s) => {
  if (s.session) return 'Finish your study session first: one thing at a time';
  if (s.work) return;
  task = task.trim().replace(/\s+/g, ' ').slice(0, 40) || 'Productive time';
  const sess = { ...startSession(WORK_MARK + task, Date.now(), { ...s.settings.cfg, pomodoro: false }), xpMs: 0, source: 'timer' as Source };
  return mark({ ...s, work: sess, sessions: [record(sess, Date.now()), ...s.sessions] }, 'sessions', sess.id);
});
const actW = (f: (x: Session, now: number) => Session) => update((s) => (s.work ? settle(s, { ...s.work, ...f(s.work, Date.now()) }, 'work') : undefined));
export const workCheckIn = (note?: string) => actW((x, n) => checkIn(x, n, note));
export const workPause = () => actW(pause);
export const workEnd = () => actW(endSession);
export const workDiscard = () => update((s) => (s.work && s.work.verifiedMs === 0 ? kill({ ...s, work: null, sessions: s.sessions.filter((r) => r.id !== s.work!.id) }, 'sessions', s.work.id) : 'Only empty sessions can be discarded'));
export const addWorkTask = (name: string) => update((s) => { name = name.trim().replace(/\s+/g, ' ').slice(0, 40); if (!name) return 'Name the activity'; const l = workTasks(s); if (l.some((x) => x.toLowerCase() === name.toLowerCase())) return; if (l.length >= 20) return 'Too many activities'; return { ...s, settings: { ...s.settings, workTasks: [...l, name] } }; });
export const removeWorkTask = (name: string) => update((s) => { const l = workTasks(s); return l.length <= 1 ? 'Keep at least one activity' : { ...s, settings: { ...s.settings, workTasks: l.filter((x) => x !== name) } }; });
export const studyDiscard = () => update((s) => (s.session && s.session.verifiedMs === 0 ? kill({ ...s, session: null, sessions: s.sessions.filter((r) => r.id !== s.session!.id) }, 'sessions', s.session.id) : 'Only empty sessions can be discarded'));

/** Manual entry: clearly marked, earns MANUAL_FACTOR of the timed rate, capped per day. */
export const logManual = (subject: string, minutes: number, when: number, note: string) => update((s) => {
  minutes = Math.floor(minutes);
  if (!(minutes > 0) || minutes > 240) return 'Enter between 1 and 240 minutes';
  if (when > Date.now()) return 'Cannot log future sessions';
  const day = dayKey(new Date(when));
  const used = s.sessions.filter((r) => r.source === 'manual' && dayKey(new Date(r.startedAt)) === day).reduce((a, r) => a + r.verifiedSec / 60, 0);
  if (used + minutes > MANUAL_MAX_PER_DAY_MIN) return `Manual logs are limited to ${MANUAL_MAX_PER_DAY_MIN} min per day`;
  const id = uid(), reward = minRes(studyReward(minutes * MIN, s.settings.rates, studyMult(s), MANUAL_FACTOR), ceilingFor(minutes * 60, true));
  const rec: StudyRecord = { id, subject, source: 'manual', startedAt: when - minutes * MIN, endedAt: when, verifiedSec: minutes * 60, forfeitedSec: 0, checkIns: 0, missed: 0, notes: note, reward };
  let o = mark({ ...s, sessions: [rec, ...s.sessions], subjects: s.subjects.includes(subject) ? s.subjects : [...s.subjects, subject] }, 'sessions', id);
  o = studyLedger(o, 'manual', id, reward, ZERO);
  o = giveXp(o, minutes * MANUAL_FACTOR);
  o = studyHooks.reduce((acc, h) => h(acc, minutes * MANUAL_FACTOR), o);
  emit({ kind: 'reward', text: `Logged ${minutes} min (manual)`, res: reward });
  return event(o, 'study', `Logged ${minutes} min of ${subject} manually.`, minutes);
});
/** Deterministic UUID (v4-shaped) from a string, so a one-time grant has the same id on every device. */
export function stableUuid(key: string) {
  let h = '';
  for (let i = 0; h.length < 32; i++) { let x = 2166136261 ^ i; for (const c of key) x = Math.imul(x ^ c.charCodeAt(0), 16777619); h += (x >>> 0).toString(16).padStart(8, '0'); }
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** One-time compensation: credits a study session at `factor` times the normal reward. Idempotent per id. */
export const grantCompensation = (id: string, minutes: number, factor: number, subject: string, note: string) => update((s) => {
  if (s.sessions.some((r) => r.id === id)) return s;
  const now = Date.now(), reward = minRes(studyReward(minutes * MIN, s.settings.rates, studyMult(s), factor), ceilingFor(minutes * 60, false));
  const rec: StudyRecord = { id, subject, source: 'timer', startedAt: now - minutes * MIN, endedAt: now, verifiedSec: minutes * 60, forfeitedSec: 0, checkIns: 0, missed: 0, notes: note, reward };
  let o = mark({ ...s, sessions: [rec, ...s.sessions] }, 'sessions', id);
  o = studyLedger(o, 'study', id, reward, ZERO);
  o = giveXp(o, minutes);
  o = studyHooks.reduce((acc, h) => h(acc, minutes), o);
  emit({ kind: 'reward', text: `Royal compensation: ${minutes} min at ${factor}x`, res: reward });
  return event(o, 'study', `The crown credits ${minutes} min of study at ${factor}x reward: ${note}`, minutes);
});
export const setSettings = (p: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...p } }));

// ---------------- habits ----------------
export const addHabit = (h: { name: string; freq: Freq; target: number; unit: string; weight: number; requireNote: boolean }) => update((s) => {
  if (!h.name.trim()) return 'Name your habit';
  const habit: Habit = { id: uid(), ...h, target: Math.max(1, Math.min(1000, Math.floor(h.target))), weight: Math.max(1, Math.min(5, h.weight)), log: {}, done: [], created: Date.now(), best: 0, earned: { ...ZERO } };
  return mark({ ...s, habits: [...s.habits, habit] }, 'habits', habit.id);
});
export const editHabit = (id: string, p: Partial<Habit>) => update((s) => mark({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, ...p } : h)) }, 'habits', id));
export const removeHabit = (id: string) => update((s) => kill({ ...s, habits: s.habits.filter((h) => h.id !== id) }, 'habits', id));
export const habitProgress = (id: string, amount = 1, note?: string) => update((s) => {
  const h = s.habits.find((q) => q.id === id); if (!h) return;
  if (h.requireNote && !note?.trim()) return 'This habit needs a short note';
  const now = new Date(), r = progress(h, now, amount);
  if (!r) return 'Already completed for this period';
  const period = periodKey(h, now), cid = `${id}:${period}`;
  const comp: Completion = { id: cid, habitId: id, period, count: r.habit.log[period], done: r.completed, at: Date.now(), note };
  let o = mark({ ...s, completions: [comp, ...s.completions.filter((c) => c.id !== cid)] }, 'completions', cid);
  let habit = r.habit;
  if (r.completed) {
    const st = streak(habit, now), rw = habitReward(habit, st);
    o = ledger(o, 'habit', cid, rw); habit = { ...habit, earned: add(habit.earned, rw) };
    emit({ kind: 'reward', text: `${h.name} complete${st > 1 ? `: ${st} streak` : ''}`, res: rw });
    o = event(o, 'habit', `Completed "${h.name}"${st > 1 ? ` (${st} streak)` : ''}.`);
    for (const [n, bonus] of MILESTONES) if (st === n) {
      const b = { ...ZERO, renown: bonus * habit.weight, gold: bonus * 10 * habit.weight };
      o = ledger(o, 'milestone', `${cid}:${n}`, b); habit = { ...habit, earned: add(habit.earned, b) };
      emit({ kind: 'achieve', text: `${n}-period streak bonus for ${h.name}!`, res: b });
    }
  }
  return mark({ ...o, habits: o.habits.map((q) => (q.id === id ? habit : q)) }, 'habits', id);
});

// ---------------- achievements & stage ----------------
const studyMin = (s: GameState) => studyOnly(s.sessions).reduce((a, r) => a + r.verifiedSec, 0) / 60;
const studyDays = (s: GameState) => new Set(studyOnly(s.sessions).filter((r) => r.verifiedSec > 0).map((r) => dayKey(new Date(r.startedAt)))).size;
export interface Ach { id: string; name: string; desc: string; renown: number; unlock?: string; test: (s: GameState) => boolean }
export const ACHIEVEMENTS: Ach[] = [
  { id: 'first', name: 'First Steps', desc: 'Finish a study session', renown: 5, test: (s) => s.sessions.some((r) => r.endedAt && r.verifiedSec >= 60) },
  { id: 'hour', name: 'Hour of Focus', desc: 'A 60-minute timed session', renown: 20, test: (s) => s.sessions.some((r) => r.source !== 'manual' && r.verifiedSec >= 3600) },
  { id: 'marathon', name: 'Marathon Scholar', desc: 'A 3-hour timed session', renown: 60, test: (s) => s.sessions.some((r) => r.source !== 'manual' && r.verifiedSec >= 10800) },
  { id: 'scholar10', name: 'Apprentice', desc: '10 hours studied', renown: 50, unlock: 'theme:stone', test: (s) => studyMin(s) >= 600 },
  { id: 'scholar100', name: 'Master Scholar', desc: '100 hours studied', renown: 300, unlock: 'theme:royal', test: (s) => studyMin(s) >= 6000 },
  { id: 'scholar500', name: 'Sage of the Realm', desc: '500 hours studied', renown: 1000, unlock: 'emblem:griffin', test: (s) => studyMin(s) >= 30000 },
  { id: 'days7', name: 'Week of Study', desc: 'Study on 7 different days', renown: 30, test: (s) => studyDays(s) >= 7 },
  { id: 'days30', name: 'Month of Study', desc: 'Study on 30 different days', renown: 120, test: (s) => studyDays(s) >= 30 },
  { id: 'days100', name: 'Hundred Days', desc: 'Study on 100 different days', renown: 400, unlock: 'theme:midnight', test: (s) => studyDays(s) >= 100 },
  { id: 'pomo10', name: 'Tomato Knight', desc: 'Complete 10 pomodoros', renown: 25, test: (s) => s.sessions.filter((r) => r.source === 'pomodoro').reduce((a, r) => a + r.checkIns, 0) >= 10 },
  { id: 'checkin50', name: 'Ever Vigilant', desc: '50 check-ins answered', renown: 40, test: (s) => s.sessions.reduce((a, r) => a + r.checkIns, 0) >= 50 },
  { id: 'habit1', name: 'Good Habit', desc: 'Complete a habit', renown: 5, test: (s) => s.completions.some((c) => c.done) },
  { id: 'habit7', name: 'Steadfast', desc: 'Reach a 7-period habit streak', renown: 30, test: (s) => s.habits.some((h) => h.best >= 7) },
  { id: 'habit30', name: 'Iron Will', desc: 'Reach a 30-period habit streak', renown: 150, test: (s) => s.habits.some((h) => h.best >= 30) },
  { id: 'habit100', name: 'Creature of Virtue', desc: '100 habit completions', renown: 120, test: (s) => s.completions.filter((c) => c.done).length >= 100 },
  { id: 'stage2', name: 'Settler', desc: 'Reach Small Settlement', renown: 10, test: (s) => s.stage >= 2 },
  { id: 'stage3', name: 'Village Lord', desc: 'Reach Fortified Village', renown: 30, test: (s) => s.stage >= 3 },
  { id: 'stage4', name: 'Castellan', desc: 'Reach Medieval Fortress', renown: 100, test: (s) => s.stage >= 4 },
  { id: 'castle', name: 'Lord of the Castle', desc: 'Reach Great Castle', renown: 300, unlock: 'emblem:crown', test: (s) => s.stage >= 5 },
  { id: 'citadel', name: 'Sovereign', desc: 'Reach Royal Citadel', renown: 1000, unlock: 'color:gold', test: (s) => s.stage >= 6 },
  { id: 'army100', name: 'Warband', desc: 'Command 100 soldiers', renown: 25, test: (s) => armySize(s) >= 100 },
  { id: 'army500', name: 'Legion', desc: 'Command 500 soldiers', renown: 100, test: (s) => armySize(s) >= 500 },
  { id: 'army1000', name: 'Grand Host', desc: 'Command 1,000 soldiers', renown: 250, unlock: 'emblem:dragon', test: (s) => armySize(s) >= 1000 },
  { id: 'veteran', name: 'Hardened', desc: 'Promote a squad to Veteran', renown: 20, test: (s) => s.squads.some((q) => q.rank >= 2) },
  { id: 'elite', name: 'The Finest', desc: 'Promote a squad to Elite', renown: 60, test: (s) => s.squads.some((q) => q.rank >= 3) },
  { id: 'general', name: 'Warlord', desc: 'Promote a commander to General', renown: 150, test: (s) => s.battalions.some((b) => b.commander.rank >= 4) },
  { id: 'scholarlord', name: 'Age of Learning', desc: 'Research 8 technologies', renown: 80, test: (s) => s.techs.length >= 8 },
  { id: 'victory', name: 'First Blood', desc: 'Win a battle', renown: 20, test: (s) => s.world?.reports.some((r) => r.win) ?? false },
  { id: 'ally', name: 'Bonds of Trust', desc: 'Form an alliance', renown: 40, test: (s) => s.world?.rivals.some((r) => r.status === 'ally') ?? false },
  { id: 'conquer', name: 'Conqueror', desc: 'Take a castle by siege', renown: 150, test: (s) => (s.world?.conquests ?? 0) >= 1 },
  { id: 'emperor', name: 'Emperor', desc: 'Make three kingdoms your vassals', renown: 600, unlock: 'emblem:eagle', test: (s) => (s.world?.conquests ?? 0) >= 3 },
];
export const unlocked = (s: GameState, what: string) => ACHIEVEMENTS.some((a) => a.unlock === what && s.achievements.includes(a.id));

/** Runs after every action: stage progression and achievements. */
function post(s: GameState): GameState {
  let out = s;
  const st = computeStage(out);
  if (st > out.stage) {
    out = event({ ...out, stage: st }, 'stage', `The realm became a ${STAGES[st - 1].name}!`);
    emit({ kind: 'stage', text: `Stage ${st}: ${STAGES[st - 1].name}`, big: true });
  }
  const scholar = { ...out, sessions: studyOnly(out.sessions) }; // study achievements count study, not productive time
  for (const a of ACHIEVEMENTS) if (!out.achievements.includes(a.id) && a.test(scholar)) {
    out = ledger({ ...out, achievements: [...out.achievements, a.id] }, 'achievement', a.id, { ...ZERO, renown: a.renown });
    out = event(out, 'achieve', `Achievement: ${a.name}.`);
    emit({ kind: 'achieve', text: `${a.name}: +${a.renown} renown` });
  }
  return out;
}
export const _post = post;
/** Internal helpers for the war action module. */
export const _internal = { update, ledger, spend, mark, kill, event };
export { canAfford };
