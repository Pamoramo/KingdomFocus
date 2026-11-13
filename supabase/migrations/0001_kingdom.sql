-- Kingdom of Discipline: schema, row level security and transactional sync.
-- Every resource change is a ledger row keyed by (user, kind, ref), so re-submitting
-- the same study session or habit completion can never pay out twice.

create table if not exists public.kingdom (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  stage int not null default 1 check (stage between 1 and 6),
  achievements text[] not null default '{}',
  subjects text[] not null default '{}',
  settings jsonb not null default '{}',
  active_session jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null check (length(subject) between 1 and 80),
  source text not null check (source in ('timer', 'pomodoro', 'manual')),
  started_at timestamptz not null,
  ended_at timestamptz,
  verified_seconds int not null default 0 check (verified_seconds >= 0),
  forfeited_seconds int not null default 0 check (forfeited_seconds >= 0),
  check_ins int not null default 0,
  missed int not null default 0,
  notes text not null default '' check (length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  constraint manual_cap check (source <> 'manual' or verified_seconds <= 14400)
);
create index if not exists study_sessions_user on public.study_sessions (user_id, started_at desc);

create table if not exists public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  freq text not null check (freq in ('daily', 'weekly')),
  target int not null default 1 check (target between 1 and 1000),
  unit text not null default '' check (length(unit) <= 30),
  weight int not null default 1 check (weight between 1 and 5),
  require_note boolean not null default false,
  best int not null default 0,
  earned jsonb not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.habit_completions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(\d{2}-\d{2}|W\d{2})$'),
  count int not null default 0 check (count >= 0),
  done boolean not null default false,
  note text,
  at timestamptz not null default now(),
  primary key (user_id, habit_id, period)
);

create table if not exists public.ledger (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('start', 'study', 'manual', 'habit', 'milestone', 'achievement', 'spend', 'refund')),
  ref text not null check (length(ref) <= 120),
  gold numeric not null default 0, wood numeric not null default 0, stone numeric not null default 0, renown numeric not null default 0,
  at timestamptz not null default now(),
  primary key (user_id, kind, ref),
  constraint spend_is_negative check (kind <> 'spend' or (gold <= 0 and wood <= 0 and stone <= 0 and renown <= 0)),
  constraint gains_are_positive check (kind = 'spend' or (gold >= 0 and wood >= 0 and stone >= 0 and renown >= 0))
);

create table if not exists public.buildings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('camp','hut','house','farm','well','road','market','blacksmith','storehouse','stable','barracks','range','trainfield','armory','cavstable','watchtower','guardhouse','siege','palisade','wall','gate','gatehouse','tower','keep','greathall','courtyard','moat','palace')),
  x int not null check (x between 0 and 200), y int not null check (y between 0 and 200),
  level int not null default 1 check (level between 1 and 5),
  built_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create unique index if not exists one_of_a_kind on public.buildings (user_id, kind) where kind in ('camp', 'keep', 'palace') and not deleted;

create table if not exists public.battalions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  army text not null default 'Royal Army' check (length(army) between 1 and 60),
  color int not null, emblem text not null,
  formation text not null default 'block' check (formation in ('line', 'block', 'column')),
  x real not null, y real not null,
  commander jsonb not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.squads (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  battalion_id uuid not null,
  cls text not null,
  count int not null check (count between 1 and 12),
  xp real not null default 0 check (xp >= 0),
  rank int not null default 0 check (rank between 0 and 4),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.techs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tech text not null,
  at timestamptz not null default now(),
  primary key (user_id, tech)
);

create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  t timestamptz not null, type text not null, text text not null check (length(text) <= 300), n int
);
create index if not exists events_user on public.events (user_id, t desc);

-- ---------- row level security: every row is private to its owner ----------
do $$ declare t text; begin
  foreach t in array array['kingdom','study_sessions','habits','habit_completions','ledger','buildings','battalions','squads','techs','events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
-- the ledger is append-only for clients (no deletes, updates only through the sync function)
drop policy if exists owner_all on public.ledger;
create policy ledger_read on public.ledger for select to authenticated using (user_id = auth.uid());
create policy ledger_insert on public.ledger for insert to authenticated with check (user_id = auth.uid());
create policy ledger_update on public.ledger for update to authenticated using (user_id = auth.uid() and kind in ('study', 'manual'));

-- ---------- validation: rewards must be backed by real records ----------
create or replace function public.check_session() returns trigger language plpgsql as $$
begin
  if new.source <> 'manual' and new.verified_seconds > extract(epoch from coalesce(new.ended_at, now()) - new.started_at) + 120 then
    raise exception 'verified time exceeds session duration';
  end if;
  if new.started_at > now() + interval '5 minutes' then raise exception 'session in the future'; end if;
  return new;
end $$;
drop trigger if exists check_session on public.study_sessions;
create trigger check_session before insert or update on public.study_sessions for each row execute function public.check_session();

create or replace function public.check_ledger() returns trigger language plpgsql as $$
declare v int; src text; m numeric;
begin
  if new.kind in ('study', 'manual') then
    select verified_seconds, source into v, src from public.study_sessions where id::text = new.ref and user_id = new.user_id;
    if v is null then raise exception 'study reward without session %', new.ref; end if;
    if (new.kind = 'manual') <> (src = 'manual') then raise exception 'reward kind does not match session source'; end if;
    m := v / 60.0 * (case when src = 'manual' then 0.5 else 1 end);
    -- generous ceiling: 2x configurable base rate (10/5/3/1 per minute) times building bonuses
    if new.gold > m * 30 + 1 or new.wood > m * 15 + 1 or new.stone > m * 9 + 1 or new.renown > m * 3.5 + 1 then
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
  end if;
  if tg_op = 'UPDATE' then -- cumulative session rewards may only grow
    new.gold := greatest(new.gold, old.gold); new.wood := greatest(new.wood, old.wood);
    new.stone := greatest(new.stone, old.stone); new.renown := greatest(new.renown, old.renown);
  end if;
  return new;
end $$;
drop trigger if exists check_ledger on public.ledger;
create trigger check_ledger before insert or update on public.ledger for each row execute function public.check_ledger();

create or replace view public.balances with (security_invoker = true) as
  select user_id, sum(gold) gold, sum(wood) wood, sum(stone) stone, sum(renown) renown from public.ledger group by user_id;

-- ---------- one transactional sync: push local changes, return the merged kingdom ----------
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
  on conflict (id) do update set battalion_id = excluded.battalion_id, count = greatest(squads.count, excluded.count), xp = greatest(squads.xp, excluded.xp),
    rank = greatest(squads.rank, excluded.rank), updated_at = excluded.updated_at
    where excluded.updated_at >= squads.updated_at and not squads.deleted;

  insert into public.techs (user_id, tech) select me, x #>> '{}' from jsonb_array_elements(coalesce(p->'techs', '[]')) x on conflict do nothing;

  insert into public.events (id, user_id, t, type, text, n)
  select r.id, me, r.t, r.type, r.text, r.n from jsonb_to_recordset(coalesce(p->'events', '[]')) as r(id uuid, t timestamptz, type text, text text, n int)
  on conflict (id) do nothing;

  if p ? 'kingdom' then
    insert into public.kingdom (user_id, stage, achievements, subjects, settings, active_session, updated_at)
    values (me, (p#>>'{kingdom,stage}')::int,
      array(select jsonb_array_elements_text(p#>'{kingdom,achievements}')), array(select jsonb_array_elements_text(p#>'{kingdom,subjects}')),
      p#>'{kingdom,settings}', nullif(p#>'{kingdom,active_session}', 'null'), now())
    on conflict (user_id) do update set stage = greatest(kingdom.stage, excluded.stage),
      achievements = array(select distinct unnest(kingdom.achievements || excluded.achievements)),
      subjects = array(select distinct unnest(kingdom.subjects || excluded.subjects)),
      settings = excluded.settings, active_session = excluded.active_session, updated_at = now();
  end if;

  return jsonb_build_object(
    'balance', (select jsonb_build_object('gold', coalesce(sum(gold), 0), 'wood', coalesce(sum(wood), 0), 'stone', coalesce(sum(stone), 0), 'renown', coalesce(sum(renown), 0)) from public.ledger where user_id = me),
    'lifetime', (select jsonb_build_object('gold', coalesce(sum(gold), 0), 'wood', coalesce(sum(wood), 0), 'stone', coalesce(sum(stone), 0), 'renown', coalesce(sum(renown), 0)) from public.ledger where user_id = me and kind not in ('spend', 'refund', 'start')),
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
