-- Rolodex map view: where each card's "Lives in" place is, so the map
-- doesn't have to look it up again on every device.
alter table public.rolodex_contacts
  add column if not exists lat     double precision,
  add column if not exists lng     double precision,
  add column if not exists geo_for text not null default '';  -- the "Lives in" text these coordinates are for
