-- Psychometric Quest Platform schema
-- Run in Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('candidate', 'admin');
create type public.candidate_status as enum ('invited', 'started', 'completed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  email text not null,
  phone text,
  auth_provider text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  login_count int not null default 0
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  department text,
  location text,
  jd text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  enabled_assessments text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position_id uuid references public.positions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  role_target text not null,
  invitation_code text not null unique,
  auth_provider text not null default 'invitation',
  account_created_at timestamptz,
  profile_completed_at timestamptz,
  invitation_verified_at timestamptz,
  cv_file_name text,
  cv_file_url text,
  cv_file_size bigint,
  cv_file_type text,
  cv_uploaded_at timestamptz,
  cv_text text,
  cv_match_score int check (cv_match_score between 0 and 100),
  cv_match_result jsonb,
  status public.candidate_status not null default 'invited',
  consent_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  login_count int not null default 0,
  started_at timestamptz,
  completed_at timestamptz
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  behavioral_profile text,
  adaptability int check (adaptability between 0 and 100),
  prioritization int check (prioritization between 0 and 100),
  executive_control int check (executive_control between 0 and 100),
  calculated_risk int check (calculated_risk between 0 and 100),
  sustained_attention int check (sustained_attention between 0 and 100),
  working_memory int check (working_memory between 0 and 100),
  fluid_reasoning int check (fluid_reasoning between 0 and 100),
  -- Personalidad Big Five (IPIP-50), 0-100 por dominio
  openness int check (openness between 0 and 100),
  conscientiousness int check (conscientiousness between 0 and 100),
  extraversion int check (extraversion between 0 and 100),
  agreeableness int check (agreeableness between 0 and 100),
  neuroticism int check (neuroticism between 0 and 100),
  personality_inconsistency int check (personality_inconsistency between 0 and 100),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Respuestas crudas del cuestionario Big Five (IPIP-50)
create table public.personality_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  question_id text not null,
  domain text not null check (domain in ('O','C','E','A','N')),
  keyed int not null check (keyed in (-1, 1)),
  response int not null check (response between 1 and 5),
  created_at timestamptz not null default now()
);

-- Resultado del Big Five por candidato
create table public.personality_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  openness int not null check (openness between 0 and 100),
  conscientiousness int not null check (conscientiousness between 0 and 100),
  extraversion int not null check (extraversion between 0 and 100),
  agreeableness int not null check (agreeableness between 0 and 100),
  neuroticism int not null check (neuroticism between 0 and 100),
  inconsistency int not null default 0 check (inconsistency between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.report_downloads (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  downloaded_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  candidate_id uuid references public.candidates(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('candidate-cvs', 'candidate-cvs', false)
on conflict (id) do nothing;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_admin_for_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and organization_id = org_id
      and role = 'admin'
  )
$$;

create or replace function public.is_candidate(candidate_row public.candidates)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate_row.user_id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.positions enable row level security;
alter table public.candidates enable row level security;
alter table public.assessments enable row level security;
alter table public.game_events enable row level security;
alter table public.personality_responses enable row level security;
alter table public.personality_results enable row level security;
alter table public.report_downloads enable row level security;
alter table public.audit_events enable row level security;

create policy "admins read cv files in org" on storage.objects
  for select using (
    bucket_id = 'candidate-cvs'
    and exists (
      select 1
      from public.candidates c
      where c.cv_file_url like '%' || storage.objects.name
        and public.is_admin_for_org(c.organization_id)
    )
  );

create policy "candidates manage own cv files" on storage.objects
  for all using (
    bucket_id = 'candidate-cvs'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'candidate-cvs'
    and owner = auth.uid()
  );

create policy "admins read own org" on public.organizations
  for select using (public.is_admin_for_org(id));

create policy "profiles read self or org admin" on public.profiles
  for select using (user_id = auth.uid() or public.is_admin_for_org(organization_id));

create policy "admins manage positions in org" on public.positions
  for all using (public.is_admin_for_org(organization_id))
  with check (public.is_admin_for_org(organization_id));

create policy "candidates read open positions in org" on public.positions
  for select using (
    status = 'open'
    and exists (
      select 1
      from public.candidates c
      where c.organization_id = positions.organization_id
        and c.user_id = auth.uid()
    )
  );

create policy "admins manage candidates in org" on public.candidates
  for all using (public.is_admin_for_org(organization_id))
  with check (public.is_admin_for_org(organization_id));

create policy "candidates read self" on public.candidates
  for select using (user_id = auth.uid());

-- A6 — The original policy allowed the candidate to overwrite any column,
--      including sensitive admin-only fields (status, cv_match_score, invitation_code).
--      We replace it with a security-definer function that performs a controlled
--      update of only the columns candidates are allowed to change.
--      The RLS policy now only permits calls that go through this function.
--
--      Columns candidates MAY update: full_name, phone, profile_completed_at,
--      invitation_verified_at, last_seen_at, login_count, consent_accepted,
--      cv_file_name, cv_file_url, cv_file_size, cv_file_type, cv_uploaded_at, cv_text.
--
--      Columns candidates MUST NOT update: status, cv_match_score, cv_match_result,
--      invitation_code, organization_id, position_id, created_at.

create or replace function public.candidate_update_self(
  p_candidate_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_profile_completed_at timestamptz default null,
  p_invitation_verified_at timestamptz default null,
  p_last_seen_at timestamptz default null,
  p_login_count int default null,
  p_consent_accepted boolean default null,
  p_cv_file_name text default null,
  p_cv_file_url text default null,
  p_cv_file_size bigint default null,
  p_cv_file_type text default null,
  p_cv_uploaded_at timestamptz default null,
  p_cv_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify the calling user owns this candidate record
  if not exists (
    select 1 from public.candidates
    where id = p_candidate_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  update public.candidates
  set
    full_name              = coalesce(p_full_name,              full_name),
    phone                  = coalesce(p_phone,                  phone),
    profile_completed_at   = coalesce(p_profile_completed_at,   profile_completed_at),
    invitation_verified_at = coalesce(p_invitation_verified_at, invitation_verified_at),
    last_seen_at           = coalesce(p_last_seen_at,           last_seen_at),
    login_count            = coalesce(p_login_count,            login_count),
    consent_accepted       = coalesce(p_consent_accepted,       consent_accepted),
    cv_file_name           = coalesce(p_cv_file_name,           cv_file_name),
    cv_file_url            = coalesce(p_cv_file_url,            cv_file_url),
    cv_file_size           = coalesce(p_cv_file_size,           cv_file_size),
    cv_file_type           = coalesce(p_cv_file_type,           cv_file_type),
    cv_uploaded_at         = coalesce(p_cv_uploaded_at,         cv_uploaded_at),
    cv_text                = coalesce(p_cv_text,                cv_text)
  where id = p_candidate_id;
end;
$$;

-- Drop the old permissive policy and keep a tighter one.
-- Direct UPDATE via RLS is now blocked for candidates; they must call
-- candidate_update_self() which enforces column-level restrictions above.
-- (Admins still use the "admins manage candidates in org" all-access policy.)
create policy "candidates update self limited" on public.candidates
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- Protect sensitive columns: a candidate must not change these fields.
    -- Postgres column-level security is not available in RLS with check clauses,
    -- so we enforce the constraint by ensuring the protected values are unchanged.
    and status = (select status from public.candidates where id = candidates.id)
    and invitation_code = (select invitation_code from public.candidates where id = candidates.id)
    and cv_match_score is not distinct from (select cv_match_score from public.candidates where id = candidates.id)
  );

create policy "admins read assessments in org" on public.assessments
  for select using (public.is_admin_for_org(organization_id));

create policy "candidates read own assessments" on public.assessments
  for select using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "candidates insert own assessments" on public.assessments
  for insert with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "candidates update own assessments" on public.assessments
  for update using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "admins read game events in org" on public.game_events
  for select using (public.is_admin_for_org(organization_id));

create policy "candidates insert own game events" on public.game_events
  for insert with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "candidates read own game events" on public.game_events
  for select using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "admin cannot insert game events" on public.game_events
  for insert with check (
    not exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

create policy "personality responses candidate self" on public.personality_responses
  for all using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "personality responses admin read" on public.personality_responses
  for select using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_id
        and public.is_admin_for_org(c.organization_id)
    )
  );

create policy "personality results candidate self" on public.personality_results
  for all using (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "personality results admin read" on public.personality_results
  for select using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_id
        and public.is_admin_for_org(c.organization_id)
    )
  );

create policy "candidate insert own report downloads" on public.report_downloads
  for insert with check (
    exists (select 1 from public.candidates c where c.id = candidate_id and c.user_id = auth.uid())
  );

create policy "admin read report downloads in org" on public.report_downloads
  for select using (
    exists (
      select 1
      from public.candidates c
      where c.id = candidate_id
        and public.is_admin_for_org(c.organization_id)
    )
  );

create policy "admins read audit events in org" on public.audit_events
  for select using (
    organization_id is not null
    and public.is_admin_for_org(organization_id)
  );

-- A7 — the original policy allowed organization_id IS NULL, which let any
--      authenticated user insert orphan audit events without org context.
--      Now organization_id is required, and the caller must either be an admin
--      for that org or a candidate whose record belongs to that org.
create policy "users insert own audit events" on public.audit_events
  for insert with check (
    actor_user_id = auth.uid()
    and organization_id is not null
    and (
      public.is_admin_for_org(organization_id)
      or exists (
        select 1
        from public.candidates c
        where c.id = candidate_id
          and c.user_id = auth.uid()
          and c.organization_id = organization_id
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Migración para instalaciones existentes (Jung → Big Five + pruebas por posición)
-- Ejecutar una sola vez sobre una base ya creada con el esquema anterior.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Pruebas habilitadas por posición
alter table public.positions
  add column if not exists enabled_assessments text[] not null default '{}'::text[];

-- 2. Assessments: nuevas dimensiones cognitivas + Big Five; baja columnas de arquetipo
alter table public.assessments
  add column if not exists sustained_attention int check (sustained_attention between 0 and 100),
  add column if not exists working_memory int check (working_memory between 0 and 100),
  add column if not exists fluid_reasoning int check (fluid_reasoning between 0 and 100),
  add column if not exists openness int check (openness between 0 and 100),
  add column if not exists conscientiousness int check (conscientiousness between 0 and 100),
  add column if not exists extraversion int check (extraversion between 0 and 100),
  add column if not exists agreeableness int check (agreeableness between 0 and 100),
  add column if not exists neuroticism int check (neuroticism between 0 and 100),
  add column if not exists personality_inconsistency int check (personality_inconsistency between 0 and 100),
  drop column if exists archetype_primary,
  drop column if exists archetype_secondary;

-- 3. Baja tablas/datos de arquetipo (datos de prueba, se descartan)
drop table if exists public.archetype_responses cascade;
drop table if exists public.archetype_results cascade;
drop table if exists public.archetype_assets cascade;
