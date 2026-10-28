-- LOIs app: the LOI we're building towards with each company
-- (customer, partnership or both). Empty until chosen.
alter table public.bd_companies
  add column if not exists loi_goal text not null default '';  -- customer | partnership | both
