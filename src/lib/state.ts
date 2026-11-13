import { type Res, ZERO, add, canAfford, full } from './rewards.ts';
import { type Session, startSession, tick, checkIn, pause, endSession, sessionRewards } from './study.ts';
import { type Habit, claim, streak, streakBonus } from './habits.ts';
import { BUILDINGS, TROOPS, type BKind, type TClass, SQUAD_SIZE, armorCost, armorKeepReq, BANNER_COLORS } from './economy.ts';

export interface Building { id: string; kind: BKind; x: number; y: number; level: number }
export interface Battalion { id: string; name: string; color: number; emblem: string; commander: string; x: number; y: number }
export interface Squad { id: string; cls: TClass; count: number; bat: string }
export interface GameState {
  v: 1; updatedAt: number; res: Res; lifetime: Res;
  buildings: Building[]; battalions: Battalion[]; squads: Squad[];
  armor: Partial<Record<TClass, number>>;
  session: Session | null; history: Session[]; subjects: string[];
  habits: Habit[]; achievements: string[]; requireNote: boolean; sound: boolean;
}

export const MAP_W = 64, MAP_H = 48, TILE = 16;
const uid = () => Math.random().toString(36).slice(2, 10);

export function newGame(): GameState {
  return {
    v: 1, updatedAt: Date.now(), res: { gold: 200, wood: 100, stone: 0, renown: 0 }, lifetime: { ...ZERO },
    buildings: [{ id: uid(), kind: 'keep', x: 30, y: 21, level: 1 }],
    battalions: [{ id: 'b1', name: 'First Watch', color: BANNER_COLORS[0], emblem: 'lion', commander: 'Aldric', x: 36 * TILE, y: 30 * TILE }],
    squads: [{ id: uid(), cls: 'militia', count: 6, bat: 'b1' }],
    armor: {}, session: null, history: [], subjects: ['Mathematics', 'Languages', 'Science', 'Programming', 'Reading'],
    habits: [], achievements: [], requireNote: false, sound: true,
  };
}

// ---------- store ----------
type L = () => void;
let state: GameState = newGame();
const listeners = new Set<L>();
export const fxBus = new EventTarget();
export type Fx = { kind: 'reward' | 'build' | 'error' | 'info' | 'achieve'; text: string; res?: Partial<Res>; x?: number; y?: number };
export const emit = (fx: Fx) => fxBus.dispatchEvent(new CustomEvent('fx', { detail: fx }));

export const getState = () => state;
export const subscribe = (l: L) => (listeners.add(l), () => listeners.delete(l));
export function setState(next: GameState, touch = true) {
  state = touch ? { ...next, updatedAt: Date.now() } : next;
  listeners.forEach((l) => l());
}
function update(fn: (s: GameState) => GameState | string | void): string | null {
  const r = fn(state);
  if (typeof r === 'string') { emit({ kind: 'error', text: r }); return r; }
  if (r) setState(checkAchievements(r));
  return null;
}

// ---------- derived ----------
export const keepLevel = (s: GameState) => s.buildings.find((b) => b.kind === 'keep')?.level ?? 1;
export const maxLevel = (s: GameState, k: BKind) => Math.max(0, ...s.buildings.filter((b) => b.kind === k).map((b) => b.level));
export const armyCap = (s: GameState) => 20 + s.buildings.reduce((a, b) => a + (b.kind === 'farm' ? 40 * b.level : b.kind === 'house' ? 15 * b.level : 0), 0) + 20 * keepLevel(s);
export const armySize = (s: GameState) => s.squads.reduce((a, q) => a + q.count, 0);
export const levelReq = (s: GameState, k: BKind | 'keep', lvl: number) => (k === 'keep' ? keepLevel(s) : maxLevel(s, k)) >= lvl;
export const troopUnlocked = (s: GameState, c: TClass) =>
  Object.entries(TROOPS[c].req).every(([k, l]) => levelReq(s, k as BKind, l!));

function grant(s: GameState, r: Partial<Res>): GameState {
  const f = full(r);
  return { ...s, res: add(s.res, f), lifetime: add(s.lifetime, f) };
}

// ---------- construction ----------
export function canPlace(s: GameState, kind: BKind, x: number, y: number, ignore?: string) {
  const n = BUILDINGS[kind].size;
  if (x < 1 || y < 1 || x + n > MAP_W - 1 || y + n > MAP_H - 1) return false;
  return !s.buildings.some((b) => {
    if (b.id === ignore) return false;
    const m = BUILDINGS[b.kind].size;
    return x < b.x + m && x + n > b.x && y < b.y + m && y + n > b.y;
  });
}
export const build = (kind: BKind, x: number, y: number) => update((s) => {
  const d = BUILDINGS[kind], lv = d.levels[0];
  if (d.unique && s.buildings.some((b) => b.kind === kind)) return 'Only one allowed';
  if (keepLevel(s) < lv.keep) return `Requires ${BUILDINGS.keep.levels[lv.keep - 1].name}`;
  if (!canPlace(s, kind, x, y)) return 'Cannot build there';
  if (!canAfford(s.res, lv.cost)) return 'Not enough resources';
  emit({ kind: 'build', text: lv.name, x: (x + d.size / 2) * TILE, y: (y + d.size / 2) * TILE });
  return { ...s, res: add(s.res, full(lv.cost), -1), buildings: [...s.buildings, { id: uid(), kind, x, y, level: 1 }] };
});
export const upgrade = (id: string) => update((s) => {
  const b = s.buildings.find((q) => q.id === id); if (!b) return;
  const d = BUILDINGS[b.kind], lv = d.levels[b.level];
  if (!lv) return 'Max level';
  if (keepLevel(s) < lv.keep) return `Requires ${BUILDINGS.keep.levels[lv.keep - 1].name}`;
  if (!canAfford(s.res, lv.cost)) return 'Not enough resources';
  emit({ kind: 'build', text: lv.name, x: (b.x + d.size / 2) * TILE, y: (b.y + d.size / 2) * TILE });
  return { ...s, res: add(s.res, full(lv.cost), -1), buildings: s.buildings.map((q) => (q.id === id ? { ...q, level: q.level + 1 } : q)) };
});
export const demolish = (id: string) => update((s) => {
  const b = s.buildings.find((q) => q.id === id);
  if (!b || b.kind === 'keep') return 'Cannot demolish the keep';
  return { ...s, buildings: s.buildings.filter((q) => q.id !== id) };
});
export const move = (id: string, x: number, y: number) => update((s) => {
  const b = s.buildings.find((q) => q.id === id); if (!b) return;
  if (!canPlace(s, b.kind, x, y, id)) return 'Cannot move there';
  return { ...s, buildings: s.buildings.map((q) => (q.id === id ? { ...q, x, y } : q)) };
});

// ---------- army ----------
export const recruit = (cls: TClass, n: number, bat: string) => update((s) => {
  const d = TROOPS[cls];
  if (!troopUnlocked(s, cls)) return 'Not unlocked yet';
  if (armySize(s) + n > armyCap(s)) return 'Army cap reached: build farms & cottages';
  if (!canAfford(s.res, d.cost, n)) return 'Not enough resources';
  let left = n; const squads = s.squads.map((q) => {
    if (left && q.bat === bat && q.cls === cls && q.count < SQUAD_SIZE) {
      const t = Math.min(left, SQUAD_SIZE - q.count); left -= t; return { ...q, count: q.count + t };
    } return q;
  });
  while (left > 0) { const t = Math.min(left, SQUAD_SIZE); squads.push({ id: uid(), cls, count: t, bat }); left -= t; }
  emit({ kind: 'info', text: `Recruited ${n} ${d.name}` });
  return { ...s, res: add(s.res, full(d.cost), -n), squads };
});
export const upgradeArmor = (cls: TClass) => update((s) => {
  const t = (s.armor[cls] ?? 0) + 1;
  if (t > 3) return 'Max armor';
  if (keepLevel(s) < armorKeepReq(t)) return `Requires ${BUILDINGS.keep.levels[armorKeepReq(t) - 1].name}`;
  const c = armorCost(cls, t);
  if (!canAfford(s.res, c)) return 'Not enough resources';
  emit({ kind: 'info', text: `${TROOPS[cls].name} armor upgraded` });
  return { ...s, res: add(s.res, full(c), -1), armor: { ...s.armor, [cls]: t } };
});
export const newBattalion = (name: string) => update((s) => {
  if (s.battalions.length >= 12) return 'Too many battalions';
  const i = s.battalions.length;
  return { ...s, battalions: [...s.battalions, { id: uid(), name, color: BANNER_COLORS[i % BANNER_COLORS.length], emblem: 'cross', commander: 'Unnamed', x: (24 + (i % 4) * 6) * TILE, y: (34 + Math.floor(i / 4) * 4) * TILE }] };
});
export const editBattalion = (id: string, p: Partial<Battalion>) => update((s) => ({ ...s, battalions: s.battalions.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
export const disbandBattalion = (id: string) => update((s) => {
  if (s.battalions.length <= 1) return 'Keep at least one battalion';
  const to = s.battalions.find((b) => b.id !== id)!.id;
  return { ...s, battalions: s.battalions.filter((b) => b.id !== id), squads: s.squads.map((q) => (q.bat === id ? { ...q, bat: to } : q)) };
});
export const transferSquad = (sid: string, bat: string) => update((s) => ({ ...s, squads: s.squads.map((q) => (q.id === sid ? { ...q, bat } : q)) }));
export const marchTo = (id: string, x: number, y: number) => editBattalion(id, {
  x: Math.max(TILE, Math.min((MAP_W - 1) * TILE, x)), y: Math.max(TILE, Math.min((MAP_H - 1) * TILE, y)),
});

// ---------- study ----------
function settle(s: GameState, sess: Session): GameState {
  const total = sessionRewards(sess);
  const delta = { gold: total.gold - sess.awarded.gold, wood: total.wood - sess.awarded.wood, stone: total.stone - sess.awarded.stone, renown: total.renown - sess.awarded.renown };
  const sess2 = { ...sess, awarded: total };
  let out: GameState = { ...s, session: sess2.status === 'ended' ? null : sess2 };
  if (sess2.status === 'ended') out.history = [sess2, ...s.history].slice(0, 500);
  if (delta.gold > 0 || delta.wood > 0) { out = grant(out, delta); emit({ kind: 'reward', text: 'Study rewards', res: delta }); }
  return out;
}
export const studyStart = (subject: string) => update((s) => {
  if (s.session) return 'A session is already running';
  const subjects = s.subjects.includes(subject) ? s.subjects : [...s.subjects, subject];
  return { ...s, subjects, session: startSession(subject, Date.now()) };
});
export const studyTick = () => {
  const s = state; if (!s.session) return;
  const t = tick(s.session, Date.now());
  if (t.status !== s.session.status) {
    if (t.status === 'missed') emit({ kind: 'error', text: 'Check-in missed: timer paused. Earned rewards are kept.' });
    setState(settle(s, t));
  }
};
export const studyCheckIn = (note?: string) => update((s) => s.session ? settle(s, checkIn(s.session, Date.now(), note)) : undefined);
export const studyPause = () => update((s) => s.session ? settle(s, pause(s.session, Date.now())) : undefined);
export const studyEnd = () => update((s) => s.session ? settle(s, endSession(s.session, Date.now())) : undefined);
export const setPref = (p: Partial<Pick<GameState, 'requireNote' | 'sound'>>) => update((s) => ({ ...s, ...p }));

// ---------- habits ----------
export const addHabit = (name: string, freq: Habit['freq'], reward: Res) =>
  update((s) => ({ ...s, habits: [...s.habits, { id: uid(), name, freq, reward, done: [], created: Date.now(), best: 0 }] }));
export const removeHabit = (id: string) => update((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }));
export const claimHabit = (id: string) => update((s) => {
  const h = s.habits.find((q) => q.id === id); if (!h) return;
  const now = new Date(), next = claim(h, now);
  if (!next) return 'Already completed this period';
  const k = streakBonus(streak(next, now) - 1);
  const r = { gold: Math.round(h.reward.gold * k), wood: Math.round(h.reward.wood * k), stone: Math.round(h.reward.stone * k), renown: Math.round(h.reward.renown * k) };
  emit({ kind: 'reward', text: h.name, res: r });
  return grant({ ...s, habits: s.habits.map((q) => (q.id === id ? next : q)) }, r);
});

// ---------- achievements ----------
const studyMin = (s: GameState) => Math.floor(s.history.reduce((a, h) => a + h.verifiedMs, 0) / 60000);
export const ACHIEVEMENTS: { id: string; name: string; desc: string; renown: number; test: (s: GameState) => boolean }[] = [
  { id: 'first', name: 'First Steps', desc: 'Finish a study session', renown: 5, test: (s) => s.history.length > 0 },
  { id: 'hour', name: 'Hour of Focus', desc: '60 continuous verified minutes', renown: 15, test: (s) => s.history.some((h) => h.chains.some((c) => c >= 3600000)) },
  { id: 'marathon', name: 'Marathon Scholar', desc: '120 continuous verified minutes', renown: 40, test: (s) => s.history.some((h) => h.chains.some((c) => c >= 7200000)) },
  { id: 'ten', name: 'Apprentice', desc: '10 hours studied', renown: 50, test: (s) => studyMin(s) >= 600 },
  { id: 'hundred', name: 'Master Scholar', desc: '100 hours studied', renown: 300, test: (s) => studyMin(s) >= 6000 },
  { id: 'habit7', name: 'Steadfast', desc: 'Reach a 7-period habit streak', renown: 30, test: (s) => s.habits.some((h) => h.best >= 7) },
  { id: 'hall', name: 'Lord of the Hall', desc: 'Build the Wooden Hall', renown: 10, test: (s) => keepLevel(s) >= 2 },
  { id: 'castle', name: 'Castellan', desc: 'Raise a Castle', renown: 100, test: (s) => keepLevel(s) >= 4 },
  { id: 'army100', name: 'Warband', desc: 'Command 100 soldiers', renown: 25, test: (s) => armySize(s) >= 100 },
  { id: 'army1000', name: 'Grand Host', desc: 'Command 1000 soldiers', renown: 200, test: (s) => armySize(s) >= 1000 },
];
function checkAchievements(s: GameState): GameState {
  let out = s;
  for (const a of ACHIEVEMENTS) if (!out.achievements.includes(a.id) && a.test(out)) {
    out = grant({ ...out, achievements: [...out.achievements, a.id] }, { renown: a.renown });
    emit({ kind: 'achieve', text: `${a.name}: +${a.renown} renown` });
  }
  return out;
}
export { canAfford };
