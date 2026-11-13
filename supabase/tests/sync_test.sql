\set ON_ERROR_STOP 1
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- a 60 minute session, its reward, a habit completion, a building, a battalion and squad
\set payload '{"sessions":[{"id":"aaaaaaaa-0000-0000-0000-000000000001","subject":"Math","source":"timer","started_at":"2026-11-13T10:00:00Z","ended_at":"2026-11-13T11:00:00Z","verified_seconds":3600,"forfeited_seconds":0,"check_ins":2,"missed":0}],"habits":[{"id":"bbbbbbbb-0000-0000-0000-000000000001","name":"Run","freq":"daily","target":1,"unit":"","weight":1,"require_note":false,"best":1,"earned":{},"created_at":"2026-11-01T00:00:00Z","updated_at":"2026-11-13T00:00:00Z"}],"completions":[{"habit_id":"bbbbbbbb-0000-0000-0000-000000000001","period":"2026-11-13","count":1,"done":true,"at":"2026-11-13T08:00:00Z"}],"ledger":[{"kind":"start","ref":"start","gold":150,"wood":80,"stone":0,"renown":0,"at":"2026-11-13T09:00:00Z"},{"kind":"study","ref":"aaaaaaaa-0000-0000-0000-000000000001","gold":600,"wood":300,"stone":180,"renown":60,"at":"2026-11-13T11:00:00Z"},{"kind":"habit","ref":"bbbbbbbb-0000-0000-0000-000000000001:2026-11-13","gold":40,"wood":20,"stone":10,"renown":4,"at":"2026-11-13T08:00:00Z"},{"kind":"spend","ref":"s1","gold":-40,"wood":-30,"stone":0,"renown":0,"at":"2026-11-13T11:01:00Z"}],"buildings":[{"id":"cccccccc-0000-0000-0000-000000000001","kind":"hut","x":10,"y":10,"level":1,"built_at":"2026-11-13T11:01:00Z","updated_at":"2026-11-13T11:01:00Z"}],"battalions":[{"id":"dddddddd-0000-0000-0000-000000000001","name":"1st","army":"Royal Army","color":1,"emblem":"lion","formation":"block","x":1,"y":2,"commander":{"name":"Aldric","rank":0},"updated_at":"2026-11-13T11:01:00Z"}],"squads":[{"id":"eeeeeeee-0000-0000-0000-000000000001","battalion_id":"dddddddd-0000-0000-0000-000000000001","cls":"peasant","count":5,"xp":10,"rank":0,"updated_at":"2026-11-13T11:01:00Z"}],"techs":["agriculture"],"events":[{"id":"ffffffff-0000-0000-0000-000000000001","t":"2026-11-13T11:00:00Z","type":"study","text":"Studied"}],"kingdom":{"stage":2,"achievements":["first"],"subjects":["Math"],"settings":{},"active_session":null}}'
select (public.sync_kingdom(:'payload')->'balance') as first_sync;
-- resubmitting the identical payload must not pay twice
select (public.sync_kingdom(:'payload')->'balance') as resubmit;
select count(*) as ledger_rows from public.ledger;

-- cumulative study rows only grow; a smaller resubmission cannot shrink it
select (public.sync_kingdom('{"ledger":[{"kind":"study","ref":"aaaaaaaa-0000-0000-0000-000000000001","gold":100,"wood":0,"stone":0,"renown":0,"at":"2026-11-13T11:00:00Z"}]}')->'balance'->>'gold') as gold_after_smaller;

-- rejected cases (each in its own savepoint)
\set ON_ERROR_STOP 0
\echo expect error: reward exceeding verified time
select public.sync_kingdom('{"ledger":[{"kind":"study","ref":"aaaaaaaa-0000-0000-0000-000000000001","gold":99999,"wood":0,"stone":0,"renown":0,"at":"2026-11-13T11:00:00Z"}]}');
\echo expect error: reward with no session
select public.sync_kingdom('{"ledger":[{"kind":"study","ref":"aaaaaaaa-0000-0000-0000-00000000dead","gold":10,"wood":0,"stone":0,"renown":0,"at":"2026-11-13T11:00:00Z"}]}');
\echo expect error: session claiming more time than elapsed
select public.sync_kingdom('{"sessions":[{"id":"aaaaaaaa-0000-0000-0000-000000000002","subject":"X","source":"timer","started_at":"2026-11-13T10:00:00Z","ended_at":"2026-11-13T10:10:00Z","verified_seconds":7200,"forfeited_seconds":0,"check_ins":0,"missed":0}]}');
\echo expect error: habit reward with no completion
select public.sync_kingdom('{"ledger":[{"kind":"habit","ref":"bbbbbbbb-0000-0000-0000-000000000001:2026-11-14","gold":40,"wood":0,"stone":0,"renown":0,"at":"2026-11-13T11:00:00Z"}]}');
\echo expect error: second keep
select public.sync_kingdom('{"buildings":[{"id":"cccccccc-0000-0000-0000-000000000002","kind":"keep","x":1,"y":1,"level":1,"built_at":"2026-11-13T11:01:00Z","updated_at":"2026-11-13T11:01:00Z"},{"id":"cccccccc-0000-0000-0000-000000000003","kind":"keep","x":20,"y":1,"level":1,"built_at":"2026-11-13T11:01:00Z","updated_at":"2026-11-13T11:01:00Z"}]}');
\echo expect error: positive spend
select public.sync_kingdom('{"ledger":[{"kind":"spend","ref":"s9","gold":500,"wood":0,"stone":0,"renown":0,"at":"2026-11-13T11:00:00Z"}]}');
\set ON_ERROR_STOP 1
select (public.sync_kingdom('{}')->'balance') as balance_unchanged;

-- RLS: another user sees nothing and cannot touch user 1's rows
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as other_user_sees_ledger from public.ledger;
select jsonb_array_length(public.sync_kingdom('{}')->'buildings') as other_user_buildings;
\set ON_ERROR_STOP 0
\echo expect error: overwriting a building owned by another user
select public.sync_kingdom('{"buildings":[{"id":"cccccccc-0000-0000-0000-000000000001","kind":"hut","x":50,"y":50,"level":2,"built_at":"2026-11-13T11:01:00Z","updated_at":"2099-01-01T00:00:00Z"}]}');
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select x, level from public.buildings;
