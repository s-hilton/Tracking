-- LOIs app: contacts with several contact methods and a dated employment history,
-- plus lead scoring and the qualification checklist on opportunities.

alter table public.bd_contacts
  add column if not exists methods      jsonb,  -- [{ type, value, label }]
  add column if not exists affiliations jsonb;  -- [{ companyId, title, department, start, end, current }]

-- Existing contacts: turn their single email/phone/LinkedIn and company into the new lists.
update public.bd_contacts
set methods = (
  select coalesce(jsonb_agg(m), '[]'::jsonb) from (
    select jsonb_build_object('type', 'email', 'value', email, 'label', '') as m where email <> ''
    union all select jsonb_build_object('type', 'phone', 'value', phone, 'label', '') where phone <> ''
    union all select jsonb_build_object('type', 'linkedin', 'value', linkedin, 'label', '') where linkedin <> ''
  ) as existing
)
where methods is null;

update public.bd_contacts
set affiliations = jsonb_build_array(jsonb_build_object(
  'companyId', company_id, 'title', title, 'department', department, 'start', '', 'end', '', 'current', true))
where affiliations is null and company_id <> '';

alter table public.bd_opportunities
  add column if not exists scores                jsonb,  -- { commercial, interest, technical, strategic, timeline }: 1–5
  add column if not exists qualification         jsonb,  -- { fact: 'yes' | 'no' }
  add column if not exists blocking_capabilities text not null default '';
