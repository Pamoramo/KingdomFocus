import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldForMinutes } from './rewards.ts';
import { startSession, tick, checkIn, pause, endSession, sessionRewards, CHECK_MS, GRACE_MS, isAwaiting } from './study.ts';
import { claim, streak, type Habit } from './habits.ts';

const M = 60_000;
test('gold tiers match spec', () => {
  assert.deepEqual([25, 50, 75, 100, 120].map(goldForMinutes), [250, 625, 1125, 1750, 2350]);
  assert.equal(goldForMinutes(0), 0);
  assert.equal(goldForMinutes(26), 265);
});

test('verified chain with check-ins earns escalating gold', () => {
  let s = startSession('Math', 0);
  for (let i = 1; i <= 8; i++) {
    const t = i * CHECK_MS + 30_000 * i; // respond 30s late each time (still within grace)
    assert.ok(isAwaiting(s, t));
    s = checkIn(tick(s, t), t);
  }
  s = endSession(s, 8 * CHECK_MS + 8 * 30_000);
  const min = Math.floor(s.verifiedMs / M);
  assert.equal(min, 124);
  assert.equal(sessionRewards(s).gold, goldForMinutes(124));
  assert.equal(s.checkIns.filter((c) => !c.missed).length, 8);
});

test('missed check-in pauses, forfeits pending, keeps earned, resets chain', () => {
  let s = startSession('History', 0);
  s = checkIn(s, CHECK_MS + 1000); // verified ~15m
  const earned = sessionRewards(s).gold;
  s = tick(s, 2 * CHECK_MS + 1000 + GRACE_MS + 1); // missed
  assert.equal(s.status, 'missed');
  assert.equal(sessionRewards(s).gold, earned);
  assert.equal(s.checkIns.at(-1)!.missed, true);
  // background tab returning hours later earns nothing extra
  s = tick(s, 10 * CHECK_MS);
  assert.equal(sessionRewards(s).gold, earned);
  s = checkIn(s, 10 * CHECK_MS);
  assert.equal(s.status, 'running');
  s = endSession(s, 10 * CHECK_MS + 10 * M);
  assert.equal(s.chains.length, 2);
  assert.equal(sessionRewards(s).gold, earned + 100);
});

test('pause stops time and preserves chain; clock rollback not credited', () => {
  let s = startSession('X', 0);
  s = pause(s, 10 * M);
  s = tick(s, 500 * M);
  s = checkIn(s, 500 * M);
  s = tick(s, 400 * M); // clock moved backwards
  assert.equal(s.status, 'paused');
  s = endSession(s, 400 * M);
  assert.equal(Math.floor(s.verifiedMs / M), 10);
});

test('habits: no double claim, streaks', () => {
  const h: Habit = { id: 'a', name: 'Run', freq: 'daily', reward: { gold: 50, wood: 0, stone: 0, renown: 1 }, done: [], created: 0, best: 0 };
  const d1 = new Date(2026, 0, 10, 9), d2 = new Date(2026, 0, 11, 9), d3 = new Date(2026, 0, 12, 20);
  let x = claim(h, d1)!;
  assert.equal(claim(x, d1), null);
  x = claim(x, d2)!;
  assert.equal(streak(x, d3), 2); // today not yet done: no penalty
  x = claim(x, d3)!;
  assert.equal(streak(x, d3), 3);
  assert.equal(x.best, 3);
});
