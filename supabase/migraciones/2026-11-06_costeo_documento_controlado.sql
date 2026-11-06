-- Costeo: PDF de la ficha como documento controlado (ISO 9001 y certificación de producto).
-- Cada ficha guarda su código de documento, referencia del producto y quién revisa/aprueba;
-- cada emisión de una versión queda en costeo_fichas_versiones (control de cambios del PDF).
-- Re-ejecutable.

alter table public.costeo_fichas
  add column if not exists doc_codigo text,
  add column if not exists referencia text,
  add column if not exists doc_reviso text,
  add column if not exists doc_aprobo text;

create table if not exists public.costeo_fichas_versiones (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.costeo_fichas(id) on delete cascade,
  version integer not null,
  fecha date not null default current_date,
  descripcion text not null,
  costo_total numeric,
  elaboro text,
  reviso text,
  aprobo text,
  created_at timestamptz not null default now(),
  unique (ficha_id, version)
);

alter table public.costeo_fichas_versiones enable row level security;
drop policy if exists costeo_acceso_fichas_versiones on public.costeo_fichas_versiones;
create policy costeo_acceso_fichas_versiones on public.costeo_fichas_versiones
  for all
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
