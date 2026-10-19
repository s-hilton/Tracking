-- LOIs app: use cases tagged directly on a company (Autonomous Deep Spaceflight
-- Software and Asteroid Capture Spacecraft), stored as { product: [use-case keys] }.
alter table public.bd_companies add column if not exists use_cases jsonb;
