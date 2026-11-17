-- The tavern: a new kind of building. The building-kind check is replaced to allow it.
alter table public.buildings drop constraint if exists buildings_kind_check;
alter table public.buildings add constraint buildings_kind_check check (kind in ('camp','hut','house','farm','well','road','market','blacksmith','storehouse','stable','barracks','range','trainfield','armory','cavstable','watchtower','guardhouse','siege','palisade','wall','gate','gatehouse','tower','keep','greathall','courtyard','moat','palace','tavern'));

create or replace function public.kod_schema_version() returns int language sql immutable as $$ select 6 $$;
grant execute on function public.kod_schema_version() to anon, authenticated;

notify pgrst, 'reload schema';
