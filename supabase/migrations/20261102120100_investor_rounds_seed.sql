-- Investors app: start every existing account with the current round (Pre-seed,
-- raising now) and the next one (Seed, planned). Fixed ids, so running this
-- again (or on top of rounds made in the app) never duplicates them.
insert into public.investor_rounds (user_id, id, name, status, opened_on, notes)
select u.id, 'pre-seed', 'Pre-seed', 'active', current_date, ''
from auth.users u
on conflict (user_id, id) do nothing;

insert into public.investor_rounds (user_id, id, name, status, notes)
select u.id, 'seed', 'Seed', 'planned', 'Next round. Investors who pass on Pre-seed with “keep in mind” show up here to carry over.'
from auth.users u
on conflict (user_id, id) do nothing;
