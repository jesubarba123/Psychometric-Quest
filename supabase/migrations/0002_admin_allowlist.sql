-- E2 — Rol admin server-side. La fuente de verdad del rol es profiles.role,
-- provisionada por esta función security definer contra una allowlist en DB.
-- VITE_ADMIN_EMAILS queda solo como hint de enrutado de UI, sin valor de seguridad.

create table public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

-- RLS sin policies: ningún cliente lee ni escribe la allowlist; solo el dueño
-- vía SQL editor / service role.
alter table public.admin_allowlist enable row level security;

create or replace function public.ensure_admin_org(p_org_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_org uuid;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null or not exists (
    select 1 from public.admin_allowlist where lower(email) = v_email
  ) then
    raise exception 'Not authorized';
  end if;

  select organization_id into v_org
  from public.profiles
  where user_id = auth.uid() and role = 'admin' and organization_id is not null;
  if v_org is not null then
    return v_org;
  end if;

  insert into public.organizations (name)
  values (coalesce(nullif(trim(p_org_name), ''), v_email))
  returning id into v_org;

  insert into public.profiles (user_id, organization_id, role, full_name, email)
  values (
    auth.uid(),
    v_org,
    'admin',
    coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid()), v_email),
    v_email
  )
  on conflict (user_id) do update
    set organization_id = excluded.organization_id, role = 'admin';

  return v_org;
end;
$$;
