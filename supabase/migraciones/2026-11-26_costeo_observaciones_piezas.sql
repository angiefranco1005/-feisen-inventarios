-- 2026-11-26 · Costeo: observaciones en las piezas (notas "para tener en cuenta").
-- Una ficha de costeo (máquina, conjunto o pieza) puede tener varias observaciones; se marcan
-- resueltas en vez de borrarse. Re-ejecutable.

create table if not exists public.costeo_ficha_observaciones (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.costeo_fichas(id) on delete cascade,
  texto text not null,
  autor_id uuid default auth.uid(),
  autor_nombre text,
  resuelta boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists costeo_ficha_observaciones_ficha_idx on public.costeo_ficha_observaciones (ficha_id);

alter table public.costeo_ficha_observaciones enable row level security;
drop policy if exists costeo_acceso_ficha_observaciones on public.costeo_ficha_observaciones;
create policy costeo_acceso_ficha_observaciones on public.costeo_ficha_observaciones for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
revoke all on public.costeo_ficha_observaciones from anon;
