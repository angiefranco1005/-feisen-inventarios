-- Costeo: varias líneas de mano de obra por proceso (2026-11-06, pedido de Angie).
-- Ej. Embombe: "Operario 1" por hora con tiempo medido + "Operario 2" a destajo $ 17.000 por unidad.
-- Cada medición de tiempo dice a qué línea (persona) se le tomó.
--   Línea por hora:  h-h por unidad de SUS mediciones × su tarifa.
--   Línea a destajo: valor fijo por unidad (sus mediciones, si las tiene, solo cuentan para el CIF).
--   CIF del proceso: suma de las h-h por unidad de cada línea (y de mediciones sin línea) × tasa del centro.
-- Las columnas tipo_pago / tarifa_hora / precio_destajo de costeo_procesos quedan en desuso
-- (se copian a la primera línea de cada proceso existente). Re-ejecutable.

create table if not exists public.costeo_proceso_mano_obra (
  id uuid primary key default gen_random_uuid(),
  proceso_id uuid not null references public.costeo_procesos(id) on delete cascade,
  nombre text not null default 'Operario',
  tipo_pago text not null default 'hora' check (tipo_pago in ('hora', 'destajo')),
  tarifa_hora numeric not null default 0,
  precio_destajo numeric not null default 0,
  orden integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists costeo_proceso_mano_obra_proceso_idx on public.costeo_proceso_mano_obra(proceso_id);

alter table public.costeo_proceso_mano_obra enable row level security;
drop policy if exists costeo_acceso_proceso_mano_obra on public.costeo_proceso_mano_obra;
create policy costeo_acceso_proceso_mano_obra on public.costeo_proceso_mano_obra
  for all
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));

alter table public.costeo_tiempos_reales
  add column if not exists mano_obra_id uuid references public.costeo_proceso_mano_obra(id) on delete set null;
create index if not exists costeo_tiempos_reales_mano_obra_idx on public.costeo_tiempos_reales(mano_obra_id);

-- Procesos existentes: su forma de pago pasa a ser la primera línea, y sus mediciones se le asignan.
insert into public.costeo_proceso_mano_obra (proceso_id, nombre, tipo_pago, tarifa_hora, precio_destajo, orden)
select p.id, coalesce(em.puesto, 'Operario'), p.tipo_pago, p.tarifa_hora, p.precio_destajo, 1
from public.costeo_procesos p
left join public.costeo_etapas_maestro em on em.etapa = p.nombre
where not exists (select 1 from public.costeo_proceso_mano_obra l where l.proceso_id = p.id);

update public.costeo_tiempos_reales t
set mano_obra_id = l.id
from public.costeo_proceso_mano_obra l
where t.mano_obra_id is null
  and t.proceso_id = l.proceso_id
  and (select count(*) from public.costeo_proceso_mano_obra x where x.proceso_id = l.proceso_id) = 1;

-- Costo de cada línea de mano de obra.
create or replace view public.costeo_mano_obra_resumen with (security_invoker = true) as
with t as (
  select mano_obra_id, count(*) as mediciones, sum(num_operarios * horas) as horas_hombre, sum(unidades) as unidades
  from public.costeo_tiempos_reales
  where mano_obra_id is not null
  group by mano_obra_id
), b as (
  select l.id as mano_obra_id, l.proceso_id, l.nombre, l.tipo_pago, l.tarifa_hora, l.precio_destajo, l.orden, l.created_at,
         coalesce(t.mediciones, 0) as mediciones,
         coalesce(t.unidades, 0) as unidades_medidas,
         case when coalesce(t.unidades, 0) > 0 then t.horas_hombre / t.unidades else 0 end as horas_hombre_unidad
  from public.costeo_proceso_mano_obra l
  left join t on t.mano_obra_id = l.id
)
select b.*,
       case when b.tipo_pago = 'destajo' then b.precio_destajo else b.horas_hombre_unidad * b.tarifa_hora end as costo
from b;

-- Costo de cada proceso: mismas columnas de antes (en el mismo orden) + 3 nuevas al final.
create or replace view public.costeo_procesos_resumen with (security_invoker = true) as
with periodos_todos as (
  select periodo from public.costeo_cif_conceptos
  union
  select periodo from public.costeo_cif_horas
), periodo_vigente as (
  select periodo from periodos_todos
  order by case when periodo like 'PROM-%' then substring(periodo from 6)::integer * 100
                else split_part(periodo, '-', 1)::integer * 100 + split_part(periodo, '-', 2)::integer end desc
  limit 1
), cif_montos_centro as (
  select periodo, centro_costo, sum(monto) as total_cif
  from public.costeo_cif_conceptos group by periodo, centro_costo
), tasas_centro as (
  select coalesce(h.periodo, c.periodo) as periodo,
         coalesce(h.centro_costo, c.centro_costo) as centro_costo,
         case when coalesce(h.horas_mod_mes, 0) > 0 then coalesce(c.total_cif, 0) / h.horas_mod_mes else 0 end as tasa
  from public.costeo_cif_horas h
  full join cif_montos_centro c on c.periodo = h.periodo and c.centro_costo = h.centro_costo
), mp as (
  select cm.proceso_id, sum(cm.cantidad * coalesce(i.precio_costo, 0)) as total_mp
  from public.costeo_materiales cm
  left join public.items i on i.id = cm.item_id
  where cm.proceso_id is not null
  group by cm.proceso_id
), tiempos_grupo as (
  -- cada línea de mano de obra (o las mediciones sin línea) aporta sus propias h-h por unidad
  select proceso_id, mano_obra_id, count(*) as n, sum(num_operarios * horas) as hh, sum(unidades) as u
  from public.costeo_tiempos_reales
  where proceso_id is not null
  group by proceso_id, mano_obra_id
), tiempos as (
  select proceso_id, sum(n) as mediciones, sum(u) as unidades,
         sum(case when u > 0 then hh / u else 0 end) as horas_hombre_unidad
  from tiempos_grupo group by proceso_id
), mo as (
  select proceso_id,
         sum(costo) as total_mod,
         count(*) as lineas,
         count(*) filter (where tipo_pago = 'hora' and mediciones = 0) as sin_tiempo,
         count(*) filter (where (tipo_pago = 'hora' and tarifa_hora <= 0) or (tipo_pago = 'destajo' and precio_destajo <= 0)) as sin_tarifa
  from public.costeo_mano_obra_resumen group by proceso_id
), base as (
  select p.id as proceso_id, p.ficha_id, p.nombre, p.orden, p.tipo_pago, p.tarifa_hora, p.precio_destajo,
         coalesce(f.centro_costo, p.centro_costo, em.centro_costo, 'Sin centro') as centro_costo_usado,
         coalesce(f.cif_periodo, (select periodo from periodo_vigente)) as periodo_usado,
         coalesce(mp.total_mp, 0) as total_mp,
         coalesce(t.mediciones, 0)::bigint as mediciones,
         coalesce(t.unidades, 0) as unidades_medidas,
         coalesce(t.horas_hombre_unidad, 0) as horas_hombre_unidad,
         coalesce(mo.total_mod, 0) as total_mod,
         coalesce(mo.lineas, 0) as lineas_mano_obra,
         coalesce(mo.sin_tiempo, 0) as lineas_sin_tiempo,
         coalesce(mo.sin_tarifa, 0) as lineas_sin_tarifa
  from public.costeo_procesos p
  join public.costeo_fichas f on f.id = p.ficha_id
  left join public.costeo_etapas_maestro em on em.etapa = p.nombre
  left join mp on mp.proceso_id = p.id
  left join tiempos t on t.proceso_id = p.id
  left join mo on mo.proceso_id = p.id
)
select b.proceso_id, b.ficha_id, b.nombre, b.orden, b.tipo_pago, b.tarifa_hora, b.precio_destajo,
       b.centro_costo_usado, b.periodo_usado, b.total_mp, b.mediciones, b.unidades_medidas, b.horas_hombre_unidad,
       b.total_mod,
       coalesce(tc.tasa, 0) as tasa_cif_hora,
       b.horas_hombre_unidad * coalesce(tc.tasa, 0) as cif,
       b.total_mp + b.total_mod + b.horas_hombre_unidad * coalesce(tc.tasa, 0) as costo_total,
       b.lineas_mano_obra, b.lineas_sin_tiempo, b.lineas_sin_tarifa
from base b
left join tasas_centro tc on tc.periodo = b.periodo_usado and tc.centro_costo = b.centro_costo_usado;

revoke all on public.costeo_mano_obra_resumen from anon;
revoke all on public.costeo_procesos_resumen from anon;
