-- LOIs app: tag each LOI as a customer LOI or a partnership LOI.
-- Existing LOIs are left untagged ('') so nothing is guessed; set them from the LOI form.
alter table public.lois
  add column if not exists loi_type text not null default '';  -- customer | partnership
