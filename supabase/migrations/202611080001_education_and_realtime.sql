-- Extension for education content and operational exports.
-- Existing inventory tables and RLS remain the source of truth.

create table if not exists public.education_contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text,
  body text not null,
  target_audience text not null default 'public',
  related_species text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.education_contents enable row level security;

drop policy if exists "education_read_published" on public.education_contents;
create policy "education_read_published"
on public.education_contents for select
to anon, authenticated
using (status = 'published' or public.is_staff());

drop policy if exists "education_staff_insert" on public.education_contents;
create policy "education_staff_insert"
on public.education_contents for insert
to authenticated with check (public.is_staff());

drop policy if exists "education_staff_update" on public.education_contents;
create policy "education_staff_update"
on public.education_contents for update
to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "education_staff_delete" on public.education_contents;
create policy "education_staff_delete"
on public.education_contents for delete
to authenticated using (public.is_staff());

drop trigger if exists education_contents_set_updated_at on public.education_contents;
create trigger education_contents_set_updated_at
before update on public.education_contents
for each row execute function public.set_updated_at();

grant select on public.education_contents to anon, authenticated;
grant insert, update, delete on public.education_contents to authenticated;

-- Realtime supports dynamic inventory refresh on clients.
alter publication supabase_realtime add table public.trees;
alter publication supabase_realtime add table public.tree_photos;
alter publication supabase_realtime add table public.tree_maintenance;
alter publication supabase_realtime add table public.education_contents;
