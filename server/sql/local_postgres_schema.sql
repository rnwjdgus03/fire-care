create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  phone text not null default '',
  role text not null check (role in ('worker', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (building_id, name)
);

create table if not exists equipment_type_masters (
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

create table if not exists equipment (
  id text primary key,
  building_id uuid not null references buildings(id) on delete cascade,
  floor_id uuid not null references floors(id) on delete restrict,
  name text not null,
  count integer not null default 1 check (count > 0),
  status text not null default '점검 예정' check (status in ('정상', '점검 예정', '이상')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  equipment_id text not null references equipment(id) on delete restrict,
  inspector_id uuid not null references app_users(id) on delete restrict,
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

create table if not exists inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  file_path text not null unique,
  mime_type text not null,
  original_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists app_users_organization_idx on app_users(organization_id);
create index if not exists buildings_organization_idx on buildings(organization_id);
create index if not exists equipment_building_id_idx on equipment(building_id);
create index if not exists equipment_floor_id_idx on equipment(floor_id);
create index if not exists inspections_building_id_idx on inspections(building_id);
create index if not exists inspections_equipment_id_idx on inspections(equipment_id);
create index if not exists inspections_checked_at_idx on inspections(checked_at desc);
