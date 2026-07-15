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

alter table public.task_inbox enable row level security;

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

create or replace function public.inbox_add_task(
  share_token     uuid,
  task_title      text,
  task_notes      text default null,
  sender_name     text default null,
  task_priority   text default 'medium',
  task_due        date default null,
  task_recurrence text default 'none'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
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
  if (select count(*) from public.task_inbox where user_id = uid) >= 200 then
    raise exception 'inbox full';
  end if;
  insert into public.task_inbox (user_id, title, notes, sender, priority, due, recurrence)
  values (
    uid,
    trim(task_title),
    nullif(left(trim(coalesce(task_notes, '')), 2000), ''),
    nullif(left(trim(coalesce(sender_name, '')), 80), ''),
    task_priority,
    task_due,
    task_recurrence
  );
end;
$$;

grant execute on function public.inbox_add_task to anon, authenticated;

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

