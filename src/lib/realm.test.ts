import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './state.ts';
import * as WA from './warActions.ts';
import * as RA from './realmActions.ts';
import * as A from './assignments.ts';
import { traitsFor, rating, praiseReady, styled, HONORS } from './commanders.ts';
import { advanceDays, initWorld, dayStr, type WorldState } from './war.ts';
import { courtDay, courtFx, newCourt, adjust } from './politics.ts';
import { sitesFor, settleCap, foundCost, SETTLE } from './expansion.ts';
const SETTLE_COST = (k: keyof typeof SETTLE) => SETTLE[k].cost.gold;
import { thiefCanStrike } from './town.ts';

const rich = () => { const g = S.newGame(); return { ...g, stage: 3, res: { gold: 99999, wood: 9999, stone: 9999, renown: 9999 }, buildings: [...g.buildings, { id: 'f', kind: 'farm' as const, x: 10, y: 10, level: 3, at: 0 }, { id: 'b', kind: 'barracks' as const, x: 20, y: 10, level: 3, at: 0 }, ...[0, 1, 2, 3].map((i) => ({ id: 'h' + i, kind: 'house' as const, x: 30 + i * 3, y: 10, level: 2, at: 0 }))] }; };

test('commanders: two lasting traits, situational rating, honours for proven winners', () => {
  const t = traitsFor('abc'); assert.equal(t.length, 2); assert.notEqual(t[0], t[1]); assert.deepEqual(traitsFor('abc'), t, 'stable');
  const siege = { name: 'X', rank: 1, seed: 's', traits: ['siegemaster', 'cautious'] as const };
  assert.ok(rating({ ...siege, traits: [...siege.traits] }, 'assault', { cav: 0, ranged: 0 }) > rating({ ...siege, traits: [...siege.traits] }, 'field', { cav: 0, ranged: 0 }), 'better at storming walls');
  const c = { name: 'Aldric', rank: 2, seed: 'q', wins: 2, battles: 2 };
  assert.equal(praiseReady(c).ok, false);
  const won = { ...c, wins: 3, battles: 4 }; assert.equal(praiseReady(won).ok, true);
  assert.equal(praiseReady({ ...c, wins: 3, battles: 9 }).ok, false, 'must win most of their battles');
  assert.match(styled(won), /Aldric /, 'gains an epithet');
  S._with(rich()); S.recruit('spearman', 20);
  const bat = S.getState().battalions[0];
  assert.ok(bat.commander.traits?.length === 2, 'new commanders get traits');
  S._with({ ...S.getState(), battalions: [{ ...bat, commander: { ...bat.commander, wins: 3, battles: 3 } }] });
  const gold = S.getState().res.gold;
  assert.equal(WA.praiseCommander(bat.id), null);
  const after = S.getState();
  assert.equal(after.battalions[0].commander.honors, 1); assert.equal(after.res.gold, gold - (HONORS[0].cost.gold ?? 0));
  assert.ok(after.world.court!.approval.nobles > 55, 'the nobles approve');
  assert.match(WA.praiseCommander(bat.id) ?? '', /Needs 6/);
});

test('invasion warnings come first; some come to nothing; better relations stop them', () => {
  let w: WorldState = initWorld(5); const foe = w.rivals.find((r) => !r.bandits)!;
  w = { ...w, lastDay: '2026-03-01', rivals: w.rivals.map((r) => (r.id === foe.id ? { ...r, relation: -90, personality: 'aggressive' as const } : r)) };
  let warned = false, attacked = false, quiet = false;
  for (let d = 2; d < 28 && !(warned && (attacked || quiet)); d++) {
    const day = `2026-03-${String(d).padStart(2, '0')}`, before = w.threat;
    w = advanceDays(w, { stage: 4, myPower: 10, fort: 0, active: true }, day);
    if (w.warnings?.some((x) => x.rival === foe.id)) { warned = true; assert.ok(w.warnings.find((x) => x.rival === foe.id)!.chance > 0 && w.warnings.find((x) => x.rival === foe.id)!.text.length > 10); }
    if (!before && w.threat) { attacked = true; if (!w.inbox.some((m) => /Without warning/.test(m.text))) assert.ok(warned, 'warned before the attack'); w = { ...w, threat: null }; }
    if (w.inbox.some((m) => /False alarm|stood down/.test(m.text))) quiet = true;
  }
  assert.ok(warned, 'a hostile kingdom is reported massing');
  assert.ok(attacked || quiet, 'and the warning resolves one way or the other');
  // a warning against a kingdom you have since befriended rarely comes true
  const friendly = advanceDays({ ...w, threat: null, campaign: null, warnings: [{ id: 'x', rival: foe.id, issued: '2026-04-01', due: '2026-04-02', chance: 1, source: 'scouts', text: 't' }], rivals: w.rivals.map((r) => (r.id === foe.id ? { ...r, relation: 50, status: 'ally' as const } : r)), lastDay: '2026-04-01' }, { stage: 4, myPower: 999, fort: 1, active: true }, '2026-04-02');
  assert.equal(friendly.threat?.rival === foe.id, false);
});

test('assignments: rewards on time (bonus early, little late), penalties when missed', () => {
  S._with(rich()); S.recruit('spearman', 24);
  const now = Date.now(), H = 3600_000;
  assert.equal(A.addAssignment('Essay', 'History', now + 48 * H, 'medium'), null);
  assert.match(A.addAssignment('Past', 'History', now - H, 'small') ?? '', /future/);
  const id = S.getState().world.assignments![0].id, g0 = S.getState().res.gold;
  assert.equal(A.completeAssignment(id), null);
  const paid = S.getState().world.assignments![0].paid!;
  assert.equal(paid.gold, Math.round(320 * 1.5 * 1.25), 'stage 3 and a day early');
  assert.equal(S.getState().res.gold, g0 + paid.gold);
  assert.ok(S.getState().outbox.ledger.some((l) => l.ref === `assign:${id}` && l.kind === 'loot'));
  assert.match(A.completeAssignment(id) ?? '', /Already/);
  // missed: small costs gold, medium kills soldiers, major brings a siege
  S._with({ ...S.getState(), world: { ...S.getState().world, assignments: [
    { id: 'a1', title: 'Worksheet', subject: 'M', due: now - 1000, size: 'small', created: now - H },
    { id: 'a2', title: 'Lab', subject: 'S', due: now - 1000, size: 'medium', created: now - H },
    { id: 'a3', title: 'Exam', subject: 'S', due: now - 1000, size: 'large', created: now - H }] } });
  const gold = S.getState().res.gold, men = S.armySize(S.getState());
  A.assignmentsTick(now);
  const s = S.getState(), byId = (x: string) => s.world.assignments!.find((a) => a.id === x)!;
  assert.ok(s.res.gold < gold, 'gold lost'); assert.ok(S.armySize(s) < men, 'soldiers died');
  assert.ok(s.world.threat, 'an enemy besieges the castle');
  for (const x of ['a1', 'a2', 'a3']) assert.ok(byId(x).missed && byId(x).penalty, 'recorded with what happened');
  assert.ok(s.world.court!.approval.clergy < 55, 'the court is dismayed');
  A.assignmentsTick(now + 5000); assert.equal(S.getState().res.gold, s.res.gold, 'a penalty strikes once');
  const before = S.getState().res.gold; A.completeAssignment('a1');
  assert.equal(S.getState().res.gold - before, Math.round(120 * 1.5 * 0.3), 'handed in late: 30%');
});

test('court: moods drift, decrees change the economy, petitions can be granted or refused', () => {
  const c0 = newCourt(), rnd = () => 0.1;
  const { court: c1, news } = courtDay(c0, { today: '2026-05-01', seed: 1, neglect: 0, stage: 2 }, rnd);
  assert.equal(courtDay(c1, { today: '2026-05-01', seed: 1, neglect: 0, stage: 2 }, rnd).court, c1, 'once a day');
  assert.ok(c1.petitions.length === 1 && news.length >= 1, 'a petition arrives');
  const sad = courtDay(c0, { today: '2026-05-01', seed: 1, neglect: 3, stage: 2 }, rnd).court; assert.ok(sad.approval.clergy < c1.approval.clergy, 'neglected study dismays the clergy');
  assert.ok(courtFx({ ...c0, decrees: { ...c0.decrees, tax: 'high' } }).gold > 0); assert.equal(courtFx(adjust(c0, { commons: 30 })).crime, 0.5);
  S._with({ ...rich(), world: { ...rich().world, court: c1 } });
  const base = S.studyMult(S.getState()).gold;
  assert.equal(RA.setDecree('tax', 'high'), null); assert.ok(S.studyMult(S.getState()).gold > base, 'heavy taxes, more gold');
  assert.match(RA.setDecree('tax', 'low') ?? '', /tomorrow/);
  assert.ok(S.getState().world.court!.approval.commons < 55, 'the commons grumble');
  const p = S.getState().world.court!.petitions[0], f = p.faction, a0 = S.getState().world.court!.approval[f];
  assert.equal(RA.answerPetition(p.id, true), null);
  assert.ok(S.getState().world.court!.approval[f] > a0); assert.equal(S.getState().world.court!.petitions.length, 0);
  const cost = S.recruitCost(S.getState(), 'spearman').gold!; RA.setDecree('levy', 'conscription'); assert.ok(S.recruitCost(S.getState(), 'spearman').gold! < cost, 'conscripts are cheaper');
});

test('expansion: settlements are capped by stage, cost more each time and add to study and army', () => {
  const g = rich(); S._with({ ...g, stage: 2 });
  const sites = sitesFor(g.world.seed); assert.equal(sites.length, 8);
  for (const st of sites) assert.ok(Math.hypot(st.x - 0.5, st.y - 0.5) < 0.25, 'close to home');
  const cap0 = S.armyCap(S.getState()), wood0 = S.studyMult(S.getState()).wood;
  const vill = sites.find((x) => x.kind === 'village')!, lumber = sites.find((x) => x.kind === 'lumber')!, mine = sites.find((x) => x.kind === 'mine')!;
  assert.equal(RA.foundSettlement(vill.id), null); assert.equal(RA.foundSettlement(lumber.id), null);
  assert.equal(S.getState().world.settlements!.length, settleCap(2));
  assert.match(RA.foundSettlement(mine.id) ?? '', /can hold 2/);
  assert.ok(S.armyCap(S.getState()) > cap0, 'villages feed more soldiers'); assert.ok(S.studyMult(S.getState()).wood > wood0, 'lumber camps add wood');
  assert.match(RA.upgradeSettlement(vill.id) ?? '', /stage 3/);
  S._with({ ...S.getState(), stage: 3 }); assert.equal(RA.upgradeSettlement(vill.id), null);
  assert.equal(S.getState().world.settlements!.find((x) => x.site === vill.id)!.level, 2);
});

test('parade: costs gold, pays renown and favour, once a day, deters invaders and thieves', () => {
  S._with(rich()); S.recruit('spearman', 30);
  const s0 = S.getState(), w = s0.world, foe = w.rivals[1];
  S._with({ ...s0, world: { ...w, warnings: [{ id: 'w', rival: foe.id, issued: dayStr(), due: dayStr(), chance: 0.8, source: 'scouts', text: 't' }] } });
  const cost = RA.paradeCost(S.getState()).gold!, r = RA.paradeReward(S.getState()), g = S.getState().res.gold, rn = S.getState().res.renown;
  assert.equal(RA.holdParade(), null);
  const s = S.getState();
  assert.equal(s.res.gold, g - cost); assert.equal(s.res.renown, rn + r.renown);
  assert.ok(s.world.warnings![0].chance < 0.8, 'enemies think twice');
  assert.ok(s.world.court!.approval.commons > 55);
  assert.equal(thiefCanStrike(s), false, 'no thieves on parade day');
  assert.match(RA.holdParade() ?? '', /One parade a day/);
});

test('subjects: add your own, remove them, and the one you study becomes the default', () => {
  S._with(S.newGame());
  assert.equal(S.currentSubject(S.getState()), 'Mathematics');
  S.addSubject('  Organic   Chemistry '); assert.ok(S.getState().subjects.includes('Organic Chemistry'));
  S.addSubject('organic chemistry'); assert.equal(S.getState().subjects.filter((x) => /organic/i.test(x)).length, 1, 'no duplicates');
  S.studyStart('Organic Chemistry'); assert.equal(S.currentSubject(S.getState()), 'Organic Chemistry', 'studying sets the subject');
  S.studyDiscard(); assert.equal(S.currentSubject(S.getState()), 'Mathematics', 'an empty session leaves no mark');
  S.removeSubject('History'); assert.ok(!S.getState().subjects.includes('History'));
});

test('a removed subject stays removed when the cloud copy (which keeps every subject) is merged back', async () => {
  const { adoptSnapshot, buildPayload } = await import('./syncCore.ts');
  S._with(S.newGame()); S.removeSubject('History');
  const local = S.getState(), payload = buildPayload(local).payload as { kingdom: { settings: unknown } };
  // the server returns the union of old and new subjects, and the settings we just sent
  const snap = { balance: local.res, lifetime: local.lifetime, sessions: [], session_rewards: {}, habits: [], completions: [], buildings: [], battalions: [], squads: [], techs: [], events: [],
    kingdom: { stage: 1, achievements: [], subjects: ['Mathematics', 'Languages', 'Science', 'History', 'Programming', 'Reading'], settings: payload.kingdom.settings, world: local.world } };
  const merged = adoptSnapshot(local, snap as never);
  assert.ok(!merged.subjects.includes('History'), 'stays removed');
  assert.ok(merged.subjects.includes('Science'));
  S._with(merged); S.addSubject('history');
  assert.ok(S.getState().subjects.some((x) => /history/i.test(x)), 'adding it again brings it back');
  assert.ok(adoptSnapshot(S.getState(), { ...snap, kingdom: { ...snap.kingdom, settings: S.getState().settings } } as never).subjects.some((x) => /history/i.test(x)), 'and it survives the next sync');
});

test('quarters: beds in barracks take off-duty soldiers out of formation; they drill and learn faster', () => {
  const g = S.newGame(); S._with({ ...g, stage: 3 }); S.newBattalion('Foot'); S.newBattalion('Bows');
  const [a, b] = S.getState().battalions.map((x) => x.id);
  S._with({ ...S.getState(), squads: [{ id: 'q1', cls: 'spearman', count: 12, xp: 0, rank: 0, bat: a }, { id: 'q2', cls: 'spearman', count: 12, xp: 0, rank: 0, bat: a }, { id: 'q3', cls: 'spearman', count: 12, xp: 0, rank: 0, bat: a }, { id: 'q4', cls: 'archer', count: 10, xp: 0, rank: 0, bat: b }] });
  const camp = S.quartersCap(S.getState()); assert.ok(camp > 0 && camp < 30, 'the old camp has a few tents');
  S.setOrders(a, 'patrol'); // 24 on patrol, 12 spare
  let p = S.quarterPlan(S.getState()); assert.equal(p.per.get(a), 12, 'the patrol\'s spare men go to quarters');
  S.setOrders(b, 'quarters'); p = S.quarterPlan(S.getState());
  assert.equal(p.per.get(b), 10, 'a battalion sent to quarters gets beds first'); assert.equal(p.used, camp); assert.ok(p.wanting > 0, 'not enough beds');
  // a barracks makes room for everyone
  S._with({ ...S.getState(), buildings: [...S.getState().buildings, { id: 'bk', kind: 'barracks', x: 60, y: 60, level: 1, at: 0 }] });
  p = S.quarterPlan(S.getState()); assert.equal(p.wanting, 0); assert.equal(p.per.get(a), 12);
  assert.ok(S.inQuarters(S.getState(), b) && S.getState().battalions.find((x) => x.id === b)!.orders === 'formation', 'stored without a new database value');
  // back to formation: out of quarters
  S.setOrders(b, 'formation'); assert.equal(S.quarterPlan(S.getState()).per.get(b), undefined);
  // drilling in quarters: faster experience while studying
  const xp = (id: string) => S.getState().squads.find((q) => q.id === id)!.xp, zero = () => S._with({ ...S.getState(), squads: S.getState().squads.map((q) => ({ ...q, xp: 0 })) });
  zero(); S.grantCompensation(S.stableUuid('quarters-test-a'), 30, 1, 'History', 'test'); const standing = xp('q4'); // the same archers, in formation
  S.setOrders(b, 'quarters'); zero(); S.grantCompensation(S.stableUuid('quarters-test-b'), 30, 1, 'History', 'test');
  assert.ok(xp('q4') > standing * 1.2, `quartered archers drilled (${xp('q4').toFixed(1)} vs ${standing.toFixed(1)} in formation)`);
});

test('battalions on patrol, on guard or in quarters stay at their posts; only those in formation march', () => {
  S._with({ ...S.newGame(), stage: 3 }); S.newBattalion('A'); S.newBattalion('B');
  const [a, b] = S.getState().battalions.map((x) => x.id), pos = (id: string) => S.getState().battalions.find((x) => x.id === id)!;
  const a0 = { ...pos(a) };
  S.setOrders(a, 'patrol'); assert.match(S.marchTo(a, 900, 900)!, /on patrol/); assert.equal(pos(a).x, a0.x, 'did not move');
  S.setOrders(a, 'quarters'); assert.match(S.marchTo(a, 900, 900)!, /quarters/);
  S.setOrders(a, 'formation'); assert.equal(S.marchTo(a, 900, 900), null); assert.notEqual(pos(a).x, a0.x, 'marches once back in formation');
  S.setOrders(b, 'garrison'); const b0 = { ...pos(b) }; S.marchArmy(pos(b).army, 300, 300);
  assert.deepEqual([pos(b).x, pos(b).y], [b0.x, b0.y], 'the army marches without the guard');
});

test('lands along the roads: more to settle, charted as your maps grow, dearer farther out; vassals let you hold more', () => {
  const g = S.newGame(), w = g.world, all = sitesFor(w.seed, w.rivals), road = all.filter((x) => x.road);
  assert.ok(road.length >= 10, `lands along the roads (${road.length})`);
  assert.deepEqual(sitesFor(w.seed, w.rivals).map((x) => x.id), all.map((x) => x.id), 'fixed for the world');
  for (const x of road) for (const r of w.rivals) assert.ok(Math.hypot(x.x - r.x, x.y - r.y) > 0.03, `${x.name} is not inside ${r.name}`);
  S._with({ ...g, stage: 1 }); const few = RA.knownSites(S.getState()).filter((x) => x.road).length;
  S._with({ ...g, stage: 5, world: { ...w, rivals: w.rivals.map((r) => ({ ...r, known: true })) } }); const many = RA.knownSites(S.getState()).filter((x) => x.road).length;
  assert.ok(many > few, `bigger maps chart more lands (${few} → ${many})`);
  const near = [...road].sort((a, b) => Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5)), a = near[0], z = near[near.length - 1];
  assert.ok(foundCost(z.kind, 0, z).gold / SETTLE_COST(z.kind) > foundCost(a.kind, 0, a).gold / SETTLE_COST(a.kind), 'far lands cost more');
  const base = RA.landCap(S.getState()); S._with({ ...S.getState(), world: { ...S.getState().world, rivals: S.getState().world.rivals.map((r, i) => (i === 1 ? { ...r, status: 'vassal' as const } : r)) } });
  assert.equal(RA.landCap(S.getState()), base + 1, 'a vassal guards one more land');
  // settling a roadside land adds to what study earns
  S._with({ ...S.getState(), res: { gold: 1e6, wood: 1e6, stone: 1e6, renown: 1e6 } }); const before = S.studyMult(S.getState());
  const target = RA.knownSites(S.getState()).find((x) => x.road && x.kind === 'market')!; assert.equal(RA.foundSettlement(target.id), null);
  assert.ok(S.studyMult(S.getState()).gold > before.gold);
});

test('productive time: its own timer, a lesser reward, counted apart from study', async () => {
  const { workReward, studyReward, DEFAULT_RATES } = await import('./rewards.ts');
  const hour = workReward(3600000), study = studyReward(3600000);
  assert.equal(hour.gold, Math.floor(60 * DEFAULT_RATES.gold * 0.4), 'a flat 40% of the base rate'); assert.ok(hour.gold < study.gold * 0.4, 'and no focus bonus');
  const real = Date.now; let t = real();
  try {
    Date.now = () => t; S._with({ ...S.newGame(), events: [{ id: 'e', t: t - 10 * 864e5, type: 'stage', text: '' }] });
    const idle = S.idleDays(S.getState());
    assert.equal(S.workStart('Chores'), null); assert.match(S.studyStart('History')!, /productive/, 'one timer at a time');
    t += 29 * 60000; S.workCheckIn(); t += 29 * 60000; S.workCheckIn(); t += 2 * 60000; S.workEnd();
    const st = S.getState(), rec = st.sessions[0];
    assert.equal(st.work, null); assert.ok(S.isWork(rec) && S.taskOf(rec.subject) === 'Chores' && rec.source === 'timer');
    assert.equal(rec.reward.gold, workReward(60 * 60000, st.settings.rates, S.studyMult(st)).gold, 'paid at the productive rate');
    assert.ok(rec.reward.gold > 0 && st.outbox.ledger.some((l) => l.kind === 'study' && l.ref === rec.id), 'banked like a study session (the cloud accepts it)');
    assert.equal(S.idleDays(st), idle, 'it does not count as study for the realm\'s calm');
    assert.ok(!st.achievements.includes('first') && !st.achievements.includes('hour'), 'nor for study honours');
    assert.ok(!st.subjects.some((x) => x.includes('Chores')), 'activities are not study subjects');
    assert.equal(S.studyStart('History'), null, 'study can start once it is done');
  } finally { Date.now = real; }
});

test('productive time has no check-in prompt: a click every 30 minutes keeps it going, and without one it ends', () => {
  const real = Date.now; let t = real();
  try {
    Date.now = () => t; S._with(S.newGame());
    S.workStart('Exercise'); t += 10 * 60000; S.workCheckIn(); // an early click banks the time and restarts the window
    t += 25 * 60000; S.studyTick(); assert.equal(S.getState().work?.status, 'running', 'still within 30 minutes of the click');
    t += 6 * 60000; S.studyTick(); // 31 minutes since the last click
    const st = S.getState(), rec = st.sessions[0];
    assert.equal(st.work, null, 'the timer ended on its own'); assert.equal(rec.verifiedSec, 10 * 60, 'keeping the time up to the last click');
    assert.ok(rec.endedAt! <= t && rec.reward.gold > 0);
    // closed the app and came back too late: the click does not revive it
    S.workStart('Chores'); t += 15 * 60000; S.workCheckIn(); t += 3 * 3600_000; S.workCheckIn();
    const r2 = S.getState().sessions[0]; assert.equal(S.getState().work, null); assert.equal(r2.verifiedSec, 15 * 60);
  } finally { Date.now = real; }
});
