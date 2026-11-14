-- War update: rival kingdoms, trade and loot rewards, casualties.
alter table public.kingdom add column if not exists world jsonb;
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check check (kind in ('start', 'study', 'manual', 'habit', 'milestone', 'achievement', 'spend', 'refund', 'trade', 'loot'));

create or replace function public.check_ledger() returns trigger language plpgsql as $$
declare v int; src text; m numeric;
begin
  if new.kind in ('study', 'manual') then
    select verified_seconds, source into v, src from public.study_sessions where id::text = new.ref and user_id = new.user_id;
    if v is null then raise exception 'study reward without session %', new.ref; end if;
    if (new.kind = 'manual') <> (src = 'manual') then raise exception 'reward kind does not match session source'; end if;
    m := v / 60.0 * (case when src = 'manual' then 0.5 else 1 end);
    -- generous ceiling: 2x configurable base rate (10/5/3/1 per minute) times building and vassal bonuses
    if new.gold > m * 40 + 1 or new.wood > m * 15 + 1 or new.stone > m * 9 + 1 or new.renown > m * 4 + 1 then
      raise exception 'study reward exceeds allowed rate';
    end if;
  elsif new.kind in ('habit', 'milestone') then
    if not exists (select 1 from public.habit_completions c where c.user_id = new.user_id and c.done
                   and split_part(new.ref, ':', 1) = c.habit_id::text and split_part(new.ref, ':', 2) = c.period) then
      raise exception 'habit reward without completion %', new.ref;
    end if;
    if new.gold > 10000 or new.renown > 2500 then raise exception 'habit reward too large'; end if;
  elsif new.kind = 'start' then
    if new.ref <> 'start' or new.gold > 150 or new.wood > 80 or new.stone > 0 or new.renown > 0 then raise exception 'invalid start grant'; end if;
  elsif new.kind = 'achievement' then
    if new.renown > 1000 or new.gold <> 0 or new.wood <> 0 or new.stone <> 0 then raise exception 'invalid achievement reward'; end if;
  elsif new.kind = 'trade' then
    if new.gold + new.wood * 1.5 + new.stone * 2.5 + new.renown * 10 > 60000 then raise exception 'trade too large'; end if;
  elsif new.kind = 'loot' then
    if new.gold > 10000 or new.stone > 3000 or new.renown > 400 or new.wood > 3000 then raise exception 'loot too large'; end if;
  end if;
  if tg_op = 'UPDATE' then
    new.gold := greatest(new.gold, old.gold); new.wood := greatest(new.wood, old.wood);
    new.stone := greatest(new.stone, old.stone); new.renown := greatest(new.renown, old.renown);
  end if;
  return new;
end $$;

create or replace function public.sync_kingdom(p jsonb) returns jsonb language plpgsql security invoker as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  insert into public.study_sessions (id, user_id, subject, source, started_at, ended_at, verified_seconds, forfeited_seconds, check_ins, missed, notes)
  select r.id, me, r.subject, r.source, r.started_at, r.ended_at, r.verified_seconds, r.forfeited_seconds, r.check_ins, r.missed, coalesce(r.notes, '')
  from jsonb_to_recordset(coalesce(p->'sessions', '[]')) as r(id uuid, subject text, source text, started_at timestamptz, ended_at timestamptz, verified_seconds int, forfeited_seconds int, check_ins int, missed int, notes text)
  on conflict (id) do update set
    verified_seconds = greatest(study_sessions.verified_seconds, excluded.verified_seconds),
    forfeited_seconds = greatest(study_sessions.forfeited_seconds, excluded.forfeited_seconds),
    ended_at = coalesce(study_sessions.ended_at, excluded.ended_at),
    check_ins = greatest(study_sessions.check_ins, excluded.check_ins), missed = greatest(study_sessions.missed, excluded.missed),
    notes = excluded.notes, updated_at = now();
  delete from public.study_sessions where user_id = me and verified_seconds = 0
    and id in (select (d.value #>> '{}')::uuid from jsonb_array_elements(coalesce(p#>'{dead,sessions}', '[]')) d);

  insert into public.habits (id, user_id, name, freq, target, unit, weight, require_note, best, earned, archived, created_at, updated_at)
  select r.id, me, r.name, r.freq, r.target, r.unit, r.weight, r.require_note, r.best, r.earned, coalesce(r.archived, false), r.created_at, r.updated_at
  from jsonb_to_recordset(coalesce(p->'habits', '[]')) as r(id uuid, name text, freq text, target int, unit text, weight int, require_note boolean, best int, earned jsonb, archived boolean, created_at timestamptz, updated_at timestamptz)
  on conflict (id) do update set name = excluded.name, freq = excluded.freq, target = excluded.target, unit = excluded.unit, weight = excluded.weight,
    require_note = excluded.require_note, best = greatest(habits.best, excluded.best), earned = excluded.earned, archived = excluded.archived, updated_at = excluded.updated_at
    where excluded.updated_at >= habits.updated_at;
  update public.habits set deleted = true, updated_at = now() where user_id = me
    and id in (select (d.value #>> '{}')::uuid from jsonb_array_elements(coalesce(p#>'{dead,habits}', '[]')) d);

  insert into public.habit_completions (user_id, habit_id, period, count, done, note, at)
  select me, r.habit_id, r.period, r.count, r.done, r.note, r.at
  from jsonb_to_recordset(coalesce(p->'completions', '[]')) as r(habit_id uuid, period text, count int, done boolean, note text, at timestamptz)
  where exists (select 1 from public.habits h where h.id = r.habit_id and h.user_id = me)
  on conflict (user_id, habit_id, period) do update set count = greatest(habit_completions.count, excluded.count), done = habit_completions.done or excluded.done,
    note = coalesce(excluded.note, habit_completions.note);

  insert into public.ledger (user_id, kind, ref, gold, wood, stone, renown, at)
  select me, r.kind, r.ref, r.gold, r.wood, r.stone, r.renown, r.at
  from jsonb_to_recordset(coalesce(p->'ledger', '[]')) as r(kind text, ref text, gold numeric, wood numeric, stone numeric, renown numeric, at timestamptz)
  on conflict (user_id, kind, ref) do update set gold = excluded.gold, wood = excluded.wood, stone = excluded.stone, renown = excluded.renown
    where ledger.kind in ('study', 'manual');

  insert into public.buildings (id, user_id, kind, x, y, level, built_at, updated_at)
  select r.id, me, r.kind, r.x, r.y, r.level, r.built_at, r.updated_at
  from jsonb_to_recordset(coalesce(p->'buildings', '[]')) as r(id uuid, kind text, x int, y int, level int, built_at timestamptz, updated_at timestamptz)
  on conflict (id) do update set x = excluded.x, y = excluded.y, level = greatest(buildings.level, excluded.level), updated_at = excluded.updated_at
    where excluded.updated_at >= buildings.updated_at and not buildings.deleted;
  update public.buildings set deleted = true, updated_at = now() where user_id = me and kind <> 'camp'
    and id in (select (d.value #>> '{}')::uuid from jsonb_array_elements(coalesce(p#>'{dead,buildings}', '[]')) d);

  insert into public.battalions (id, user_id, name, army, color, emblem, formation, x, y, commander, updated_at)
  select r.id, me, r.name, r.army, r.color, r.emblem, r.formation, r.x, r.y, r.commander, r.updated_at
  from jsonb_to_recordset(coalesce(p->'battalions', '[]')) as r(id uuid, name text, army text, color int, emblem text, formation text, x real, y real, commander jsonb, updated_at timestamptz)
  on conflict (id) do update set name = excluded.name, army = excluded.army, color = excluded.color, emblem = excluded.emblem, formation = excluded.formation,
    x = excluded.x, y = excluded.y, commander = excluded.commander, updated_at = excluded.updated_at
    where excluded.updated_at >= battalions.updated_at and not battalions.deleted;
  update public.battalions set deleted = true, updated_at = now() where user_id = me
    and id in (select (d.value #>> '{}')::uuid from jsonb_array_elements(coalesce(p#>'{dead,battalions}', '[]')) d);

  insert into public.squads (id, user_id, battalion_id, cls, count, xp, rank, updated_at)
  select r.id, me, r.battalion_id, r.cls, r.count, r.xp, r.rank, r.updated_at
  from jsonb_to_recordset(coalesce(p->'squads', '[]')) as r(id uuid, battalion_id uuid, cls text, count int, xp real, rank int, updated_at timestamptz)
  on conflict (id) do update set battalion_id = excluded.battalion_id, count = excluded.count, xp = greatest(squads.xp, excluded.xp),
    rank = greatest(squads.rank, excluded.rank), updated_at = excluded.updated_at
    where excluded.updated_at >= squads.updated_at and not squads.deleted;
  update public.squads set deleted = true, updated_at = now() where user_id = me
    and id in (select (d.value #>> '{}')::uuid from jsonb_array_elements(coalesce(p#>'{dead,squads}', '[]')) d);

  insert into public.techs (user_id, tech) select me, x #>> '{}' from jsonb_array_elements(coalesce(p->'techs', '[]')) x on conflict do nothing;

  insert into public.events (id, user_id, t, type, text, n)
  select r.id, me, r.t, r.type, r.text, r.n from jsonb_to_recordset(coalesce(p->'events', '[]')) as r(id uuid, t timestamptz, type text, text text, n int)
  on conflict (id) do nothing;

  if p ? 'kingdom' then
    insert into public.kingdom (user_id, stage, achievements, subjects, settings, active_session, world, updated_at)
    values (me, (p#>>'{kingdom,stage}')::int,
      array(select jsonb_array_elements_text(p#>'{kingdom,achievements}')), array(select jsonb_array_elements_text(p#>'{kingdom,subjects}')),
      p#>'{kingdom,settings}', nullif(p#>'{kingdom,active_session}', 'null'), nullif(p#>'{kingdom,world}', 'null'), now())
    on conflict (user_id) do update set stage = greatest(kingdom.stage, excluded.stage),
      achievements = array(select distinct unnest(kingdom.achievements || excluded.achievements)),
      subjects = array(select distinct unnest(kingdom.subjects || excluded.subjects)),
      settings = excluded.settings, active_session = excluded.active_session, world = coalesce(excluded.world, kingdom.world), updated_at = now();
  end if;

  return jsonb_build_object(
    'balance', (select jsonb_build_object('gold', coalesce(sum(gold), 0), 'wood', coalesce(sum(wood), 0), 'stone', coalesce(sum(stone), 0), 'renown', coalesce(sum(renown), 0)) from public.ledger where user_id = me),
    'lifetime', (select jsonb_build_object('gold', coalesce(sum(gold), 0), 'wood', coalesce(sum(wood), 0), 'stone', coalesce(sum(stone), 0), 'renown', coalesce(sum(renown), 0)) from public.ledger where user_id = me and kind not in ('spend', 'refund', 'start', 'trade')),
    'kingdom', (select to_jsonb(k) - 'user_id' from public.kingdom k where user_id = me),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by started_at desc) from public.study_sessions s where user_id = me), '[]'),
    'session_rewards', coalesce((select jsonb_object_agg(ref, jsonb_build_object('gold', gold, 'wood', wood, 'stone', stone, 'renown', renown)) from public.ledger where user_id = me and kind in ('study', 'manual')), '{}'),
    'habits', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id') from public.habits h where user_id = me and not deleted), '[]'),
    'completions', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id') from public.habit_completions c where user_id = me), '[]'),
    'buildings', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id') from public.buildings b where user_id = me and not deleted), '[]'),
    'battalions', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id') from public.battalions b where user_id = me and not deleted), '[]'),
    'squads', coalesce((select jsonb_agg(to_jsonb(q) - 'user_id') from public.squads q where user_id = me and not deleted), '[]'),
    'techs', coalesce((select jsonb_agg(tech) from public.techs where user_id = me), '[]'),
    'events', coalesce((select jsonb_agg(e order by e.t desc) from (select id, t, type, text, n from public.events where user_id = me order by t desc limit 500) e), '[]')
  );
end $$;
grant execute on function public.sync_kingdom(jsonb) to authenticated;

-- make the API see new functions immediately
notify pgrst, 'reload schema';
