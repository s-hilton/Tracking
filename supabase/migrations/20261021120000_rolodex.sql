-- Rolodex app (js/apps/rolodex): your personal contacts and who knows whom.
-- Every row is private to the signed-in user.

-- One card per person
create table if not exists public.rolodex_contacts (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  first_name      text    not null default '',
  last_name       text    not null default '',
  nickname        text    not null default '',
  company         text    not null default '',
  title           text    not null default '',
  emails          jsonb   not null default '[]',  -- [{ label, value }]
  phones          jsonb   not null default '[]',  -- [{ label, value }]
  linkedin        text    not null default '',
  urls            jsonb   not null default '[]',  -- [{ label, value }]
  location        text    not null default '',
  birthday        text    not null default '',
  where_met_tags  jsonb   not null default '[]',
  where_met       text    not null default '',
  met_on          date,
  similarities    text    not null default '',
  hoping_for_tags jsonb   not null default '[]',
  hoping_for      text    not null default '',
  extra_info      text    not null default '',
  tags            text    not null default '',
  closeness       text    not null default '',
  introduced_by   text    not null default '',    -- id of the card who introduced you
  intro_note      text    not null default '',
  follow_up_on    date,
  last_contacted  date,
  cadence_days    integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.rolodex_contacts enable row level security;
create policy "Users manage their own rolodex contacts"
  on public.rolodex_contacts for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.rolodex_contacts to authenticated;

-- Who knows whom: one row per pair of cards
create table if not exists public.rolodex_connections (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  a_id          text     not null,
  b_id          text     not null,
  kind          text     not null default 'unknown',
  note          text     not null default '',
  introduced_by text     not null default '',     -- id of the card who introduced them, if known
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.rolodex_connections enable row level security;
create policy "Users manage their own rolodex connections"
  on public.rolodex_connections for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.rolodex_connections to authenticated;
