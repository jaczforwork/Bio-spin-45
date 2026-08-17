create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;

revoke all on table public.user_states from anon;
grant select, insert, update on table public.user_states to authenticated;

drop policy if exists "Users can read their own learning state" on public.user_states;
create policy "Users can read their own learning state"
on public.user_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own learning state" on public.user_states;
create policy "Users can create their own learning state"
on public.user_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own learning state" on public.user_states;
create policy "Users can update their own learning state"
on public.user_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

do $$
begin
  alter publication supabase_realtime add table public.user_states;
exception
  when duplicate_object then null;
end $$;
