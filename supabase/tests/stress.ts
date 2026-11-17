// Plays a long, eventful game (war, raids, conquest, parades, splits, sackings) and syncs it after each step,
// so any row the database would reject is caught here instead of silently stalling a player's cloud save.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import * as S from '../../src/lib/state.ts';
import * as WA from '../../src/lib/warActions.ts';
import * as RA from '../../src/lib/realmActions.ts';
import { buildPayload, clearSent, adoptSnapshot, outboxEmpty } from '../../src/lib/syncCore.ts';

const USER = '33333333-3333-3333-3333-333333333333', Q = '$' + 'j' + '$';
const psql = (sql: string) => execFileSync('psql', ['-qtA', '-v', 'ON_ERROR_STOP=1', '-d', process.env.DB ?? 'kod_test', '-c', sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const call = (payload: unknown) => JSON.parse(psql(`set role authenticated; set request.jwt.claim.sub='${USER}'; select public.sync_kingdom(${Q}${JSON.stringify(payload).split(Q).join('')}${Q}::jsonb)`).split('\n').pop()!);
psql(`insert into auth.users (id) values ('${USER}') on conflict do nothing`);
psql(`delete from public.ledger where user_id = '${USER}'; delete from public.squads where user_id = '${USER}'; delete from public.battalions where user_id = '${USER}'; delete from public.buildings where user_id = '${USER}'; delete from public.study_sessions where user_id = '${USER}'; delete from public.events where user_id = '${USER}'; delete from public.kingdom where user_id = '${USER}'`);

const sync = (step: string) => {
  const sent = buildPayload(S.getState());
  let snap;
  try { snap = call(sent.payload); } catch (e) { throw new Error(`sync rejected after "${step}": ${String((e as { stderr?: string }).stderr ?? e).split('\n').find((l) => /ERROR/.test(l)) ?? e}`); }
  const s = clearSent(S.getState(), sent);
  assert.ok(outboxEmpty(s), step);
  assert.deepEqual(snap.balance, s.res, `balance matches after "${step}"`);
  S._with(adoptSnapshot(s, snap));
};
S._with({ ...S.newGame(), owner: USER });
for (let i = 0; i < 6; i++) S.grantCompensation(S.stableUuid(`stress:${i}:${USER}`), 240, 3, 'History', 'stress'); // honest study income
sync('study');
{ // an hour of productive time (not study), timed in the past
  const real = Date.now; let t = real() - 2 * 3600_000; Date.now = () => t;
  const e = S.workStart('Exercise'); if (e) throw new Error(e); t += 29 * 60000; S.workCheckIn(); t += 29 * 60000; S.workCheckIn(); t += 2 * 60000; S.workEnd(); Date.now = real;
  assert.ok(S.getState().sessions.some((r) => S.isWork(r) && r.reward.gold > 0));
}
sync('productive time');
S._with({ ...S.getState(), stage: 4, techs: ['agriculture', 'masonry', 'archery', 'militia', 'engineering', 'cavalry'] as never });
for (const [kind, x, y] of [...Array.from({ length: 8 }, (_, i) => ['house', 20 + i * 3, 40] as const), ['trainfield', 20, 46] as const, ['range', 27, 46] as const]) { const e = S.build(kind, x, y); if (e) console.log('build', kind, e); }
for (const k of ['peasant', 'peasant', 'spearman', 'archer'] as const) { const e = S.recruit(k, 12); if (e) console.log('recruit', k, e); }
console.log(JSON.stringify(S.getState().res), S.getState().buildings.length, S.getState().squads.length, S.getState().stage);
sync('recruit');
{ const e = S.build('tavern', 44, 50); if (e) throw new Error('tavern: ' + e); }
assert.equal((buildPayload(S.getState(), new Set(), new Set(['tavern'])).payload.buildings as { kind: string }[]).some((b: { kind: string }) => b.kind === 'tavern'), false, 'an old database is not sent a tavern');
sync('tavern'); assert.ok(S.getState().buildings.some((b) => b.kind === 'tavern'), 'the tavern is saved to the cloud');
S.splitBattalion(S.getState().battalions[0].id, { kind: 'half' }, 'patrol'); sync('split');
for (const op of S.getState().world.outposts ?? []) WA.raidOutpost(op.id, S.getState().battalions[0].id);
sync('raid');
const k = S.getState().world.rivals.find((r) => !r.bandits && r.known !== false)!;
WA.trade(k.id, 'gold', 100, 'wood'); sync('trade');
RA.holdParade(); sync('parade');
S._with({ ...S.getState(), world: { ...S.getState().world, threat: { rival: k.id, power: 99999, since: 0, allyHelp: [] } } }); WA.breachTick(); sync('sacked');
S._with({ ...S.getState(), world: { ...S.getState().world, threat: { rival: k.id, power: 10, since: Date.now(), allyHelp: [] } } }); WA.defend('assault'); sync('defend');
const r = { ...k, power: 9000, level: 5, status: 'war' as const };
S._with({ ...S.getState(), world: { ...S.getState().world, rivals: S.getState().world.rivals.map((x) => (x.id === r.id ? r : x)), campaign: { target: r.id, battalions: [], engines: { ram: 0, tower: 0, mangonel: 0, ballista: 0, trebuchet: 0 }, supplies: 0, phase: 'siege', day: 9, progressMin: 0, wallHp: 0, wallMax: 100, garrison: 0, garrisonMorale: 0, morale: 80, started: 0, log: [] } as never } });
for (let i = 0; i < 60 && S.getState().world.campaign; i++) WA.demandSurrender();
sync('conquest');
console.log('stress ok', JSON.stringify(S.getState().res));
