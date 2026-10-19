-- Tasks app (js/apps/tasks). One row per task, private to the signed-in user.
create table if not exists public.tasks (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  text       text        not null,
  done       boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.tasks enable row level security;

create policy "Users manage their own tasks"
  on public.tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks to authenticated;
