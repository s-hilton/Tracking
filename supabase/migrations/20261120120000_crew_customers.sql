-- Customer Outreach app (js/apps/crew-outreach), in the Crew Orchard folder.
-- People you're reaching out to about Crew Orchard and a timeline of every
-- contact with them. Every row is private to the signed-in user.

-- Customers / leads: who they are, where they work, where the conversation stands
create table if not exists public.crew_customers (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name             text        not null default '',
  position         text        not null default '',
  company          text        not null default '',
  industry         text        not null default '',
  email            text        not null default '',
  phone            text        not null default '',
  linkedin         text        not null default '',
  website          text        not null default '',
  location         text        not null default '',
  company_size     text        not null default '',
  source           text        not null default '',
  tags             text        not null default '',
  notes            text        not null default '',
  stage            text        not null default 'to_contact',
  stage_entered_at timestamptz,
  stage_history    jsonb       not null default '[]',  -- [{ stage, at }]
  last_contacted   date,
  next_follow_up   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.crew_customers enable row level security;
create policy "Users manage their own crew customers"
  on public.crew_customers for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.crew_customers to authenticated;

-- Timeline: emails, LinkedIn messages, calls, meetings, notes, stage changes
create table if not exists public.crew_customer_activities (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  customer_id  text not null default '',
  happened_on  date,
  kind         text not null default 'note',
  text         text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.crew_customer_activities enable row level security;
create policy "Users manage their own crew customer activities"
  on public.crew_customer_activities for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.crew_customer_activities to authenticated;
create index if not exists crew_customer_activities_customer_idx on public.crew_customer_activities (user_id, customer_id);
