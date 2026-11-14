// A database that never re-ran setup.sql after rewards became exponential (pre-0004 ceiling) rejects big
// study rewards. The client must keep syncing everything else, hold those rewards locally, and deliver
// them once the database is updated: nothing lost, nothing stuck.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/state.ts';
import { buildPayload, clearSent, outboxEmpty, heldBack } from '../../src/lib/syncCore.ts';

const DB = process.env.DB ?? 'kod_test', USER = '22222222-2222-2222-2222-222222222222';
const psql = (sql: string) => execFileSync('psql', ['-qtA', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const call = (payload: unknown) => JSON.parse(psql(`set role authenticated; set request.jwt.claim.sub='${USER}'; select public.sync_kingdom($j$${JSON.stringify(payload)}$j$::jsonb)`).split('\n').pop()!);
const fn = (file: string) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').match(/create or replace function public\.check_ledger\(\)[\s\S]*?end \$\$;/)![0];

psql(`insert into auth.users (id) values ('${USER}') on conflict do nothing`);
psql(fn('0002_war.sql')); // the old ceiling: 40 gold / 15 wood per verified minute
S._with(S.newGame());
S.grantCompensation(S.stableUuid(`lan-loading-2026-11:${USER}`), 60, 3, 'History', 'legacy test'); // 41 gold/min
S.recruit('peasant', 4);
const local = S.getState();
assert.throws(() => call(buildPayload(local).payload), /exceeds allowed rate/, 'old database rejects the whole payload');
const hold = heldBack(local); assert.equal(hold.size, 1, 'only the big study reward is held');
const sent = buildPayload(local, hold), snap = call(sent.payload);
let s = clearSent(local, sent);
assert.equal(s.outbox.ledger.length, 1, 'held reward stays in the outbox'); assert.ok(!outboxEmpty(s));
assert.equal(snap.squads.reduce((a: number, q: { count: number }) => a + q.count, 0), 4, 'everything else reached the cloud');
psql(fn('0004_focus.sql')); // the player runs setup.sql
const later = buildPayload(s), snap2 = call(later.payload); s = clearSent(s, later);
assert.ok(outboxEmpty(s)); assert.deepEqual(snap2.balance, local.res, 'held reward delivered in full after the update');
console.log('legacy ceiling ok', snap2.balance);
