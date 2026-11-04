-- Land Search: governments and institutions you track, not just saved sites.
-- interest:   '' (not reviewed) | yes | maybe | no — only "yes" is in the pipeline
-- map_url:    link to that government's own map / GIS data
-- parcels:    parcels of interest [{ description, parcel_id, acres, link, notes }]
-- state_abbr: which state the record belongs to (for lists per state)
alter table public.land_sites add column if not exists interest   text  not null default '';
alter table public.land_sites add column if not exists map_url    text  not null default '';
alter table public.land_sites add column if not exists parcels    jsonb not null default '[]';
alter table public.land_sites add column if not exists state_abbr text  not null default '';

-- Everything saved before this change was saved into the pipeline on purpose.
update public.land_sites set interest = 'yes' where interest = '';
