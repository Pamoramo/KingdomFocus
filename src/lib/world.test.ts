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

test('an unwalled town is simply entered: sacked if outnumbered, fought for in the streets if not; walls make them besiege', () => {
  const w0 = initWorld(9), foe = w0.rivals.find((r) => !r.bandits)!;
  const threat = (power: number) => ({ rival: foe.id, power, since: Date.now() - 60_000, allyHelp: [] });
  // outnumbered and no walls: sacked, and the threat is over
  S._with({ ...S.newGame(), res: { gold: 1000, wood: 500, stone: 500, renown: 0 }, world: { ...w0, threat: threat(5000) } });
  assert.equal(WA.walledOf(S.getState()), false);
  WA.breachTick();
  let s = S.getState(); assert.equal(s.world.threat, null, 'they did not wait to besiege');
  assert.equal(s.res.gold, 750, 'a quarter of the gold carried off'); assert.match(s.world.reports[0].title, /sacked/);
  // walled: nothing happens on its own; you choose how to defend
  const walls = Array.from({ length: 14 }, (_, i) => ({ id: `w${i}`, kind: 'wall' as const, x: 10 + i, y: 10, level: 1, at: 0 }));
  S._with({ ...S.newGame(), buildings: [...S.newGame().buildings, ...walls], world: { ...w0, threat: threat(5000) } });
  assert.equal(WA.walledOf(S.getState()), true); WA.breachTick();
  assert.ok(S.getState().world.threat, 'a walled castle is besieged, not entered');
  // too soon after they arrive: still time to pay them off
  S._with({ ...S.newGame(), world: { ...w0, threat: { ...threat(5000), since: Date.now() } } }); WA.breachTick();
  assert.ok(S.getState().world.threat);
});

test('sieges cut trade: besieged, you cannot send caravans; besieging, their friends and the roads past the siege are closed', async () => {
  const { canTrade, roadThrough } = await import('./war.ts');
  let w = initWorld(4); w = { ...w, rivals: w.rivals.map((r) => ({ ...r, known: true, status: r.bandits ? r.status : 'neutral' as const, friends: [] })) };
  const free = w.rivals.filter((r) => !r.bandits), a = free[0];
  assert.equal(canTrade(a, w, '-'), null, 'trade is open in peace');
  assert.match(canTrade(a, { ...w, threat: { rival: free[1].id, power: 100, since: 0, allyHelp: [] } }, '-')!, /besieged/);
  // a realm whose road runs through another
  const far = free.find((r) => roadThrough(w, r.id).length > 0)!, mid = roadThrough(w, far.id)[0];
  const sieging = { ...w, campaign: { target: mid } as never };
  assert.match(canTrade(far, sieging, '-')!, /runs past your siege/);
  const friend = free.find((r) => r.id !== mid && r.id !== far.id && !roadThrough(w, r.id).includes(mid))!;
  assert.equal(canTrade(friend, sieging, '-'), null, 'realms off the road still trade');
  assert.match(canTrade({ ...friend, friends: [mid] }, sieging, '-')!, /their friend/);
});

test('garrisons: stationed in vassal and allied castles, they raise tribute, screen the roads, march from there, and go home if turned out', async () => {
  const { roadThrough, screenOf, marchMs } = await import('./war.ts');
  let w = initWorld(4); w = { ...w, rivals: w.rivals.map((r) => ({ ...r, known: true })) };
  const far = w.rivals.find((r) => !r.bandits && roadThrough(w, r.id).some((x) => x !== 'bandits'))!, midId = roadThrough(w, far.id).find((x) => x !== 'bandits')!;
  w = { ...w, rivals: w.rivals.map((r) => (r.id === midId ? { ...r, status: 'vassal' as const } : r.id === far.id ? { ...r, status: 'war' as const } : r)) };
  S._with({ ...S.newGame(), world: w }); S.newBattalion('Vanguard'); const b0 = S.getState().battalions[0].id;
  S._with({ ...S.getState(), squads: [{ id: 'q1', cls: 'spearman', count: 10, xp: 0, rank: 0, bat: b0 }] });
  const bat = S.getState().battalions[0].id, before = S.studyMult(S.getState()).gold;
  assert.equal(WA.stationAt(far.id, [bat]), 'Only your vassals and allies will quarter your soldiers');
  assert.equal(WA.stationAt(midId, [bat]), null);
  assert.ok(WA.awayBats(S.getState()).has(bat), 'on the march');
  WA.journeysTick(Date.now() + 3600_000 * 5);
  assert.equal(S.getState().world.garrisons?.[0]?.at, midId, 'holding the vassal castle');
  assert.ok(WA.awayBats(S.getState()).has(bat) && WA.homeSquads(S.getState()).length === 0, 'not at home to defend you');
  assert.ok(S.studyMult(S.getState()).gold > before, 'the vassal pays more with your men collecting');
  assert.equal(screenOf(S.getState().world, far.id)?.id, midId, 'the road from the far realm runs past your garrison');
  // a campaign from the forward castle is a shorter march
  const t0 = Date.now(); assert.equal(WA.startCampaign(far.id, [bat], { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 }, 0), null);
  const c = S.getState().world.campaign!; assert.ok(c.arrive! - t0 <= marchMs(w.rivals.find((r) => r.id === midId)!, far) + 1000 && c.arrive! - t0 < marchMs(null, far), 'marches from the garrison');
  assert.equal((S.getState().world.garrisons ?? []).length, 0, 'the garrison left to fight');
  // a castle that turns against you sends the garrison home
  S._with({ ...S.getState(), world: { ...S.getState().world, campaign: null, garrisons: [{ bat, at: midId, since: 0 }], lastDay: '2000-01-01', rivals: S.getState().world.rivals.map((r) => (r.id === midId ? { ...r, status: 'neutral' as const } : r)) } });
  WA.worldTick();
  assert.equal((S.getState().world.garrisons ?? []).length, 0); assert.ok((S.getState().world.journeys ?? []).some((j) => j.kind === 'return' && j.bats?.includes(bat)), 'marching home');
});

test('the realm\'s calendar: real days by default, or shorter days that keep the count', async () => {
  const { clockOf, dayNumber, nextDayAt, dateOfDay, gameDay, setDayLength, dayStr } = await import('./war.ts');
  const t0 = new Date(2026, 4, 10, 15, 0).getTime(), first = new Date(2026, 4, 1, 9, 0).getTime();
  const c = clockOf({}, first, t0);
  assert.equal(dayNumber(c, t0), 10, 'counted from your first day'); assert.equal(dateOfDay(c, 10), dayStr(new Date(t0)), 'a real day is today\'s date');
  assert.equal(dayNumber(c, new Date(2026, 4, 11, 0, 1).getTime()), 11, 'the next day comes at midnight');
  assert.equal(new Date(nextDayAt(c, t0)).getHours(), 0);
  assert.equal(gameDay({}), dayStr(), 'a world without a clock is on today\'s date');
  // ten-minute days: the count goes on, and each day is the next date
  const f = setDayLength(c, 10, t0);
  assert.equal(dayNumber(f, t0), 10); assert.equal(dayNumber(f, t0 + 9 * 60000), 10); assert.equal(dayNumber(f, t0 + 10 * 60000), 11); assert.equal(dayNumber(f, t0 + 65 * 60000), 16);
  assert.equal(nextDayAt(f, t0 + 3 * 60000), t0 + 10 * 60000);
  assert.equal(dateOfDay(f, 11), dayStr(new Date(2026, 4, 11, 12)), 'the next game day is the next date');
  // back to real days: the count carries on from where it is
  const r = setDayLength(f, 1440, t0 + 65 * 60000); assert.equal(dayNumber(r, t0 + 65 * 60000), 16);
});

test('with short days the world takes a turn each time a day ends', async () => {
  const { gameDay, clockOf, dayNumber } = await import('./war.ts');
  const real = Date.now; let t = real();
  try {
    Date.now = () => t;
    S._with({ ...S.newGame() }); WA.worldTick(); // starts the calendar
    WA.setDayLength(10); const day0 = S.getState().world.lastDay, n0 = dayNumber(clockOf(S.getState().world), t);
    t += 11 * 60000; WA.worldTick();
    const w = S.getState().world; assert.equal(dayNumber(clockOf(w), t), n0 + 1);
    assert.equal(w.lastDay, gameDay(w, t)); assert.notEqual(w.lastDay, day0, 'a new day was played');
    assert.ok(w.rivals.filter((r) => !r.bandits).every((r) => r.lordship && r.lordship.days >= 1), 'every lordship took its turn');
  } finally { Date.now = real; }
});

test('kindness is remembered: repeated aid raises where feelings settle, and they do not cool while your soldiers serve', async () => {
  const { advanceDays, restingRelation, addFavour, shiftRelations } = await import('./war.ts');
  let w = initWorld(21); const r0 = w.rivals.find((r) => !r.bandits && r.personality === 'honorable') ?? w.rivals.find((r) => !r.bandits)!, id = r0.id;
  const rel = () => w.rivals.find((r) => r.id === id)!.relation, ctx = { stage: 2, myPower: 100, fort: 0, active: false };
  let day = 0; const pass = (n: number) => { for (let i = 0; i < n; i++) w = advanceDays(w, ctx, `2027-01-${String(++day + 1).padStart(2, '0')}`); };
  const settled: number[] = [];
  for (let k = 0; k < 3; k++) {
    w = { ...addFavour(shiftRelations(w, id, 12), id, 12 * 0.7 + 3), loans: [{ bat: 'b', rival: id, leftMin: 60 }] }; // troops arrive
    const high = rel(); pass(4); assert.ok(rel() >= high, 'while they serve, no cooling');
    w = { ...w, loans: [] }; pass(6); settled.push(rel());
  }
  assert.ok(settled[2] > settled[0] + 8, `each aid leaves them friendlier than before (${settled.join(' → ')})`);
  assert.ok(settled[2] > restingRelation({ ...r0, favour: 0 }, 2) + 15, 'well above their nature alone');
});

test('an older save: goodwill is credited for the aid the chronicle remembers', () => {
  const g = S.newGame(), k = g.world.rivals.find((r) => !r.bandits)!;
  const ev = (text: string) => ({ id: text + Math.random(), t: Date.now(), type: 'diplomacy', text });
  S._with({ ...g, events: [...g.events, ev(`Sent troops to aid ${k.name}.`), ev(`Sent troops to aid ${k.name}.`), ev(`Sent troops to aid ${k.name}.`), ev(`Sent a gift of 200 gold to ${k.name}.`)] });
  WA.worldTick();
  const r = S.getState().world.rivals.find((x) => x.id === k.id)!; assert.equal(r.favour !== undefined && r.favour >= 39, true, `three aids and a gift remembered (${r.favour})`);
  assert.ok(S.getState().world.rivals.filter((x) => !x.bandits && x.id !== k.id).every((x) => (x.favour ?? 0) <= 1));
});

test('the Kaelholm grant: three loans recorded → relations 60, lasting goodwill and an alliance offer, once', () => {
  const g = S.newGame(), k = g.world.rivals.find((r) => !r.bandits)!, ev = (text: string) => ({ id: Math.random().toString(), t: Date.now(), type: 'diplomacy', text });
  const world = { ...g.world, rivals: g.world.rivals.map((r) => (r.id === k.id ? { ...r, name: 'Kaelholm', relation: 24, status: 'neutral' as const } : r)) };
  const kh = () => S.getState().world.rivals.find((r) => r.id === k.id)!;
  // not yet loaded (or only two loans): it waits
  S._with({ ...g, world, events: [...g.events, ev('Sent troops to aid Kaelholm.'), ev('Sent troops to aid Kaelholm.')] }); WA.worldTick();
  assert.ok(kh().relation < 60 && !(S.getState().world.grants ?? []).includes('kaelholm-aid-60'));
  S._with({ ...S.getState(), events: [...S.getState().events, ev('Sent troops to aid Kaelholm.')] }); WA.worldTick();
  assert.ok(kh().relation >= 58, `trusted (${kh().relation})`); assert.ok((kh().favour ?? 0) >= 59);
  const offer = S.getState().world.inbox.find((m) => m.kind === 'alliance_offer' && m.rival === k.id)!; assert.ok(offer, 'an alliance offer arrives');
  // applied once: lowering it again is not undone by the grant
  S._with({ ...S.getState(), world: { ...S.getState().world, rivals: S.getState().world.rivals.map((r) => (r.id === k.id ? { ...r, relation: 10 } : r)) } }); WA.worldTick(); assert.equal(kh().relation, 10);
  WA.answerMissive(offer.id, true); assert.equal(kh().status, 'ally', 'accepting seals the alliance');
});
