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

test('spoils and tribute grow with the strength of the realm; great prizes are paid within the cloud limits', async () => {
  const { conquestSpoils, fieldSpoils, defenceSpoils, vassalGold } = await import('./war.ts');
  const weak = { level: 1, power: 100 }, mid = { level: 3, power: 1400 }, great = { level: 5, power: 9000 };
  for (const f of [conquestSpoils, fieldSpoils, defenceSpoils]) { assert.ok(f(mid).gold > f(weak).gold && f(great).gold > f(mid).gold, 'stronger realm, bigger spoils'); assert.ok(f(great).renown > f(weak).renown); }
  assert.ok(conquestSpoils({ level: 4, power: 50 }).gold >= conquestSpoils({ level: 4, power: 1 }).gold && conquestSpoils({ level: 4, power: 50 }).gold > 3000, 'a battered great castle still holds its treasury');
  assert.ok(vassalGold({ level: 5 }) > vassalGold({ level: 1 }), 'greater vassals pay more tribute');
  // conquering a great power: spoils above the per-row loot limit are split, so the cloud accepts them
  let w = initWorld(5); const r = { ...w.rivals.find((x) => tierOf(x) === 'far')!, power: 9000, level: 5, status: 'war' as const, known: true };
  w = { ...w, rivals: w.rivals.map((x) => (x.id === r.id ? r : x)) };
  S._with({ ...S.newGame(), world: { ...w, campaign: { target: r.id, battalions: [], engines: { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 }, supplies: 0, phase: 'siege', day: 9, progressMin: 0, wallHp: 0, wallMax: 100, garrison: 0, garrisonMorale: 0, morale: 100, stance: 'bombard', allies: [], log: [], started: Date.now() } } });
  const g0 = S.getState().res.gold;
  for (let i = 0; i < 50 && S.getState().world.campaign; i++) WA.demandSurrender(); // a starved, wall-less castle yields
  const loot = conquestSpoils(r), rows = S.getState().outbox.ledger.filter((l) => l.kind === 'loot');
  assert.equal(S.getState().res.gold - g0, loot.gold, 'paid in full');
  assert.ok(rows.length >= 2 && rows.every((l) => l.amt.gold <= 10000 && l.amt.stone <= 3000 && l.amt.renown <= 400), 'in rows the cloud accepts');
});
