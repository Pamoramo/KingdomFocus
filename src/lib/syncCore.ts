// Pure translation between the local game state and the database sync payload/snapshot.
import type { GameState, StudyRecord, Building, Battalion, Squad, Completion, KEvent, Table } from './state.ts';
import type { Habit } from './habits.ts';
import type { Res } from './rewards.ts';
import type { TechId } from './economy.ts';

const iso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString());
const ms = (s: string | null) => (s == null ? null : Date.parse(s));
const pick = <T extends { id: string }>(list: T[], ids: string[] = []) => { const set = new Set(ids); return list.filter((x) => set.has(x.id)); };

export interface Sent { payload: Record<string, unknown>; refs: { ledger: GameState['outbox']['ledger']; dirty: Partial<Record<Table, unknown[]>>; dead: GameState['outbox']['dead']; events: string[]; techs: boolean } }

export function buildPayload(s: GameState): Sent {
  const d = s.outbox.dirty, now = new Date().toISOString();
  const sessions = pick(s.sessions, d.sessions), habits = pick(s.habits, d.habits), comps = pick(s.completions, d.completions);
  const buildings = pick(s.buildings, d.buildings), bats = pick(s.battalions, d.battalions), squads = pick(s.squads, d.squads);
  const evIds = new Set(s.outbox.events), events = s.events.filter((e) => evIds.has(e.id));
  const payload = {
    sessions: sessions.map((r) => ({ id: r.id, subject: r.subject, source: r.source, started_at: iso(r.startedAt), ended_at: iso(r.endedAt), verified_seconds: r.verifiedSec, forfeited_seconds: r.forfeitedSec, check_ins: r.checkIns, missed: r.missed, notes: r.notes })),
    habits: habits.map((h) => ({ id: h.id, name: h.name, freq: h.freq, target: h.target, unit: h.unit, weight: h.weight, require_note: h.requireNote, best: h.best, earned: h.earned, archived: !!h.archived, created_at: iso(h.created), updated_at: now })),
    completions: comps.map((c) => ({ habit_id: c.habitId, period: c.period, count: c.count, done: c.done, note: c.note ?? null, at: iso(c.at) })),
    ledger: s.outbox.ledger.map((l) => ({ kind: l.kind, ref: l.ref, ...l.amt, at: iso(l.at) })),
    buildings: buildings.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, level: b.level, built_at: iso(b.at), updated_at: now })),
    battalions: bats.map((b) => ({ id: b.id, name: b.name, army: b.army, color: b.color, emblem: b.emblem, formation: b.formation, orders: b.orders ?? 'formation', x: b.x, y: b.y, commander: b.commander, updated_at: now })),
    squads: squads.map((q) => ({ id: q.id, battalion_id: q.bat, cls: q.cls, count: q.count, xp: q.xp, rank: q.rank, updated_at: now })),
    techs: s.outbox.techs ? s.techs : [],
    events: events.map((e) => ({ id: e.id, t: iso(e.t), type: e.type, text: e.text.slice(0, 300), n: e.n ?? null })),
    dead: s.outbox.dead,
    kingdom: { stage: s.stage, achievements: s.achievements, subjects: s.subjects, settings: s.settings, active_session: s.session, world: s.world },
  };
  return { payload, refs: { ledger: s.outbox.ledger, dirty: { sessions, habits, completions: comps, buildings, battalions: bats, squads }, dead: s.outbox.dead, events: s.outbox.events, techs: s.outbox.techs } };
}

/** Removes what was successfully sent, keeping anything that changed while the request was in flight. */
export function clearSent(s: GameState, sent: Sent): GameState {
  const sentLedger = new Set(sent.refs.ledger), sentEv = new Set(sent.refs.events);
  const dirty: GameState['outbox']['dirty'] = {};
  const lists: Record<Table, { id: string }[]> = { sessions: s.sessions, habits: s.habits, completions: s.completions, buildings: s.buildings, battalions: s.battalions, squads: s.squads };
  for (const t of Object.keys(s.outbox.dirty) as Table[]) {
    const sentObjs = new Set(sent.refs.dirty[t] ?? []);
    const keep = (s.outbox.dirty[t] ?? []).filter((id) => { const cur = lists[t].find((x) => x.id === id); return cur && !sentObjs.has(cur); });
    if (keep.length) dirty[t] = keep;
  }
  const dead: GameState['outbox']['dead'] = {};
  for (const t of Object.keys(s.outbox.dead) as Table[]) { const was = new Set(sent.refs.dead[t] ?? []); const keep = (s.outbox.dead[t] ?? []).filter((id) => !was.has(id)); if (keep.length) dead[t] = keep; }
  return { ...s, outbox: { ledger: s.outbox.ledger.filter((l) => !sentLedger.has(l)), dirty, dead, events: s.outbox.events.filter((e) => !sentEv.has(e)), techs: s.outbox.techs && !sent.refs.techs } };
}
export const outboxEmpty = (s: GameState) => !s.outbox.ledger.length && !s.outbox.events.length && !s.outbox.techs
  && !Object.values(s.outbox.dirty).some((l) => l?.length) && !Object.values(s.outbox.dead).some((l) => l?.length);

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Snapshot { balance: Res; lifetime: Res; kingdom: Row | null; sessions: Row[]; session_rewards: Record<string, Res>; habits: Row[]; completions: Row[]; buildings: Row[]; battalions: Row[]; squads: Row[]; techs: string[]; events: Row[] }
const num = (r: Res): Res => ({ gold: +r.gold, wood: +r.wood, stone: +r.stone, renown: +r.renown });

/** Replaces local data with the server's merged view (only call when nothing is pending locally). */
export function adoptSnapshot(s: GameState, snap: Snapshot): GameState {
  const comps: Completion[] = snap.completions.map((c) => ({ id: `${c.habit_id}:${c.period}`, habitId: c.habit_id, period: c.period, count: c.count, done: c.done, at: ms(c.at)!, note: c.note ?? undefined }));
  const habits: Habit[] = snap.habits.map((h) => {
    const mine = comps.filter((c) => c.habitId === h.id);
    return { id: h.id, name: h.name, freq: h.freq, target: h.target, unit: h.unit, weight: h.weight, requireNote: h.require_note, best: h.best, archived: h.archived, created: ms(h.created_at)!,
      earned: { gold: 0, wood: 0, stone: 0, renown: 0, ...h.earned }, log: Object.fromEntries(mine.map((c) => [c.period, c.count])), done: mine.filter((c) => c.done).map((c) => c.period) };
  });
  const zero = { gold: 0, wood: 0, stone: 0, renown: 0 };
  const sessions: StudyRecord[] = snap.sessions.map((r) => ({ id: r.id, subject: r.subject, source: r.source, startedAt: ms(r.started_at)!, endedAt: ms(r.ended_at), verifiedSec: r.verified_seconds, forfeitedSec: r.forfeited_seconds, checkIns: r.check_ins, missed: r.missed, notes: r.notes, reward: num(snap.session_rewards[r.id] ?? zero) }));
  const buildings: Building[] = snap.buildings.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, level: b.level, at: ms(b.built_at)! }));
  const battalions: Battalion[] = snap.battalions.map((b) => ({ id: b.id, name: b.name, army: b.army, color: b.color, emblem: b.emblem, formation: b.formation, orders: b.orders ?? 'formation', x: b.x, y: b.y, commander: b.commander }));
  const squads: Squad[] = snap.squads.map((q) => ({ id: q.id, cls: q.cls, count: q.count, xp: q.xp, rank: q.rank, bat: q.battalion_id }));
  const events: KEvent[] = snap.events.map((e) => ({ id: e.id, t: ms(e.t)!, type: e.type, text: e.text, n: e.n ?? undefined }));
  const k = snap.kingdom;
  // keep the local in-progress session (it is the freshest); otherwise resume one saved by another device
  const session = s.session ?? (k?.active_session && k.active_session.status !== 'ended' ? k.active_session : null);
  return {
    ...s, res: num(snap.balance), lifetime: num(snap.lifetime), sessions, habits, completions: comps,
    buildings: buildings.length ? buildings : s.buildings, battalions, squads, techs: snap.techs as TechId[], events: events.length ? events : s.events,
    stage: Math.max(s.stage, k?.stage ?? 1), achievements: [...new Set([...s.achievements, ...(k?.achievements ?? [])])],
    world: k?.world ?? s.world,
    subjects: [...new Set([...s.subjects, ...(k?.subjects ?? [])])], settings: k?.settings && Object.keys(k.settings).length ? { ...s.settings, ...k.settings } : s.settings, session,
  };
}
