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

-- ============================================================
-- Family quick-add (added later — safe to run on an existing DB)
-- A share link lets someone without an account drop tasks into your
-- inbox via /add/<token>. They can ONLY add tasks — never read anything.
-- ============================================================

create table if not exists public.share_links (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default 'Familie',
  created_at timestamptz not null default now()
);

alter table public.share_links enable row level security;

drop policy if exists "own links: select" on public.share_links;
drop policy if exists "own links: insert" on public.share_links;
drop policy if exists "own links: delete" on public.share_links;
create policy "own links: select" on public.share_links
  for select using (auth.uid() = user_id);
create policy "own links: insert" on public.share_links
  for insert with check (auth.uid() = user_id);
create policy "own links: delete" on public.share_links
  for delete using (auth.uid() = user_id);

create table if not exists public.task_inbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  notes      text,
  sender     text,
  priority   text not null default 'medium',
  created_at timestamptz not null default now()
);

-- upgrade path for databases created before these columns existed
alter table public.task_inbox add column if not exists priority text not null default 'medium';
alter table public.task_inbox add column if not exists due date;
alter table public.task_inbox add column if not exists recurrence text not null default 'none';
alter table public.task_inbox add column if not exists token uuid;
alter table public.task_inbox add column if not exists repeat jsonb; -- full RepeatRule
alter table public.task_inbox add column if not exists time text;    -- HH:mm due time

alter table public.task_inbox enable row level security;

-- persistent record of family-submitted tasks so the submitter can later see
-- whether the owner did them — scoped to the share link, never the owner's
-- other tasks. NOT foreign-keyed to task_inbox, so draining (which deletes the
-- inbox row) leaves this record intact.
create table if not exists public.shared_tasks (
  id         uuid primary key,
  token      uuid not null references public.share_links (token) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sender     text,
  title      text not null,
  status     text not null default 'open', -- open | done
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

alter table public.shared_tasks enable row level security;

-- the owner manages their own rows; family members only ever read through the
-- token-checked RPC below (no anon select policy exists)
drop policy if exists "own shared: select" on public.shared_tasks;
drop policy if exists "own shared: update" on public.shared_tasks;
drop policy if exists "own shared: delete" on public.shared_tasks;
create policy "own shared: select" on public.shared_tasks
  for select using (auth.uid() = user_id);
create policy "own shared: update" on public.shared_tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own shared: delete" on public.shared_tasks
  for delete using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.shared_tasks;
exception when duplicate_object then null;
end $$;

-- the owner reads and clears their inbox; nobody can insert directly —
-- inserts only happen through the token-checked function below
drop policy if exists "own inbox: select" on public.task_inbox;
drop policy if exists "own inbox: delete" on public.task_inbox;
create policy "own inbox: select" on public.task_inbox
  for select using (auth.uid() = user_id);
create policy "own inbox: delete" on public.task_inbox
  for delete using (auth.uid() = user_id);

-- earlier signatures must go, otherwise the overloaded call is ambiguous
drop function if exists public.inbox_add_task(uuid, text, text, text);
drop function if exists public.inbox_add_task(uuid, text, text, text, text);
drop function if exists public.inbox_add_task(uuid, text, text, text, text, date);
drop function if exists public.inbox_add_task(uuid, text, text, text, text, date, text);
drop function if exists public.inbox_add_task(uuid, text, text, text, text, date, text, jsonb);

create or replace function public.inbox_add_task(
  share_token     uuid,
  task_title      text,
  task_notes      text default null,
  sender_name     text default null,
  task_priority   text default 'medium',
  task_due        date default null,
  task_recurrence text default 'none',
  task_repeat     jsonb default null,
  task_time       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  new_id uuid := gen_random_uuid();
  clean_sender text;
begin
  select user_id into uid from public.share_links where token = share_token;
  if uid is null then
    raise exception 'invalid token';
  end if;
  if task_title is null or length(trim(task_title)) = 0 or length(task_title) > 300 then
    raise exception 'invalid title';
  end if;
  if task_priority is null or task_priority not in ('low', 'medium', 'high', 'urgent') then
    task_priority := 'medium';
  end if;
  if task_recurrence is null or task_recurrence not in ('none', 'daily', 'weekly', 'monthly') then
    task_recurrence := 'none';
  end if;
  -- a time only makes sense with a date, and must look like HH:mm
  if task_due is null or task_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    task_time := null;
  end if;
  if (select count(*) from public.task_inbox where user_id = uid) >= 200 then
    raise exception 'inbox full';
  end if;
  clean_sender := nullif(left(trim(coalesce(sender_name, '')), 80), '');
  insert into public.task_inbox (id, user_id, token, title, notes, sender, priority, due, recurrence, repeat, time)
  values (
    new_id, uid, share_token,
    trim(task_title),
    nullif(left(trim(coalesce(task_notes, '')), 2000), ''),
    clean_sender,
    task_priority,
    task_due,
    task_recurrence,
    task_repeat,
    task_time
  );
  -- mirror into shared_tasks so the sender can track it (same id links them)
  insert into public.shared_tasks (id, token, user_id, sender, title, status)
  values (new_id, share_token, uid, clean_sender, trim(task_title), 'open');
end;
$$;

grant execute on function public.inbox_add_task to anon, authenticated;

-- family members read back the status of tasks they submitted through a link.
-- Only rows for THAT token are ever returned — never the owner's other tasks.
create or replace function public.inbox_list_tasks(share_token uuid)
returns table (title text, status text, sender text, created_at timestamptz, done_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.share_links where token = share_token) then
    raise exception 'invalid token';
  end if;
  return query
    select st.title, st.status, st.sender, st.created_at, st.done_at
    from public.shared_tasks st
    where st.token = share_token
    order by (st.status = 'done'), st.created_at desc
    limit 100;
end;
$$;

grant execute on function public.inbox_list_tasks to anon, authenticated;

-- realtime: new inbox tasks appear on the owner's devices instantly
-- (wrapped so re-running the file never errors)
do $$
begin
  alter publication supabase_realtime add table public.task_inbox;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Push notifications (added later — safe to run on an existing DB)
-- One row per device that opted in. The scheduled job reads these plus the
-- user's os_state snapshot to decide what to send.
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'Europe/Berlin',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own subs: select" on public.push_subscriptions;
drop policy if exists "own subs: insert" on public.push_subscriptions;
drop policy if exists "own subs: update" on public.push_subscriptions;
drop policy if exists "own subs: delete" on public.push_subscriptions;
create policy "own subs: select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "own subs: insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own subs: update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subs: delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- send-once ledger: the cron runs every 15 min, this stops repeat pings.
-- key looks like 'digest-2026-07-15' or 'event-<id>-2026-07-15'
create table if not exists public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_log enable row level security;
-- only the service role (the cron job) touches this table; no client policies
