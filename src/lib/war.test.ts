import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, tacticLock, type Unit } from './battle.ts';
import { initWorld, advanceDays, siegeProgress, newCampaign, tradeQuote, SIEGE_DAY_MIN, type WorldState, type Campaign } from './war.ts';
import * as S from './state.ts';
import * as WA from './warActions.ts';
import { add } from './rewards.ts';

const inf: Unit[] = [{ cls: 'swordsman', count: 60, rank: 1 }, { cls: 'archer', count: 30, rank: 1 }];
const cav: Unit[] = [{ cls: 'lightcav', count: 30, rank: 1 }, { cls: 'pikeman', count: 20, rank: 1 }];
const wins = (fn: (seed: number) => 'a' | 'b') => Array.from({ length: 40 }, (_, i) => fn(i + 1)).filter((w) => w === 'a').length;

test('stronger armies usually win; tactics counter each other', () => {
  const big: Unit[] = [{ cls: 'swordsman', count: 120, rank: 2 }], small: Unit[] = [{ cls: 'militia', count: 60, rank: 0 }];
  assert.ok(wins((sd) => simulate({ name: 'A', units: big, commander: 1, tactic: 'assault' }, { name: 'B', units: small, commander: 0, tactic: 'assault' }, 'plains', sd).winner) > 35);
  const even = (ta: 'flank' | 'assault', tb: 'volley' | 'shieldwall') => wins((sd) => simulate({ name: 'A', units: cav, commander: 1, tactic: ta }, { name: 'B', units: inf, commander: 1, tactic: tb }, 'plains', sd).winner);
  assert.ok(even('flank', 'volley') > even('flank', 'shieldwall'), 'flanking beats volley more often than a shield wall');
});
test('walls protect defenders; tactic requirements enforced', () => {
  const att: Unit[] = [{ cls: 'swordsman', count: 100, rank: 1 }], def: Unit[] = [{ cls: 'spearman', count: 170, rank: 1 }];
  const open = wins((sd) => simulate({ name: 'A', units: att, commander: 0, tactic: 'assault' }, { name: 'B', units: def, commander: 0, tactic: 'shieldwall', fort: 0 }, 'plains', sd, true).winner);
  const walled = wins((sd) => simulate({ name: 'A', units: att, commander: 0, tactic: 'assault' }, { name: 'B', units: def, commander: 0, tactic: 'shieldwall', fort: 0.8 }, 'plains', sd, true).winner);
  assert.ok(walled < open);
  assert.match(tacticLock(inf, 'flank', 'plains') ?? '', /cavalry/);
  assert.match(tacticLock(inf, 'ambush', 'plains') ?? '', /forest/);
});
test('sieges advance only with study minutes and consume supplies', () => {
  const w = initWorld(42), r = w.rivals[1];
  let c: Campaign = { ...newCampaign(r, ['b'], { ram: 0, tower: 0, mangonel: 2, ballista: 0, trebuchet: 1 }, 10, []), phase: 'siege' };
  let p = siegeProgress(c, SIEGE_DAY_MIN * 2, 50, false); c = p.c;
  assert.equal(c.day, 2); assert.equal(c.supplies, 0); assert.equal(c.wallHp, r.wallMax - 2 * (24 + 35));
  p = siegeProgress(c, SIEGE_DAY_MIN, 50, false); assert.ok(p.desert > 0); assert.ok(p.c.morale < c.morale);
  assert.equal(siegeProgress(c, 0, 50, false).c.day, 2);
});
test('enemy sieges only come when strong (stage 4) or deeply hated; absences capped', () => {
  let w: WorldState = initWorld(7);
  w = { ...w, lastDay: '2026-01-01', rivals: w.rivals.map((r) => ({ ...r, relation: r.bandits ? r.relation : 0, status: r.bandits ? 'war' : 'neutral' })) };
  for (let i = 0; i < 30; i++) { const day = `2026-01-${String(i + 2).padStart(2, '0')}`; w = advanceDays({ ...w, threat: null }, { stage: 2, myPower: 10, fort: 0, active: true }, day); assert.equal(w.threat, null, 'no siege on a young realm without hatred'); }
  const hated: WorldState = { ...w, lastDay: '2026-02-01', rivals: w.rivals.map((r, i) => (i === 1 ? { ...r, relation: -90 } : r)) };
  let got = false; for (let i = 2; i < 28 && !got; i++) got = !!advanceDays({ ...hated, threat: null }, { stage: 1, myPower: 10, fort: 0, active: true }, `2026-02-${String(i).padStart(2, '0')}`).threat;
  assert.ok(got, 'a hated realm eventually attacks');
  const p0 = w.rivals[2].power, far = advanceDays(w, { stage: 2, myPower: 10, fort: 0, active: false }, '2027-06-01');
  assert.ok(far.rivals[2].power < p0 * 1.06, 'long absence only counts up to 3 days');
});
test('trade improves relations; actions go through the ledger', () => {
  const s0 = S.newGame(); S._with({ ...s0, res: { gold: 5000, wood: 2000, stone: 500, renown: 100 } });
  const k = S.getState().world.rivals.find((r) => !r.bandits)!, before = k.relation;
  assert.ok(tradeQuote(k, 'gold', 300, 'stone').got > 0);
  assert.equal(WA.trade(k.id, 'gold', 300, 'stone'), null);
  const s = S.getState(); assert.ok(s.world.rivals.find((r) => r.id === k.id)!.relation > before);
  const sum = s.outbox.ledger.filter((l) => l.kind !== 'start').reduce((a, l) => add(a, l.amt), { gold: 0, wood: 0, stone: 0, renown: 0 });
  assert.deepEqual(add(sum, { gold: 5000, wood: 2000, stone: 500, renown: 100 }), s.res);
  assert.match(WA.proposeAlliance(k.id) ?? '', /trust/);
  assert.match(WA.startCampaign(k.id, [], { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 }, 0) ?? '', /war/);
});
test('a campaign against the bandits: field battle, siege days from study, assault', () => {
  const s0 = S.newGame(); S._with({ ...s0, res: { gold: 99999, wood: 9999, stone: 9999, renown: 999 }, buildings: [...s0.buildings, { id: 'f', kind: 'farm', x: 10, y: 10, level: 3, at: 0 }, { id: 'b', kind: 'barracks', x: 20, y: 10, level: 2, at: 0 }] });
  S.recruit('peasant', 10); S.recruit('swordsman', 0); S.recruit('militia', 30);
  const bat = S.getState().battalions[0].id;
  assert.equal(WA.startCampaign('bandits', [bat], { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 }, 40), null);
  assert.ok(WA.awayBats(S.getState()).has(bat));
  WA.fieldBattle('assault');
  const c = S.getState().world.campaign;
  if (c) { // won the field: study advances the siege
    assert.equal(c.phase, 'siege');
    const real = Date.now, t0 = real();
    try { Date.now = () => t0; S.studyStart('Math'); Date.now = () => t0 + 25 * 60000; S.studyCheckIn(); Date.now = () => t0 + 41 * 60000; S.studyEnd(); } finally { Date.now = real; }
    assert.ok(S.getState().world.campaign!.day >= 2, 'study minutes became siege days');
  }
  assert.ok(S.getState().world.reports.length >= 1);
});

test('town watch: guards on duty, thieves capped, bounties', async () => {
  const T = await import('./town.ts');
  const s0 = S.newGame();
  const homes = [0, 1, 2, 3].map((i) => ({ id: 'h' + i, kind: 'house' as const, x: 10 + i * 3, y: 10, level: 2, at: 0 }));
  S._with({ ...s0, res: { gold: 1000, wood: 0, stone: 0, renown: 0 }, buildings: [...s0.buildings, ...homes] });
  assert.ok(T.thiefCanStrike(), 'unguarded town with homes attracts thieves');
  T.theft(); assert.equal(S.getState().res.gold, 980, 'theft takes 2%');
  T.theft(); T.theft(); T.theft();
  assert.equal(S.getState().world.town!.thefts, 3, 'at most three thefts a day');
  assert.equal(T.thiefCanStrike(), false);
  S._with({ ...S.getState(), res: { gold: 10000, wood: 0, stone: 0, renown: 0 } }); S.recruit('peasant', 0);
  const b = { id: 'b', name: 'Watch', army: 'A', color: 0, emblem: 'lion', formation: 'block' as const, orders: 'patrol' as const, x: 0, y: 0, commander: { name: 'X', rank: 0, seed: 'b' } };
  S._with({ ...S.getState(), battalions: [b], squads: [{ id: 'q', cls: 'spearman', count: 12, xp: 0, rank: 0, bat: 'b' }] });
  const o = S.townOrder(S.getState());
  assert.equal(o.guards, 12); assert.ok(o.ratio >= 1);
  assert.ok(S.studyMult(S.getState()).gold > 1, 'safe streets bonus');
  const g = S.getState().res.gold; T.caught(); assert.equal(S.getState().res.gold, g + 20);
});

test('neglect: two grace days, then crime and hostile letters; study clears it', async () => {
  const T = await import('./town.ts');
  const D = 864e5, now = Date.now(), s0 = S.newGame();
  const homes = [0, 1, 2, 3].map((i) => ({ id: 'h' + i, kind: 'house' as const, x: 10 + i * 3, y: 10, level: 2, at: 0 }));
  const bat = { id: 'b', name: 'Watch', army: 'A', color: 0, emblem: 'lion', formation: 'block' as const, orders: 'patrol' as const, x: 0, y: 0, commander: { name: 'X', rank: 0, seed: 'b' } };
  const sess = (daysAgo: number) => ({ id: 's' + daysAgo, subject: 'M', source: 'timer' as const, startedAt: now - daysAgo * D - 3600e3, endedAt: now - daysAgo * D, verifiedSec: 3600, forfeitedSec: 0, checkIns: 1, missed: 0, notes: '', reward: { gold: 0, wood: 0, stone: 0, renown: 0 } });
  const base = { ...s0, events: [{ id: 'e', t: now - 30 * D, type: 'stage', text: '' }], buildings: [...s0.buildings, ...homes], battalions: [bat], squads: [{ id: 'q', cls: 'spearman' as const, count: 5, xp: 0, rank: 0, bat: 'b' }] };
  for (const [ago, n] of [[0, 0], [1, 0], [2, 0], [3, 1], [6, 4]] as const) assert.equal(S.neglect({ ...base, sessions: [sess(ago)] }), n, `${ago} idle days`);
  const ratio = S.townOrder(base).ratio; assert.ok(ratio >= 0.5 && ratio < 1, 'moderately guarded town');
  assert.equal(T.thiefCanStrike({ ...base, sessions: [sess(1)] }), false, 'no crime during grace');
  assert.equal(T.thiefCanStrike({ ...base, sessions: [sess(4)] }), true, 'neglect breeds crime');
  assert.ok(T.thiefChance({ ...base, sessions: [sess(5)] }) > T.thiefChance({ ...base, sessions: [sess(0)] }));
  let w = { ...base.world, lastDay: '2026-03-01' };
  const before = Object.fromEntries(w.rivals.map((r) => [r.id, r.relation]));
  w = advanceDays(w, { stage: 2, myPower: 50, fort: 0, active: true, neglect: 3 }, '2026-03-02');
  assert.ok(w.inbox.some((m) => m.id.endsWith('-neglect') && /Study/.test(m.text)), 'a rival sends a threat');
  assert.ok(w.rivals.some((r) => (r.personality === 'aggressive' || r.personality === 'treacherous') && !r.bandits && r.relation < before[r.id] - 5), 'warlike rivals grow hostile');
});

test('town events: small rewards, at most six a day', async () => {
  const T = await import('./town.ts');
  S._with({ ...S.newGame(), res: { gold: 0, wood: 0, stone: 0, renown: 0 } });
  for (let i = 0; i < 9; i++) T.townEvent('A pig escaped', { gold: 10 });
  assert.equal(S.getState().res.gold, 60, 'six rewarded events');
  assert.equal(S.getState().world.town!.events, 9, 'all events still logged');
  T.townEvent('Tipsy villager'); assert.equal(S.getState().res.gold, 60);
});
