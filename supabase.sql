create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "own save" on public.saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
