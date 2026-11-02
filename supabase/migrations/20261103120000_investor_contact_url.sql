-- Investors app: a contact page or pitch-form link per investor (filled in by
-- "Paste from spreadsheet" when the contact column holds a link, not an email).
alter table public.investor_firms add column if not exists contact_url text not null default '';
