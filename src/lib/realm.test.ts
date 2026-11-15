import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './state.ts';
import * as WA from './warActions.ts';
import * as RA from './realmActions.ts';
import * as A from './assignments.ts';
import { traitsFor, rating, praiseReady, styled, HONORS } from './commanders.ts';
import { advanceDays, initWorld, dayStr, type WorldState } from './war.ts';
import { courtDay, courtFx, newCourt, adjust } from './politics.ts';
import { sitesFor, settleCap } from './expansion.ts';
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
