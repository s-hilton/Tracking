-- Web apps (js/apps/web-apps). Websites pinned to the dashboard, private to the signed-in user.
create table if not exists public.web_apps (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name       text        not null,
  url        text        not null check (url ~* '^https?://'),
  icon       text        not null default '🌐',
  color      text        not null default '#475569',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.web_apps enable row level security;

create policy "Users manage their own web apps"
  on public.web_apps for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.web_apps to authenticated;
