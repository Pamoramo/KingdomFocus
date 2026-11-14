-- Exponential focus rewards: long sessions pay up to 3x per minute, so the reward ceiling rises.
create or replace function public.check_ledger() returns trigger language plpgsql as $$
declare v int; src text; m numeric;
begin
  if new.kind in ('study', 'manual') then
    select verified_seconds, source into v, src from public.study_sessions where id::text = new.ref and user_id = new.user_id;
    if v is null then raise exception 'study reward without session %', new.ref; end if;
    if (new.kind = 'manual') <> (src = 'manual') then raise exception 'reward kind does not match session source'; end if;
    m := v / 60.0 * (case when src = 'manual' then 0.5 else 1 end);
    -- ceiling: 2x the base rate (10/5/3/1 per minute) x up to 3x focus growth x building, vassal and town bonuses
    if new.gold > m * 100 + 1 or new.wood > m * 50 + 1 or new.stone > m * 30 + 1 or new.renown > m * 12 + 1 then
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

notify pgrst, 'reload schema';
