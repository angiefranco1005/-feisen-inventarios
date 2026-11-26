-- Costeo · Paso 2 "Hojas de ruta" rehecho como secuencia de fichas (Angie, 2026-11-26, opción B).
-- Cada operación (costeo_procesos) dice en qué máquina se hace, qué cargo la hace y si es interna o
-- externa (y con qué proveedor). La biblioteca costeo_operaciones guarda las operaciones de siempre
-- con sus datos por defecto, para agregarlas con un toque. Re-ejecutable.

alter table public.costeo_procesos
  add column if not exists equipo_id uuid references public.costeo_equipos_planta(id) on delete set null,
  add column if not exists cargo_id uuid references public.cargos(id) on delete set null,
  add column if not exists cargo_nombre text,
  add column if not exists externo boolean not null default false,
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

comment on column public.costeo_procesos.equipo_id is 'Máquina o puesto donde se hace la operación (costeo_equipos_planta).';
comment on column public.costeo_procesos.cargo_id is 'Cargo del organigrama que hace la operación; cargo_nombre guarda el nombre por si se borra.';
comment on column public.costeo_procesos.externo is 'true = la hace un tercero (proveedor_id), no la planta.';

create index if not exists costeo_procesos_equipo_idx on public.costeo_procesos(equipo_id);
create index if not exists costeo_procesos_cargo_idx on public.costeo_procesos(cargo_id);

create table if not exists public.costeo_operaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  equipo_id uuid references public.costeo_equipos_planta(id) on delete set null,
  cargo_id uuid references public.cargos(id) on delete set null,
  cargo_nombre text,
  externo boolean not null default false,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists costeo_operaciones_nombre_uidx on public.costeo_operaciones (lower(nombre));

alter table public.costeo_operaciones enable row level security;
drop policy if exists costeo_acceso_operaciones on public.costeo_operaciones;
create policy costeo_acceso_operaciones on public.costeo_operaciones for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));
revoke all on public.costeo_operaciones from anon;

-- Biblioteca inicial (supuesta, Angie la corrige): operación → cargo por nombre del organigrama.
insert into public.costeo_operaciones (nombre, cargo_id, cargo_nombre, externo, orden)
select v.nombre, c.id, c.nombre, v.externo, v.orden
from (values
  ('Corte plasma', 'OPERARIO DE PLASMA', false, 10),
  ('Corte cizalla', 'OPERARIO DOBLADORA Y CIZALLA', false, 20),
  ('Doblez', 'OPERARIO DOBLADORA Y CIZALLA', false, 30),
  ('Rolado', 'OPERARIO DE EMBOMBE Y ROLADO', false, 40),
  ('Embombe', 'OPERARIO DE EMBOMBE Y ROLADO', false, 50),
  ('Torneado', 'TORNERO', false, 60),
  ('Mecanizado CNC', 'OPERADOR CENTRO DE MECANIZADO', false, 70),
  ('Taladrado', 'OPERADOR TALADRO Y CEPILLO', false, 80),
  ('Soldadura', 'SOLDADOR', false, 90),
  ('Armado', 'ARMADOR', false, 100),
  ('Pulido', 'PULIDOR', false, 110),
  ('Pintura', 'PINTOR', false, 120),
  ('Galvanizado', null, true, 130)
) as v(nombre, cargo, externo, orden)
left join public.cargos c on c.nombre = v.cargo
where not exists (select 1 from public.costeo_operaciones o where lower(o.nombre) = lower(v.nombre));

-- Mecanizado CNC va en el centro de mecanizado, si existe.
update public.costeo_operaciones o set equipo_id = e.id
from public.costeo_equipos_planta e
where o.nombre = 'Mecanizado CNC' and o.equipo_id is null and e.nombre ilike 'CENTRO DE MECANIZADO%';
