import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studyReward, ZERO, add, type Res } from './rewards.ts';
import { startSession, tick, checkIn, pause, takeBreak, endSession, isAwaiting, MIN } from './study.ts';
import { progress, streak, type Habit, consistency } from './habits.ts';
import * as S from './state.ts';

test('rewards grow exponentially with session length', () => {
  assert.deepEqual(studyReward(25 * MIN), { gold: 283, wood: 141, stone: 85, renown: 28 });
  assert.deepEqual(studyReward(60 * MIN), { gold: 820, wood: 410, stone: 246, renown: 82 });
  assert.equal(studyReward(120 * MIN).gold, 2297);
  let prev = -1, prevRate = 0;
  for (let m = 1; m <= 300; m++) { const g = studyReward(m * MIN).gold; assert.ok(g > prev); const rate = g / m; assert.ok(rate >= prevRate - 0.2, 'longer sessions pay at least as well per minute'); prev = g; prevRate = rate; }
  assert.ok(studyReward(120 * MIN).gold > 2 * studyReward(60 * MIN).gold, 'one long session beats two short ones');
  assert.equal(studyReward(90 * 1000).gold, 15); // seconds count, nothing rounded away
});

const cfg = { intervalMin: 30, graceMin: 2, pomodoro: false, breakMin: 5, longBreakMin: 15 };
test('check-ins verify time; a miss pauses and forfeits only unverified time', () => {
  let s = startSession('Math', 0, cfg);
  assert.ok(isAwaiting(s, 30 * MIN));
  s = checkIn(s, 31 * MIN); assert.equal(s.verifiedMs, 31 * MIN);
  s = tick(s, 31 * MIN + 32 * MIN + 1); assert.equal(s.status, 'missed'); assert.equal(s.verifiedMs, 31 * MIN);
  s = tick(s, 500 * MIN); assert.equal(s.verifiedMs, 31 * MIN); // a background tab earns nothing
  s = checkIn(s, 500 * MIN); s = endSession(s, 510 * MIN);
  assert.equal(s.verifiedMs, 41 * MIN); assert.equal(s.checkIns.filter((c) => c.missed).length, 1);
});
test('pause, pomodoro break and clock rollback', () => {
  let s = startSession('X', 0, { ...cfg, intervalMin: 25, pomodoro: true });
  s = takeBreak(s, 25 * MIN); assert.equal(s.status, 'break'); assert.equal(s.breakUntil, 30 * MIN);
  s = checkIn(s, 40 * MIN); s = pause(s, 50 * MIN); assert.equal(s.verifiedMs, 35 * MIN);
  s = checkIn(s, 100 * MIN); s = tick(s, 90 * MIN); assert.equal(s.status, 'paused');
  assert.equal(endSession(s, 90 * MIN).verifiedMs, 35 * MIN);
});
test('habits: targets, no double claim, streaks survive rest day', () => {
  const h: Habit = { id: 'a', name: 'Water', freq: 'daily', target: 3, unit: 'glasses', weight: 2, requireNote: false, log: {}, done: [], created: 0, best: 0, earned: ZERO };
  const d1 = new Date(2026, 0, 10, 9), d2 = new Date(2026, 0, 11, 9), d3 = new Date(2026, 0, 12, 8);
  let r = progress(h, d1)!; assert.equal(r.completed, false);
  r = progress(r.habit, d1, 5)!; assert.equal(r.completed, true);
  assert.equal(progress(r.habit, d1), null);
  const x = progress(r.habit, d2, 3)!.habit;
  assert.equal(streak(x, d3), 2);
  assert.ok(consistency(x, d3, 2) > 0.6);
});

function fresh() { const s = S.newGame(); S._with(s); return s; }
const give = (r: Partial<Res>) => S._with({ ...S.getState(), res: add(S.getState().res, r) });
const ledgerSum = () => S.getState().outbox.ledger.reduce((a, l) => add(a, l.amt), { ...ZERO });

test('economy: build, recruit, stage progression, ledger matches balance', () => {
  fresh(); give({ gold: 5000, wood: 3000, stone: 500 });
  const extra = { gold: 5000, wood: 3000, stone: 500, renown: 0 };
  assert.equal(S.build('barracks', 10, 10), 'Requires stage 2: Small Settlement');
  S.build('hut', 30, 30); S.build('hut', 33, 30); S.build('farm', 30, 40);
  for (let i = 0; i < 6; i++) S.build('road', 20 + i, 20);
  assert.equal(S.getState().stage, 2);
  assert.equal(S.build('hut', 30, 30), 'Cannot build there');
  assert.equal(S.build('barracks', 50, 10), null);
  assert.equal(S.recruit('militia', 13), null);
  const st = S.getState();
  assert.equal(S.armySize(st), 13); assert.equal(st.squads.length, 2); assert.equal(st.battalions.length, 1);
  assert.deepEqual(add(ledgerSum(), extra), st.res); // every change is in the ledger
  assert.match(S.recruit('militia', 9999) ?? '', /capacity/);
});
test('study session rewards land in the ledger once, and give troop xp', () => {
  fresh(); give({ gold: 100 }); S.recruit('peasant', 5);
  const t0 = Date.now(); const real = Date.now;
  try {
    Date.now = () => t0; S.studyStart('Math');
    Date.now = () => t0 + 29 * MIN; S.studyCheckIn(); S.studyCheckIn(); // second verify adds nothing
    Date.now = () => t0 + 60 * MIN; S.studyEnd();
  } finally { Date.now = real; }
  const s = S.getState(), rows = s.outbox.ledger.filter((l) => l.kind === 'study');
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].amt, { gold: 820, wood: 410, stone: 246, renown: 82 });
  assert.equal(s.sessions[0].verifiedSec, 3600); assert.equal(s.session, null);
  assert.ok(s.squads[0].xp >= 60);
  assert.equal(S.logManual('Math', 60, Date.now() - 1000, ''), null);
  assert.deepEqual(S.getState().sessions[0].reward, { gold: 410, wood: 205, stone: 123, renown: 41 });
});
test('promotion requires xp, building and renown', () => {
  fresh(); give({ gold: 2000, wood: 500, renown: 100 }); assert.match(S.recruit('peasant', 12) ?? '', /capacity/); S.recruit('peasant', 10);
  const q = S.getState().squads[0];
  assert.match(S.promote(q.id) ?? '', /XP/);
  S._with({ ...S.getState(), squads: S.getState().squads.map((x) => ({ ...x, xp: 100 })) });
  assert.match(S.promote(q.id) ?? '', /Barracks/);
});

test('compensation grants an hour at 3x once, within the server ceiling', () => {
  S.setState(S.newGame(), false);
  const id = S.stableUuid('lan-loading-2026-11:user-a');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, S.stableUuid('lan-loading-2026-11:user-a'));
  assert.notEqual(id, S.stableUuid('lan-loading-2026-11:user-b'));
  const before = S.getState().res.gold;
  S.grantCompensation(id, 60, 3, 'Mathematics', 'test'); S.grantCompensation(id, 60, 3, 'Mathematics', 'test');
  const s = S.getState(), rec = s.sessions.filter((r) => r.id === id);
  assert.equal(rec.length, 1, 'granted once');
  assert.equal(rec[0].verifiedSec, 3600);
  assert.equal(rec[0].reward.gold, studyReward(60 * MIN, undefined, undefined, 3).gold);
  assert.equal(s.res.gold - before, rec[0].reward.gold);
  assert.equal(s.outbox.ledger.filter((l) => l.ref === id).length, 1);
  for (const [k, c] of Object.entries({ gold: 100, wood: 50, stone: 30, renown: 12 })) assert.ok(rec[0].reward[k as keyof Res] <= 60 * c);
});

test('battalions split in half, by company, by troop type or by hand, and merge back', () => {
  const g = S.newGame(); g.res = { gold: 1e6, wood: 1e6, stone: 1e6, renown: 1e4 };
  g.buildings.push({ id: 'b1', kind: 'barracks', x: 1, y: 1, level: 3, done: 0 } as never, { id: 'r1', kind: 'range', x: 5, y: 1, level: 3, done: 0 } as never, ...Array.from({ length: 20 }, (_, i) => ({ id: 'h' + i, kind: 'house', x: 10 + i * 3, y: 30, level: 3, done: 0 }) as never));
  g.stage = 5; g.techs = ['longbow', 'polearms'] as never;
  S.setState(g, false);
  S.recruit('spearman', 48); S.recruit('archer', 24);
  const bat = () => S.getState().battalions[0].id, size = (id: string) => S.batSize(S.getState(), id), total = () => S.armySize(S.getState());
  assert.equal(total(), 72);
  S.splitBattalion(bat(), { kind: 'half' }, 'patrol');
  let s = S.getState(); assert.equal(s.battalions.length, 2);
  const det = s.battalions[1];
  assert.equal(det.orders, 'patrol'); assert.equal(det.color, s.battalions[0].color);
  assert.equal(size(det.id), 36, 'even split'); assert.equal(total(), 72);
  for (const cls of ['spearman', 'archer']) assert.equal(s.squads.filter((q) => q.bat === det.id && q.cls === cls).reduce((a, q) => a + q.count, 0), cls === 'spearman' ? 24 : 12, `keeps the mix of ${cls}`);
  S.mergeBattalion(det.id, bat()); assert.equal(S.getState().battalions.length, 1); assert.equal(size(bat()), 72);
  S.splitBattalion(bat(), { kind: 'class', cls: 'archer' }, 'garrison', 'Wall archers');
  s = S.getState(); const arch = s.battalions.find((b) => b.name === 'Wall archers')!;
  assert.ok(s.squads.filter((q) => q.bat === arch.id).every((q) => q.cls === 'archer')); assert.equal(size(arch.id), 24);
  assert.equal(S.companiesOf(s, bat()).length, 1);
  assert.match(String(S.splitBattalion(bat(), { kind: 'company', index: 0 })), /not all/);
  const one = s.squads.find((q) => q.bat === bat())!;
  S.splitBattalion(bat(), { kind: 'squads', ids: [one.id] }); assert.equal(S.getState().battalions.length, 3);
  // a lone squad is halved
  const lone = S.getState().battalions[2].id; S.splitBattalion(lone, { kind: 'half' });
  s = S.getState(); assert.equal(s.battalions.length, 4); assert.equal(size(lone) + size(s.battalions[3].id), 12); assert.equal(total(), 72);
  // long names stay within the database limit
  S.editBattalion(bat(), { name: 'x'.repeat(60) }); S.splitBattalion(bat(), { kind: 'half' });
  assert.ok(S.getState().battalions.every((b) => b.name.length <= 60));
});

test('walls and palisades can be removed in bulk: a whole connected stretch, with one refund', () => {
  const g = S.newGame(), B = (kind: 'wall' | 'palisade' | 'road', x: number, y: number) => ({ id: `${kind}${x},${y}`, kind, x, y, level: 1, at: 0 });
  const wall = Array.from({ length: 12 }, (_, i) => B('wall', 10 + i, 20)), other = [B('wall', 30, 20), B('palisade', 11, 21), B('road', 10, 19)];
  S._with({ ...g, res: { gold: 0, wood: 0, stone: 0, renown: 0 }, buildings: [...g.buildings, ...wall, ...other] });
  const ids = S.connectedOf(S.getState(), 'wall15,20');
  assert.equal(ids.length, 12, 'the whole wall, not the separate section nor the palisade beside it');
  const back = wall.reduce((a, b) => add(a, S.refundOf(b)), ZERO);
  assert.equal(S.demolishMany(ids), null);
  const s = S.getState();
  assert.equal(s.buildings.filter((b) => b.kind === 'wall').length, 1); assert.ok(s.buildings.some((b) => b.kind === 'palisade') && s.buildings.some((b) => b.kind === 'road'));
  assert.deepEqual(s.res, back, 'half the cost back, in one go');
  assert.equal(s.outbox.ledger.filter((l) => l.kind === 'refund').length, 1, 'one refund row');
  assert.match(S.demolishMany([g.buildings[0].id]) ?? '', /Nothing/, 'the camp stays');
});
