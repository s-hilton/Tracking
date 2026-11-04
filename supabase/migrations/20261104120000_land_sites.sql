-- Land Search app (js/apps/land-search), in the Astra Retrieval folder.
-- Saved sites and institutions and their outreach pipeline. Every row is
-- private to the signed-in user.
create table if not exists public.land_sites (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  source_key     text          not null default '',   -- the map / institution record it was saved from
  category       text          not null default '',   -- parcel | land | building | college | tribe | museum
  name           text          not null default '',
  kind           text          not null default '',
  source         text          not null default '',
  source_url     text          not null default '',
  owner          text          not null default '',
  owner_type     text          not null default '',
  address        text          not null default '',
  parcel_id      text          not null default '',
  acres          numeric(14,2) check (acres is null or acres >= 0),
  lat            numeric(9,6),
  lng            numeric(9,6),
  website        text          not null default '',
  phone          text          not null default '',
  stage          text          not null default 'found',
  stage_history  jsonb         not null default '[]',  -- [{ stage, at }]
  contacts       jsonb         not null default '[]',  -- [{ name, title, email, phone }]
  activity       jsonb         not null default '[]',  -- [{ at, type, text }]
  next_follow_up date,
  decline_reason text          not null default '',
  notes          text          not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.land_sites enable row level security;
create policy "Users manage their own land sites"
  on public.land_sites for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.land_sites to authenticated;
