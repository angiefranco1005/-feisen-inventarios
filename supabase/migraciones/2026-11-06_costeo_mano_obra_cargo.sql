-- Costeo: cada persona de mano de obra de un proceso puede venir de un cargo del organigrama
-- (tabla cargos de RRHH). Se guarda el enlace y el nombre del cargo en ese momento. Si el cargo se
-- borra del organigrama, la línea queda con su nombre (on delete set null). Re-ejecutable.

alter table public.costeo_proceso_mano_obra
  add column if not exists cargo_id uuid references public.cargos(id) on delete set null;
create index if not exists costeo_proceso_mano_obra_cargo_idx on public.costeo_proceso_mano_obra(cargo_id);

-- Misma vista de antes, con cargo_id al final (no cambia el orden de las columnas existentes).
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
         case when coalesce(t.unidades, 0) > 0 then t.horas_hombre / t.unidades else 0 end as horas_hombre_unidad,
         l.cargo_id
  from public.costeo_proceso_mano_obra l
  left join t on t.mano_obra_id = l.id
)
select b.mano_obra_id, b.proceso_id, b.nombre, b.tipo_pago, b.tarifa_hora, b.precio_destajo, b.orden, b.created_at,
       b.mediciones, b.unidades_medidas, b.horas_hombre_unidad,
       case when b.tipo_pago = 'destajo' then b.precio_destajo else b.horas_hombre_unidad * b.tarifa_hora end as costo,
       b.cargo_id
from b;

revoke all on public.costeo_mano_obra_resumen from anon;
