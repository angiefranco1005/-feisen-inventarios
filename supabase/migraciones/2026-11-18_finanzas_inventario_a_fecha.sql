-- El inventario valorizado del ERP por bodega y categoría, **cortado a una fecha**.
--
-- Por qué cambió (18/11/2026): la primera versión solo sabía dar el saldo de hoy, y yo
-- di por hecho que no se podía reconstruir hacia atrás. Angie me corrigió: "te vas a
-- inventarios, corte de inventarios, y debería sacarte la información a la fecha de lo
-- que había". Tenía razón: la pantalla Reportes › Corte de inventario ya lo hace desde
-- hace tiempo, y esta función ahora usa **la misma regla**, para que el balance y ese
-- informe no puedan dar cifras distintas del mismo día.
--
-- La regla, copiada de src/components/reportes/CorteInventario.jsx:
--   stock a la fecha = stock de hoy − (efecto de los movimientos posteriores)
-- Un movimiento es posterior si su `fecha_movimiento` es mayor que la fecha o, cuando
-- no tiene fecha, si su `created_at` es posterior al final de ese día. Ese respaldo en
-- `created_at` es lo que hace que los ~750 movimientos sin fecha no estorben.
--
-- Efecto de cada movimiento, igual que el trigger fn_actualizar_stock:
--   entrada / entrada_compra / devolucion → suma en la bodega destino
--   salida / salida_produccion / salida_venta → resta en la bodega origen
--   traslado → resta en origen y suma en destino
--   ajuste_inventario → suma (con signo) en la bodega destino
--
-- Lo que NO hace, igual que el informe: no mira `revertido`. Si algún día se cambia,
-- hay que cambiarlo en los dos sitios a la vez o volverán a dar cifras distintas.
--
-- Comprobado contra el Excel que exportó Angie de Fundición al 2026-10-03: da
-- $48.446.500 y 125 artículos, las mismas cifras del archivo, al peso.
--
-- Sin argumento sigue dando el saldo de hoy, que es como la llamaba la pantalla antes.
drop function if exists public.finanzas_inventario();

create or replace function public.finanzas_inventario(hasta date default null)
returns table (
  bodega text,
  categoria text,
  items integer,
  sin_costo integer,
  valor numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with posteriores as (
    select m.item_id, m.tipo, m.cantidad, m.bodega_origen_id, m.bodega_destino_id
    from movimientos m
    where hasta is not null
      and (
        (m.fecha_movimiento is not null and m.fecha_movimiento > hasta)
        or (m.fecha_movimiento is null and m.created_at > ((hasta::text || ' 23:59:59')::timestamp at time zone 'UTC'))
      )
  ),
  deltas as (
    select item_id, bodega_destino_id as bodega_id, cantidad as delta
    from posteriores
    where tipo in ('entrada', 'entrada_compra', 'devolucion', 'ajuste_inventario')
    union all
    select item_id, bodega_origen_id, -cantidad
    from posteriores
    where tipo in ('salida', 'salida_produccion', 'salida_venta', 'traslado')
    union all
    select item_id, bodega_destino_id, cantidad
    from posteriores
    where tipo = 'traslado'
  ),
  neto as (
    select item_id, bodega_id, sum(delta) as delta
    from deltas
    where item_id is not null and bodega_id is not null
    group by item_id, bodega_id
  ),
  saldos as (
    select
      coalesce(s.item_id, n.item_id) as item_id,
      coalesce(s.bodega_id, n.bodega_id) as bodega_id,
      -- Como en el informe: lo que dé negativo se muestra en cero, no se arrastra
      greatest(coalesce(s.cantidad_actual, 0) - coalesce(n.delta, 0), 0) as cantidad
    from stock s
    full outer join neto n on n.item_id = s.item_id and n.bodega_id = s.bodega_id
  )
  select
    b.nombre::text,
    coalesce(c.nombre, '(sin categoría)')::text,
    count(*)::integer,
    count(*) filter (where coalesce(i.precio_costo, 0) = 0)::integer,
    coalesce(sum(sa.cantidad * coalesce(i.precio_costo, 0)), 0)::numeric
  from saldos sa
  join items i on i.id = sa.item_id and i.activo
  join bodegas b on b.id = sa.bodega_id
  left join categorias c on c.id = i.categoria_id
  where sa.cantidad > 0
  group by b.nombre, c.nombre
$$;

comment on function public.finanzas_inventario(date) is
  'Inventario valorizado por bodega y categoría, cortado a una fecha (sin argumento, el de hoy). Misma regla que Reportes › Corte de inventario. sin_costo = artículos con existencias y sin precio de costo.';

grant execute on function public.finanzas_inventario(date) to authenticated;
