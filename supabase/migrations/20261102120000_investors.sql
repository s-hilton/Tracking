-- Investors app (js/apps/investor-tracker), in the Astra Retrieval folder.
-- Fundraising rounds, investor firms, each firm's progress in each round, and a
-- timeline of updates. Every row is private to the signed-in user.

-- Rounds (Pre-seed, Seed, Series A…)
create table if not exists public.investor_rounds (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name          text          not null default '',
  status        text          not null default 'active',
  target_amount numeric(16,2) check (target_amount is null or target_amount >= 0),
  opened_on     date,
  closed_on     date,
  notes         text          not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.investor_rounds enable row level security;
create policy "Users manage their own investor rounds"
  on public.investor_rounds for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.investor_rounds to authenticated;

-- Investors (funds, angels, family offices…) and their contact info
create table if not exists public.investor_firms (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name             text    not null default '',
  type             text    not null default '',
  website          text    not null default '',
  email            text    not null default '',
  phone            text    not null default '',
  linkedin         text    not null default '',
  location         text    not null default '',
  check_size       text    not null default '',
  focus            text    not null default '',
  contacts         jsonb   not null default '[]',  -- [{ name, title, email, phone, linkedin }]
  introduced_by    text    not null default '',
  tags             text    not null default '',
  notes            text    not null default '',
  wants_updates    boolean not null default false,
  last_update_sent date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.investor_firms enable row level security;
create policy "Users manage their own investor firms"
  on public.investor_firms for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.investor_firms to authenticated;

-- One firm in one round: stage, follow-up, why they passed, keep in mind
create table if not exists public.investor_outreach (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  firm_id          text          not null default '',
  round_id         text          not null default '',
  stage            text          not null default 'to_contact',
  stage_entered_at timestamptz,
  stage_history    jsonb         not null default '[]',  -- [{ stage, at }]
  contact_name     text          not null default '',
  next_follow_up   date,
  amount           numeric(16,2) check (amount is null or amount >= 0),
  pass_reason      text          not null default '',
  pass_notes       text          not null default '',
  keep_in_mind     boolean       not null default false,
  carried_from     text          not null default '',
  notes            text          not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.investor_outreach enable row level security;
create policy "Users manage their own investor outreach"
  on public.investor_outreach for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.investor_outreach to authenticated;
create index if not exists investor_outreach_firm_idx on public.investor_outreach (user_id, firm_id);
create index if not exists investor_outreach_round_idx on public.investor_outreach (user_id, round_id);

-- Timeline: emails, calls, meetings, notes, stage changes, investor updates sent
create table if not exists public.investor_activities (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  firm_id      text not null default '',
  round_id     text not null default '',
  outreach_id  text not null default '',
  happened_on  date,
  kind         text not null default 'note',
  text         text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.investor_activities enable row level security;
create policy "Users manage their own investor activities"
  on public.investor_activities for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.investor_activities to authenticated;
create index if not exists investor_activities_firm_idx on public.investor_activities (user_id, firm_id);
