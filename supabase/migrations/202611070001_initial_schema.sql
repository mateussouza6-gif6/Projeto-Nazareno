-- Initial schema for Árvores de Nazareno.
-- Apply once in the Supabase SQL editor or through the Supabase CLI.
-- All client-facing tables use RLS. Never expose a service_role key in the app.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  code_prefix text not null unique check (code_prefix ~ '^[A-Z]{3}$'),
  name text not null,
  municipality text not null default 'Nazareno',
  state text not null default 'MG',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete restrict,
  tree_number integer not null check (tree_number > 0),
  code text not null unique,
  common_name text,
  scientific_name text,
  botanical_family text,
  origin text not null default 'unknown' check (origin in ('native', 'exotic', 'unknown')),
  identification_status text not null default 'pending' check (identification_status in ('confirmed', 'pending', 'unconfirmed')),
  estimated_height_m numeric(7,2) check (estimated_height_m is null or estimated_height_m > 0),
  cap_cm numeric(8,2) check (cap_cm is null or cap_cm > 0),
  dap_cm numeric(8,1) generated always as (
    case when cap_cm is not null and cap_cm > 0
      then round(cap_cm / 3.141592653589793::numeric, 1)
      else null
    end
  ) stored,
  general_condition text,
  phytosanitary_status text,
  pests text,
  diseases text,
  pruning_needed boolean,
  wire_conflict boolean,
  sidewalk_conflict boolean,
  latitude numeric(10,7) check (latitude is null or latitude between -90 and 90),
  longitude numeric(10,7) check (longitude is null or longitude between -180 and 180),
  survey_date date,
  responsible text,
  observations text,
  environmental_importance text,
  educational_fact text,
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, tree_number)
);

create table if not exists public.tree_photos (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  photo_type text not null check (photo_type in ('whole_tree', 'trunk', 'crown', 'botanical_detail', 'other')),
  storage_path text not null unique,
  caption text,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tree_maintenance (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  event_type text not null check (event_type in ('inspection', 'pruning', 'pest_control', 'disease_treatment', 'risk_assessment', 'planting', 'removal', 'other')),
  event_date date not null,
  description text not null,
  performed_by text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trees_area_status_idx on public.trees(area_id, publication_status);
create index if not exists trees_scientific_name_idx on public.trees(scientific_name);
create index if not exists trees_common_name_idx on public.trees(common_name);
create index if not exists trees_coordinates_idx on public.trees(latitude, longitude);
create index if not exists tree_photos_tree_order_idx on public.tree_photos(tree_id, display_order);
create index if not exists tree_maintenance_tree_date_idx on public.tree_maintenance(tree_id, event_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trees_set_updated_at on public.trees;
create trigger trees_set_updated_at
before update on public.trees
for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'editor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.trees enable row level security;
alter table public.tree_photos enable row level security;
alter table public.tree_maintenance enable row level security;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "areas_read_active" on public.areas;
create policy "areas_read_active"
on public.areas for select
to anon, authenticated
using (is_active or public.is_staff());

drop policy if exists "areas_staff_manage" on public.areas;
create policy "areas_staff_manage"
on public.areas for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "trees_read_published_or_staff" on public.trees;
create policy "trees_read_published_or_staff"
on public.trees for select
to anon, authenticated
using (publication_status = 'published' or public.is_staff());

drop policy if exists "trees_staff_insert" on public.trees;
create policy "trees_staff_insert"
on public.trees for insert
to authenticated
with check (public.is_staff());

drop policy if exists "trees_staff_update" on public.trees;
create policy "trees_staff_update"
on public.trees for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "trees_staff_delete" on public.trees;
create policy "trees_staff_delete"
on public.trees for delete
to authenticated
using (public.is_staff());

drop policy if exists "tree_photos_read_published_or_staff" on public.tree_photos;
create policy "tree_photos_read_published_or_staff"
on public.tree_photos for select
to anon, authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.trees t
    where t.id = tree_photos.tree_id and t.publication_status = 'published'
  )
);

drop policy if exists "tree_photos_staff_insert" on public.tree_photos;
create policy "tree_photos_staff_insert"
on public.tree_photos for insert
to authenticated
with check (public.is_staff());

drop policy if exists "tree_photos_staff_update" on public.tree_photos;
create policy "tree_photos_staff_update"
on public.tree_photos for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "tree_photos_staff_delete" on public.tree_photos;
create policy "tree_photos_staff_delete"
on public.tree_photos for delete
to authenticated
using (public.is_staff());

drop policy if exists "maintenance_read_published_or_staff" on public.tree_maintenance;
create policy "maintenance_read_published_or_staff"
on public.tree_maintenance for select
to anon, authenticated
using (
  public.is_staff()
  or exists (
    select 1 from public.trees t
    where t.id = tree_maintenance.tree_id and t.publication_status = 'published'
  )
);

drop policy if exists "maintenance_staff_insert" on public.tree_maintenance;
create policy "maintenance_staff_insert"
on public.tree_maintenance for insert
to authenticated
with check (public.is_staff());

drop policy if exists "maintenance_staff_update" on public.tree_maintenance;
create policy "maintenance_staff_update"
on public.tree_maintenance for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "maintenance_staff_delete" on public.tree_maintenance;
create policy "maintenance_staff_delete"
on public.tree_maintenance for delete
to authenticated
using (public.is_staff());

grant select on public.areas, public.trees, public.tree_photos, public.tree_maintenance to anon, authenticated;
grant insert, update, delete on public.areas, public.trees, public.tree_photos, public.tree_maintenance to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

-- Create a public-read bucket for published tree photos. Only staff may upload or alter files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tree-photos', 'tree-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "tree_photos_public_read" on storage.objects;
create policy "tree_photos_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'tree-photos');

drop policy if exists "tree_photos_staff_upload" on storage.objects;
create policy "tree_photos_staff_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'tree-photos' and public.is_staff());

drop policy if exists "tree_photos_staff_update" on storage.objects;
create policy "tree_photos_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'tree-photos' and public.is_staff())
with check (bucket_id = 'tree-photos' and public.is_staff());

drop policy if exists "tree_photos_staff_delete" on storage.objects;
create policy "tree_photos_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'tree-photos' and public.is_staff());

-- Create the initial pilot area. This inserts no tree inventory records.
insert into public.areas (code_prefix, name, municipality, state)
values ('PRA', 'Praça Central', 'Nazareno', 'MG')
on conflict (code_prefix) do nothing;
