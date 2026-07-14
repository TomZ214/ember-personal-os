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
  created_at timestamptz not null default now()
);

alter table public.task_inbox enable row level security;

-- the owner reads and clears their inbox; nobody can insert directly —
-- inserts only happen through the token-checked function below
create policy "own inbox: select" on public.task_inbox
  for select using (auth.uid() = user_id);
create policy "own inbox: delete" on public.task_inbox
  for delete using (auth.uid() = user_id);

create or replace function public.inbox_add_task(
  share_token uuid,
  task_title  text,
  task_notes  text default null,
  sender_name text default null
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
  if (select count(*) from public.task_inbox where user_id = uid) >= 200 then
    raise exception 'inbox full';
  end if;
  insert into public.task_inbox (user_id, title, notes, sender)
  values (
    uid,
    trim(task_title),
    nullif(left(trim(coalesce(task_notes, '')), 2000), ''),
    nullif(left(trim(coalesce(sender_name, '')), 80), '')
  );
end;
$$;

grant execute on function public.inbox_add_task to anon, authenticated;

-- realtime: new inbox tasks appear on the owner's devices instantly
alter publication supabase_realtime add table public.task_inbox;

