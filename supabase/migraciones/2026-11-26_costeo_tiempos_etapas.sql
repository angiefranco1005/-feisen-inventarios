-- Costeo · Paso 4 «Tiempos» por etapas con plantilla de Excel (Angie, 2026-11-26).
-- Cada operación (costeo_procesos) se parte en etapas (subir lámina, cortar, bajar…). Cada etapa dice
-- cuántas piezas salen cada vez y guarda sus lecturas de cronómetro en segundos.
-- Al subir la plantilla, el ERP calcula el tiempo por pieza de la operación y lo deja como UNA medición
-- en costeo_tiempos_reales con origen = 'etapas' (se reemplaza en cada subida). Así el costo de mano de
-- obra y el CIF siguen saliendo de las vistas de siempre. Re-ejecutable.

create table if not exists public.costeo_proceso_etapas (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid not null references public.costeo_procesos(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  piezas_por_vez numeric not null default 1 check (piezas_por_vez > 0),
  created_at timestamptz not null default now()
);
create index if not exists costeo_proceso_etapas_proceso_idx on public.costeo_proceso_etapas(proceso_id);

create table if not exists public.costeo_etapa_lecturas (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.costeo_proceso_etapas(id) on delete cascade,
  n integer not null,
  segundos numeric not null check (segundos > 0),
  operario text,
  fecha date,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists costeo_etapa_lecturas_etapa_idx on public.costeo_etapa_lecturas(etapa_id);

alter table public.costeo_tiempos_reales add column if not exists origen text;
comment on column public.costeo_tiempos_reales.origen is 'null = medición manual; ''etapas'' = calculada desde la plantilla de etapas (se reemplaza al volver a subirla).';

alter table public.costeo_proceso_etapas enable row level security;
alter table public.costeo_etapa_lecturas enable row level security;

drop policy if exists costeo_acceso_proceso_etapas on public.costeo_proceso_etapas;
create policy costeo_acceso_proceso_etapas on public.costeo_proceso_etapas for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));

drop policy if exists costeo_acceso_etapa_lecturas on public.costeo_etapa_lecturas;
create policy costeo_acceso_etapa_lecturas on public.costeo_etapa_lecturas for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));

revoke all on public.costeo_proceso_etapas from anon;
revoke all on public.costeo_etapa_lecturas from anon;
