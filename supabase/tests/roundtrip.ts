// Plays a short game with the real client logic, syncs it through sync_kingdom() on a local
// Postgres prepared by run.sh, and checks the merged snapshot matches local state.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/state.ts';
import { buildPayload, clearSent, adoptSnapshot, outboxEmpty } from '../../src/lib/syncCore.ts';

const psql = (sql: string) => execFileSync('psql', ['-qtA', '-d', process.env.DB ?? 'kod_test', '-c', sql], { encoding: 'utf8' }).trim();
const call = (payload: unknown) => JSON.parse(psql(`set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; select public.sync_kingdom($j$${JSON.stringify(payload)}$j$::jsonb)`).split('\n').pop()!);

psql('delete from public.ledger; delete from public.buildings; delete from public.squads; delete from public.battalions; delete from public.habit_completions; delete from public.habits; delete from public.study_sessions; delete from public.events; delete from public.techs; delete from public.kingdom;');
const MIN = 60000, real = Date.now, t0 = real() - 3 * 3600_000;
S._with(S.newGame());
Date.now = () => t0; S.studyStart('History');
Date.now = () => t0 + 29 * MIN; S.studyCheckIn();
Date.now = () => t0 + 45 * MIN; S.studyEnd();
Date.now = real;
S.build('hut', 30, 30); S.build('hut', 33, 30); S.recruit('peasant', 6);
S.splitBattalion(S.getState().battalions[0].id, { kind: 'half' }, 'patrol'); // a lone squad of 6 is halved into a new battalion
S.addHabit({ name: 'Read', freq: 'daily', target: 2, unit: 'chapters', weight: 2, requireNote: false });
S.habitProgress(S.getState().habits[0].id, 2);
S.grantCompensation(S.stableUuid('lan-loading-2026-11:11111111-1111-1111-1111-111111111111'), 60, 3, 'History', 'roundtrip'); // passes the server's reward ceiling
const local = S.getState();

const sent = buildPayload(local);
const snap = call(sent.payload);
assert.deepEqual(snap.balance, local.res, 'server balance equals local balance');
call(sent.payload); // duplicate submission
assert.deepEqual(call({}).balance, local.res, 'resubmission does not double rewards');

const cleared = clearSent(local, sent);
assert.ok(outboxEmpty(cleared));
const merged = adoptSnapshot(cleared, snap);
assert.equal(merged.buildings.length, local.buildings.length);
assert.equal(S.armySize(merged), 6);
assert.equal(merged.battalions.length, 2); assert.deepEqual(merged.squads.map((q) => q.count).sort(), [3, 3]); assert.equal(merged.battalions.find((b) => b.orders === 'patrol')?.name, '1st Royal Battalion (detachment)');
assert.deepEqual(merged.habits[0].done, local.habits[0].done);
const timed = merged.sessions.find((r) => r.verifiedSec === 45 * 60)!;
assert.equal(merged.sessions.length, 2);
assert.deepEqual(timed.reward, { gold: 567, wood: 283, stone: 170, renown: 56 });
// war: trade + casualties sync and cannot double count
import('../../src/lib/warActions.ts').then(async (WA) => {
  S._with({ ...merged, res: { ...merged.res } });
  const k = S.getState().world.rivals.find((r) => !r.bandits)!;
  assert.equal(WA.trade(k.id, 'gold', 100, 'wood'), null);
  const sq = S.getState().squads[0];
  S._with({ ...S.getState(), squads: S.getState().squads.map((q) => (q.id === sq.id ? { ...q, count: 2 } : q)), outbox: { ...S.getState().outbox, dirty: { ...S.getState().outbox.dirty, squads: [sq.id] } } });
  const sent2 = buildPayload(S.getState()), snap2 = call(sent2.payload);
  assert.deepEqual(snap2.balance, S.getState().res, 'trade synced into the balance');
  assert.equal(snap2.squads.find((q: { id: string }) => q.id === sq.id).count, 2, 'casualties persist');
  assert.equal(snap2.kingdom.world.rivals.length, 7, 'world map state persists');
  console.log('roundtrip ok', JSON.stringify(snap2.balance));
});
