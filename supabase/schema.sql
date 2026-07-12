-- Ember cloud sync — run this once in Supabase: SQL Editor → New query → Run.
--
-- One row per user holding the syncable snapshot (tasks, events, notes,
-- habits, goals, finance, contacts, mails, settings, encrypted vault blob).
-- Row-level security guarantees every query is scoped to auth.uid() —
-- no user can ever read or write another user's row.

create table if not exists public.os_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  device_id  text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.os_state enable row level security;

create policy "own row: select" on public.os_state
  for select using (auth.uid() = user_id);

create policy "own row: insert" on public.os_state
  for insert with check (auth.uid() = user_id);

create policy "own row: update" on public.os_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row: delete" on public.os_state
  for delete using (auth.uid() = user_id);

-- realtime: let signed-in devices receive each other's updates instantly
alter publication supabase_realtime add table public.os_state;
