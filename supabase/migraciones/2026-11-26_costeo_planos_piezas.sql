-- 2026-11-26 · Costeo: planos por pieza (PDF, imágenes, DWG/DXF).
-- Cada ficha de costeo (máquina, conjunto o pieza) puede tener varios planos. El archivo vive en el
-- bucket privado `costeo-planos` (ruta `<ficha_id>/<uuid>-<nombre limpio>`) y se abre con URL firmada.
-- Re-ejecutable.

create table if not exists public.costeo_ficha_planos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.costeo_fichas(id) on delete cascade,
  nombre text not null,
  ruta text not null,
  tipo text,
  tamano bigint,
  subido_por uuid default auth.uid(),
  subido_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists costeo_ficha_planos_ficha_idx on public.costeo_ficha_planos (ficha_id);

alter table public.costeo_ficha_planos enable row level security;
drop policy if exists costeo_acceso_ficha_planos on public.costeo_ficha_planos;
create policy costeo_acceso_ficha_planos on public.costeo_ficha_planos for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
revoke all on public.costeo_ficha_planos from anon;

-- Bucket privado (25 MB por archivo) -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('costeo-planos', 'costeo-planos', false, 26214400)
on conflict (id) do nothing;

drop policy if exists costeo_planos_storage_select on storage.objects;
create policy costeo_planos_storage_select on storage.objects for select
  using (bucket_id = 'costeo-planos' and exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
drop policy if exists costeo_planos_storage_insert on storage.objects;
create policy costeo_planos_storage_insert on storage.objects for insert
  with check (bucket_id = 'costeo-planos' and exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
drop policy if exists costeo_planos_storage_update on storage.objects;
create policy costeo_planos_storage_update on storage.objects for update
  using (bucket_id = 'costeo-planos' and exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
drop policy if exists costeo_planos_storage_delete on storage.objects;
create policy costeo_planos_storage_delete on storage.objects for delete
  using (bucket_id = 'costeo-planos' and exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
