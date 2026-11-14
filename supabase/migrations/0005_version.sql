-- Schema version, so the game can tell when this database needs `setup.sql` re-run
-- (an old reward ceiling otherwise rejects long-session rewards and blocks cloud saves).
create or replace function public.kod_schema_version() returns int language sql immutable as $$ select 5 $$;
grant execute on function public.kod_schema_version() to anon, authenticated;

notify pgrst, 'reload schema';
