import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studyReward, ZERO, add, type Res } from './rewards.ts';
import { startSession, tick, checkIn, pause, takeBreak, endSession, isAwaiting, MIN } from './study.ts';
import { progress, streak, type Habit, consistency } from './habits.ts';
import * as S from './state.ts';

test('rewards are strictly proportional to minutes', () => {
  assert.deepEqual(studyReward(25 * MIN), { gold: 250, wood: 125, stone: 75, renown: 25 });
  assert.deepEqual(studyReward(60 * MIN), { gold: 600, wood: 300, stone: 180, renown: 60 });
  assert.deepEqual(studyReward(120 * MIN), { gold: 1200, wood: 600, stone: 360, renown: 120 });
  let prev = -1; for (let m = 1; m <= 300; m++) { const g = studyReward(m * MIN).gold; assert.ok(g > prev); prev = g; }
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
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].amt, { gold: 600, wood: 300, stone: 180, renown: 60 });
  assert.equal(s.sessions[0].verifiedSec, 3600); assert.equal(s.session, null);
  assert.ok(s.squads[0].xp >= 60);
  assert.equal(S.logManual('Math', 60, Date.now() - 1000, ''), null);
  assert.deepEqual(S.getState().sessions[0].reward, { gold: 300, wood: 150, stone: 90, renown: 30 });
});
test('promotion requires xp, building and renown', () => {
  fresh(); give({ gold: 2000, wood: 500, renown: 100 }); assert.match(S.recruit('peasant', 12) ?? '', /capacity/); S.recruit('peasant', 10);
  const q = S.getState().squads[0];
  assert.match(S.promote(q.id) ?? '', /XP/);
  S._with({ ...S.getState(), squads: S.getState().squads.map((x) => ({ ...x, xp: 100 })) });
  assert.match(S.promote(q.id) ?? '', /Barracks/);
});
