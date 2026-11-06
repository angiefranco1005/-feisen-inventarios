-- Costeo por procesos (2026-11-06, acordado con Angie)
-- Máquina → procesos (Corte, Rolado, Soldadura…). Cada proceso tiene su materia prima y su
-- toma de tiempos. La mano de obra sale SOLO del tiempo real medido (horas-hombre por unidad
-- promedio × tarifa del proceso; a destajo, el precio por unidad) y el CIF se reparte por las
-- horas-hombre reales de cada proceso con la tasa de su centro de costo.
-- costeo_mano_obra deja de sumar al costo (estaba vacía al hacer el cambio).
-- Re-ejecutable.

-- 1. Procesos de cada ficha ---------------------------------------------------------------
create table if not exists public.costeo_procesos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.costeo_fichas(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  tipo_pago text not null default 'hora' check (tipo_pago in ('hora', 'destajo')),
  tarifa_hora numeric not null default 0,
  precio_destajo numeric not null default 0,
  centro_costo text,               -- null = el de "Responsables por etapa"
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists costeo_procesos_ficha_idx on public.costeo_procesos(ficha_id);

alter table public.costeo_procesos enable row level security;
drop policy if exists costeo_acceso_procesos on public.costeo_procesos;
create policy costeo_acceso_procesos on public.costeo_procesos
  for all
  using (exists (select 1 from public.profiles
                 where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)))
  with check (exists (select 1 from public.profiles
                      where profiles.id = auth.uid() and (profiles.rol = 'ADMIN' or profiles.acceso_costeo = true)));

-- 2. Materia prima y tiempos cuelgan de un proceso ----------------------------------------
alter table public.costeo_materiales
  add column if not exists proceso_id uuid references public.costeo_procesos(id) on delete cascade;
create index if not exists costeo_materiales_proceso_idx on public.costeo_materiales(proceso_id);

alter table public.costeo_tiempos_reales
  add column if not exists proceso_id uuid references public.costeo_procesos(id) on delete cascade,
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists pausa_min numeric;
create index if not exists costeo_tiempos_reales_proceso_idx on public.costeo_tiempos_reales(proceso_id);

-- 3. Costo de cada proceso (lo que pinta el árbol) ----------------------------------------
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
), tiempos as (
  select proceso_id, count(*) as mediciones,
         sum(num_operarios * horas) as horas_hombre, sum(unidades) as unidades
  from public.costeo_tiempos_reales
  where proceso_id is not null
  group by proceso_id
), base as (
  select p.id as proceso_id, p.ficha_id, p.nombre, p.orden, p.tipo_pago, p.tarifa_hora, p.precio_destajo,
         coalesce(f.centro_costo, p.centro_costo, em.centro_costo, 'Sin centro') as centro_costo_usado,
         coalesce(f.cif_periodo, (select periodo from periodo_vigente)) as periodo_usado,
         coalesce(mp.total_mp, 0) as total_mp,
         coalesce(t.mediciones, 0) as mediciones,
         coalesce(t.unidades, 0) as unidades_medidas,
         case when coalesce(t.unidades, 0) > 0 then t.horas_hombre / t.unidades else 0 end as horas_hombre_unidad
  from public.costeo_procesos p
  join public.costeo_fichas f on f.id = p.ficha_id
  left join public.costeo_etapas_maestro em on em.etapa = p.nombre
  left join mp on mp.proceso_id = p.id
  left join tiempos t on t.proceso_id = p.id
), calc as (
  select b.*,
         case when b.tipo_pago = 'destajo' then b.precio_destajo
              else b.horas_hombre_unidad * b.tarifa_hora end as total_mod,
         coalesce(tc.tasa, 0) as tasa_cif_hora,
         b.horas_hombre_unidad * coalesce(tc.tasa, 0) as cif
  from base b
  left join tasas_centro tc on tc.periodo = b.periodo_usado and tc.centro_costo = b.centro_costo_usado
)
select *, total_mp + total_mod + cif as costo_total
from calc;

-- 4. Costo de la ficha: misma salida de antes, pero MOD y CIF salen de los procesos --------
create or replace view public.costeo_resumen with (security_invoker = true) as
with recursive periodos_todos as (
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
         coalesce(c.total_cif, 0) as total_cif,
         coalesce(h.horas_mod_mes, 0) as horas_mod_mes
  from public.costeo_cif_horas h
  full join cif_montos_centro c on c.periodo = h.periodo and c.centro_costo = h.centro_costo
), cif_totales_periodo as (
  select periodo, sum(total_cif) as total_cif_mensual, sum(horas_mod_mes) as horas_mod_planta_mes
  from tasas_centro group by periodo
), mp as (
  -- toda la materia prima de la ficha (con o sin proceso)
  select cm.ficha_id, sum(cm.cantidad * coalesce(i.precio_costo, 0)) as total_mp
  from public.costeo_materiales cm
  left join public.items i on i.id = cm.item_id
  group by cm.ficha_id
), procesos as (
  select ficha_id, sum(total_mod) as total_mod, sum(horas_hombre_unidad) as horas_mod_maquina, sum(cif) as cif_asignado
  from public.costeo_procesos_resumen group by ficha_id
), equipos_calc as (
  select fe.ficha_id,
         sum(fe.horas * (
           case when coalesce(ep.vida_util_anios, 0) > 0 then coalesce(ep.saldo_pendiente_depreciar, 0) / ep.vida_util_anios else 0 end
           + coalesce(ep.mantenimiento_anual, 0)
           + coalesce(ep.kw_instalados, 0) * coalesce(ep.tarifa_kwh, 0) * coalesce(ep.horas_disponibles_anio, 0)
         ) / nullif(ep.horas_disponibles_anio, 0)) as total_equipos
  from public.costeo_ficha_equipos fe
  left join public.costeo_equipos_planta ep on ep.id = fe.equipo_id
  group by fe.ficha_id
), propio as (
  select f.id as ficha_id,
         coalesce(mp.total_mp, 0) as total_mp,
         coalesce(pr.total_mod, 0) as total_mod,
         coalesce(pr.horas_mod_maquina, 0) as horas_mod_maquina,
         coalesce(f.cif_periodo, (select periodo from periodo_vigente)) as periodo_usado,
         coalesce(pr.cif_asignado, 0) as cif_asignado,
         coalesce(eq.total_equipos, 0) as total_equipos
  from public.costeo_fichas f
  left join mp on mp.ficha_id = f.id
  left join procesos pr on pr.ficha_id = f.id
  left join equipos_calc eq on eq.ficha_id = f.id
), propio_full as (
  select p.*,
         coalesce(ctp.total_cif_mensual, 0) as total_cif_mensual,
         coalesce(ctp.horas_mod_planta_mes, 0) as horas_mod_planta_mes,
         case when coalesce(ctp.horas_mod_planta_mes, 0) > 0 then ctp.total_cif_mensual / ctp.horas_mod_planta_mes else 0 end as tasa_cif_hora,
         p.total_mp + p.total_mod + p.cif_asignado + p.total_equipos as costo_propio
  from propio p
  left join cif_totales_periodo ctp on ctp.periodo = p.periodo_usado
), cierre as (
  select id as ancestro_id, id as descendiente_id, 1::numeric as cantidad from public.costeo_fichas
  union all
  select c.ancestro_id, cp.pieza_id, c.cantidad * cp.cantidad
  from cierre c join public.costeo_ficha_piezas cp on cp.contenedor_id = c.descendiente_id
), costo_con_piezas as (
  select c.ancestro_id, sum(c.cantidad * pf.costo_propio) as costo_total
  from cierre c join propio_full pf on pf.ficha_id = c.descendiente_id
  group by c.ancestro_id
)
select f.id as ficha_id,
       f.nombre,
       f.tipo,
       f.precio_venta_actual,
       f.cif_periodo,
       pr.periodo_usado as cif_periodo_usado,
       pr.total_mp,
       pr.total_mod,
       pr.horas_mod_maquina,
       pr.total_cif_mensual,
       pr.horas_mod_planta_mes,
       pr.tasa_cif_hora,
       pr.cif_asignado,
       pr.costo_propio,
       coalesce(ccp.costo_total, pr.costo_propio) as costo_total,
       coalesce(ccp.costo_total, pr.costo_propio) - pr.costo_propio as costo_piezas_incluidas,
       case when f.precio_venta_actual > 0 then f.precio_venta_actual - coalesce(ccp.costo_total, pr.costo_propio) else 0 end as margen,
       case when f.precio_venta_actual > 0 then (f.precio_venta_actual - coalesce(ccp.costo_total, pr.costo_propio)) / f.precio_venta_actual else 0 end as margen_pct,
       f.centro_costo,
       pr.total_equipos
from public.costeo_fichas f
join propio_full pr on pr.ficha_id = f.id
left join costo_con_piezas ccp on ccp.ancestro_id = f.id;

revoke all on public.costeo_procesos_resumen from anon;
revoke all on public.costeo_resumen from anon;
