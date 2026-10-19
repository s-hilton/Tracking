-- Notes app (js/apps/notes). One row per note, private to the signed-in user.
create table if not exists public.notes (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  title      text        not null default '',
  body       text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.notes enable row level security;

create policy "Users manage their own notes"
  on public.notes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notes to authenticated;
