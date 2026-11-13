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
S.addHabit({ name: 'Read', freq: 'daily', target: 2, unit: 'chapters', weight: 2, requireNote: false });
S.habitProgress(S.getState().habits[0].id, 2);
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
assert.deepEqual(merged.habits[0].done, local.habits[0].done);
assert.equal(merged.sessions[0].verifiedSec, 45 * 60);
assert.deepEqual(merged.sessions[0].reward, { gold: 450, wood: 225, stone: 135, renown: 45 });
console.log('roundtrip ok', JSON.stringify(snap.balance));
