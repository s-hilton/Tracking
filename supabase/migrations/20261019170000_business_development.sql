-- LOIs app (js/apps/loi-tracker): Astra Retrieval business development.
-- Shared companies and contacts, per-product opportunities, an activity timeline,
-- follow-up tasks, and richer LOIs (versions, product allocations, dates, history).
-- Every row is private to the signed-in user.

-- Companies (shared across all three product pipelines)
create table if not exists public.bd_companies (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name            text        not null,
  aliases         text        not null default '',
  website         text        not null default '',
  type            text        not null default '',
  industry        text        not null default '',
  headquarters    text        not null default '',
  country         text        not null default '',
  general_email   text        not null default '',
  phone           text        not null default '',
  linkedin        text        not null default '',
  lead_source     text        not null default '',
  introduced_by   text        not null default '',
  tags            text        not null default '',
  notes           text        not null default '',
  do_not_contact  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bd_companies enable row level security;
create policy "Users manage their own companies"
  on public.bd_companies for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.bd_companies to authenticated;

-- People at companies
create table if not exists public.bd_contacts (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  company_id        text      not null default '',
  first_name        text      not null default '',
  last_name         text      not null default '',
  title             text      not null default '',
  department        text      not null default '',
  email             text      not null default '',
  phone             text      not null default '',
  linkedin          text      not null default '',
  role              text      not null default '',
  status            text      not null default 'active',
  preferred_channel text      not null default '',
  timezone          text      not null default '',
  introduced_by     text      not null default '',
  notes             text      not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bd_contacts enable row level security;
create policy "Users manage their own contacts"
  on public.bd_contacts for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.bd_contacts to authenticated;
create index if not exists bd_contacts_company_idx on public.bd_contacts (user_id, company_id);

-- Opportunities: one company x one product commercial pursuit
create table if not exists public.bd_opportunities (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  company_id          text          not null default '',
  product             text          not null,
  name                text          not null default '',
  stage               text          not null default 'identified',
  stage_entered_at    timestamptz,
  stage_history       jsonb,
  priority            text          not null default 'normal',
  primary_use_case    text          not null default '',
  use_cases           jsonb,
  use_case_source     text          not null default '',
  fit_rationale       text          not null default '',
  contact_ids         jsonb,
  estimated_value     numeric(16,2) check (estimated_value is null or estimated_value >= 0),
  value_basis         text          not null default 'total',
  probability         numeric(5,2)  check (probability is null or probability between 0 and 100),
  expected_signing_on date,
  next_step           text          not null default '',
  risks               text          not null default '',
  loss_reason         text          not null default '',
  details             jsonb,
  notes               text          not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bd_opportunities enable row level security;
create policy "Users manage their own opportunities"
  on public.bd_opportunities for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.bd_opportunities to authenticated;
create index if not exists bd_opportunities_company_idx on public.bd_opportunities (user_id, company_id);

-- Activity timeline: every outreach, reply, meeting and note
create table if not exists public.bd_activities (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  company_id      text        not null default '',
  occurred_at     timestamptz not null default now(),
  type            text        not null default 'note',
  direction       text        not null default 'outbound',
  subject         text        not null default '',
  summary         text        not null default '',
  outcome         text        not null default '',
  contact_ids     jsonb,
  opportunity_ids jsonb,
  link            text        not null default '' check (link = '' or link ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bd_activities enable row level security;
create policy "Users manage their own activities"
  on public.bd_activities for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.bd_activities to authenticated;
create index if not exists bd_activities_company_idx on public.bd_activities (user_id, company_id);

-- Follow-up tasks
create table if not exists public.bd_tasks (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  company_id     text        not null default '',
  opportunity_id text        not null default '',
  title          text        not null,
  due_on         date,
  priority       text        not null default 'normal',
  status         text        not null default 'not_started',
  notes          text        not null default '',
  completed_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.bd_tasks enable row level security;
create policy "Users manage their own tasks"
  on public.bd_tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.bd_tasks to authenticated;
create index if not exists bd_tasks_company_idx on public.bd_tasks (user_id, company_id);

-- ---- LOIs: upgrade the first-version table -------------------------------------
alter table public.lois rename column received_on to signed_on;
alter table public.lois alter column company set default '';
alter table public.lois alter column status set default 'draft';
alter table public.lois
  add column if not exists company_id      text  not null default '',
  add column if not exists title           text  not null default '',
  add column if not exists currency        text  not null default 'USD',
  add column if not exists value_basis     text  not null default 'total',
  add column if not exists allocations     jsonb,
  add column if not exists opportunity_ids jsonb,
  add column if not exists sent_on         date,
  add column if not exists effective_on    date,
  add column if not exists draft_url       text  not null default '' check (draft_url = '' or draft_url ~* '^https?://'),
  add column if not exists signatories     text  not null default '',
  add column if not exists binding         text  not null default '',
  add column if not exists legal_notes     text  not null default '',
  add column if not exists supersedes_id   text  not null default '',
  add column if not exists status_history  jsonb;
create index if not exists lois_company_idx on public.lois (user_id, company_id);

-- First-version statuses -> PRD statuses.
update public.lois set status = case status
  when 'prospect' then 'not_started'
  when 'requested' then 'shared'
  when 'declined' then 'withdrawn'
  else status end;

-- First-version LOIs stored the company and contact as text; turn them into records.
insert into public.bd_companies (user_id, id, name)
select distinct on (user_id, lower(trim(company)))
  user_id, 'legacy-' || md5(lower(trim(company))), trim(company)
from public.lois
where trim(company) <> ''
on conflict do nothing;

update public.lois
set company_id = 'legacy-' || md5(lower(trim(company))),
    title = case when title = '' then trim(company) || ' LOI' else title end
where company_id = '' and trim(company) <> '';

insert into public.bd_contacts (user_id, id, company_id, first_name, email)
select user_id, 'legacy-' || md5(id), company_id, contact_name, contact_email
from public.lois
where company_id <> '' and (contact_name <> '' or contact_email <> '')
on conflict do nothing;
