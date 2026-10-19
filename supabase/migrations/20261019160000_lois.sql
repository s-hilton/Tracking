-- LOI Tracker (js/apps/loi-tracker), in the Astra Retrieval folder.
-- Letters of intent from customers, private to the signed-in user.
create table if not exists public.lois (
  user_id       uuid          not null default auth.uid() references auth.users (id) on delete cascade,
  id            text          not null,
  company       text          not null,
  contact_name  text          not null default '',
  contact_email text          not null default '',
  status        text          not null default 'prospect',
  amount        numeric(16,2) check (amount is null or amount >= 0),
  received_on   date,
  expires_on    date,
  document_url  text          not null default '' check (document_url = '' or document_url ~* '^https?://'),
  notes         text          not null default '',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  primary key (user_id, id)
);

alter table public.lois enable row level security;

create policy "Users manage their own LOIs"
  on public.lois for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.lois to authenticated;
