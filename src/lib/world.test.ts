import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './state.ts';
import * as WA from './warActions.ts';
import { initWorld, upgradeWorld, leagues, tierOf, isKnown, discover, advanceDays, travelMs, WORLD_SCALE, type WorldState } from './war.ts';

test('the world grows: old saves keep their neighbours at the same distance, with many more realms beyond', () => {
  const w2 = initWorld(42), old = { ...w2, v: undefined, rivals: w2.rivals.filter((r) => !/^w\d/.test(r.id)).map((r) => ({ ...r, x: 0.5 + (r.x - 0.5) * WORLD_SCALE, y: 0.5 + (r.y - 0.5) * WORLD_SCALE, known: undefined })) } as WorldState;
  const up = upgradeWorld(old);
  assert.equal(up.v, 2); assert.equal(upgradeWorld(up), up, 'only once');
  for (const r of old.rivals) { const n = up.rivals.find((x) => x.id === r.id)!; assert.ok(Math.abs(leagues(n) - Math.hypot(r.x - 0.5, r.y - 0.5)) < 1e-9, 'same distance as before'); assert.ok(isKnown(n)); }
  const kingdoms = up.rivals.filter((r) => !r.bandits);
  assert.ok(kingdoms.length >= 20, `many realms (${kingdoms.length})`);
  const fresh = up.rivals.filter((r) => /^w\d/.test(r.id));
  assert.ok(fresh.every((r) => !isKnown(r)), 'new realms start uncharted');
  assert.ok(fresh.every((r) => r.x > 0.03 && r.x < 0.97 && r.y > 0.05 && r.y < 0.95), 'on the map');
  assert.deepEqual(new Set(fresh.map(tierOf)), new Set(['distant', 'far']));
  assert.equal(new Set(up.rivals.map((r) => r.name)).size, up.rivals.length, 'unique names');
  for (const a of fresh) for (const b of up.rivals) if (a !== b) assert.ok(Math.hypot((a.x - b.x) * WORLD_SCALE, (a.y - b.y) * WORLD_SCALE) > 0.15, 'not on top of each other');
  const far = fresh.find((r) => tierOf(r) === 'far')!, near = up.rivals.find((r) => tierOf(r) === 'neighbour' && !r.bandits)!;
  assert.ok(travelMs('army', far) > travelMs('army', near) * 2, 'far kingdoms are a long march away');
  assert.ok(far.level >= 3, 'far kingdoms are great powers');
});

test('discovery: your maps grow with your castle; expeditions chart the unknown', () => {
  const w = initWorld(9), d1 = discover(w, 1), d5 = discover(w, 5, 8);
  assert.ok(d5.w.rivals.filter(isKnown).length > d1.w.rivals.filter(isKnown).length, 'a greater realm knows more of the world');
  S._with({ ...S.newGame(), world: w, res: { gold: 9999, wood: 999, stone: 0, renown: 0 } });
  const target = WA.nextUncharted(S.getState())!; assert.ok(target && !isKnown(target));
  assert.equal(WA.sendExpedition(), null); assert.match(WA.sendExpedition() ?? '', /already/);
  WA.journeysTick(Date.now() + 3_600_000);
  const s = S.getState();
  assert.ok(isKnown(s.world.rivals.find((r) => r.id === target.id)!), 'charted');
  assert.ok(s.res.renown > 0, 'and the realm is proud of it');
  assert.match(WA.trade(WA.nextUncharted(s)!.id, 'gold', 100, 'stone') ?? '', /charted/, 'no trade with realms you have not found');
});

test('far kingdoms barely concern you: they never invade, rarely write, and their trade is costlier', () => {
  let w = initWorld(3); w = { ...w, lastDay: '2026-01-01', rivals: w.rivals.map((r) => ({ ...r, known: true, relation: tierOf(r) === 'far' ? -100 : r.bandits ? r.relation : 30, personality: tierOf(r) === 'far' ? 'aggressive' as const : r.personality })) };
  const farIds = new Set(w.rivals.filter((r) => tierOf(r) === 'far').map((r) => r.id));
  for (let i = 2; i < 29; i++) {
    w = advanceDays({ ...w, threat: null }, { stage: 5, myPower: 1, fort: 0, active: true }, `2026-01-${String(i).padStart(2, '0')}`);
    assert.ok(!w.threat || !farIds.has(w.threat.rival), 'no invasion from the far side of the world');
    assert.ok(!(w.warnings ?? []).some((x) => farIds.has(x.rival)), 'nor warnings of one');
    assert.ok(!w.inbox.some((m) => m.kind === 'tribute_demand' && farIds.has(m.rival)), 'nor tribute demands');
  }
});
