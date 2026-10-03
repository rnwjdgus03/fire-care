create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('worker', 'admin')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (building_id, name)
);

create table public.equipment_type_masters (
  requested_type text primary key,
  key text not null unique,
  official_type text not null,
  detection_hints jsonb not null default '[]'::jsonb,
  classification_notice text,
  assistance_notice text,
  legal_basis jsonb not null,
  checklist_items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  verified_at date not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(detection_hints) = 'array'),
  check (jsonb_typeof(checklist_items) = 'array'),
  check (jsonb_typeof(legal_basis) = 'object')
);

create table public.equipment (
  id text primary key,
  building_id uuid not null references public.buildings(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete restrict,
  name text not null,
  count integer not null default 1 check (count > 0),
  status text not null default '점검 예정' check (status in ('정상', '점검 예정', '이상')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  equipment_id text not null references public.equipment(id) on delete restrict,
  inspector_id uuid not null references public.app_users(id) on delete restrict,
  inspector_name text not null,
  checked_at timestamptz not null,
  checklist jsonb not null default '{}'::jsonb,
  checklist_details jsonb not null default '[]'::jsonb,
  measurements jsonb not null default '[]'::jsonb,
  legal_basis text,
  ai_equipment_match boolean,
  ai_summary text,
  ai_photo_quality jsonb,
  ai_thresholds jsonb,
  ai_validation jsonb,
  assistance_notice text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  original_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index buildings_organization_idx on public.buildings(organization_id);
create index equipment_building_id_idx on public.equipment(building_id);
create index equipment_floor_id_idx on public.equipment(floor_id);
create index inspections_building_id_idx on public.inspections(building_id);
create index inspections_equipment_id_idx on public.inspections(equipment_id);
create index inspections_checked_at_idx on public.inspections(checked_at desc);

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization_id and user_id = (select auth.uid()));
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members where organization_id = target_organization_id and user_id = (select auth.uid()) and role = 'admin');
$$;

alter table public.organizations enable row level security;
alter table public.app_users enable row level security;
alter table public.organization_members enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.equipment_type_masters enable row level security;
alter table public.equipment enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_photos enable row level security;

revoke all on public.organizations, public.app_users, public.organization_members, public.buildings, public.floors, public.equipment_type_masters, public.equipment, public.inspections, public.inspection_photos from anon, authenticated;
grant select on public.organizations, public.app_users, public.organization_members, public.buildings, public.floors, public.equipment_type_masters, public.equipment, public.inspections, public.inspection_photos to authenticated;
grant insert on public.inspections, public.inspection_photos to authenticated;
grant insert, update, delete on public.buildings, public.floors, public.equipment to authenticated;
grant all on public.organizations, public.app_users, public.organization_members, public.buildings, public.floors, public.equipment_type_masters, public.equipment, public.inspections, public.inspection_photos to service_role;

create policy organizations_select on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy app_users_select on public.app_users for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.organization_members mine join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = app_users.id
  )
);
create policy organization_members_select on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy buildings_select on public.buildings for select to authenticated using (public.is_organization_member(organization_id));
create policy buildings_admin_insert on public.buildings for insert to authenticated with check (public.is_organization_admin(organization_id));
create policy buildings_admin_update on public.buildings for update to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy buildings_admin_delete on public.buildings for delete to authenticated using (public.is_organization_admin(organization_id));
create policy floors_select on public.floors for select to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_member(b.organization_id)));
create policy floors_admin_insert on public.floors for insert to authenticated with check (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy floors_admin_update on public.floors for update to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id))) with check (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy floors_admin_delete on public.floors for delete to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy equipment_type_masters_select on public.equipment_type_masters for select to authenticated using (active);
create policy equipment_select on public.equipment for select to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_member(b.organization_id)));
create policy equipment_admin_insert on public.equipment for insert to authenticated with check (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy equipment_admin_update on public.equipment for update to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id))) with check (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy equipment_admin_delete on public.equipment for delete to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_admin(b.organization_id)));
create policy inspections_select on public.inspections for select to authenticated using (exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_member(b.organization_id)));
create policy inspections_insert on public.inspections for insert to authenticated with check (inspector_id = (select auth.uid()) and exists (select 1 from public.buildings b where b.id = building_id and public.is_organization_member(b.organization_id)));
create policy inspection_photos_select on public.inspection_photos for select to authenticated using (exists (select 1 from public.inspections i join public.buildings b on b.id = i.building_id where i.id = inspection_id and public.is_organization_member(b.organization_id)));
create policy inspection_photos_insert on public.inspection_photos for insert to authenticated with check (exists (select 1 from public.inspections i join public.buildings b on b.id = i.building_id where i.id = inspection_id and i.inspector_id = (select auth.uid()) and public.is_organization_member(b.organization_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy inspection_storage_select on storage.objects for select to authenticated
using (bucket_id = 'inspection-photos' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
create policy inspection_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'inspection-photos' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
