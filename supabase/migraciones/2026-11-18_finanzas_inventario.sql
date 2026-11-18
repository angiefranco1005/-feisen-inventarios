-- El inventario valorizado del ERP, agrupado por bodega y categoría, para el grupo 14
-- del balance general de Finanzas › EEFF (18/11/2026).
--
-- `security invoker` a propósito: las políticas de RLS de stock, items, bodegas y
-- categorías siguen aplicando igual que si se consultaran directo. Esta función no
-- abre nada que el usuario no pudiera leer ya.
--
-- Ojo con lo que NO hace: el saldo es el de HOY (la tabla `stock` solo guarda
-- `cantidad_actual`, no tiene historia), así que no sirve para cortar a fin de mes.
-- Por eso el balance deja casillas para escribir el valor del corte a mano.
--
-- `sin_costo` cuenta los artículos que tienen existencias pero no tienen precio de
-- costo cargado: entran al valor como cero. Sin ese dato, una categoría puede mostrar
-- una cifra que parece completa y está a medias.
create or replace function public.finanzas_inventario()
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
  select
    b.nombre::text,
    coalesce(c.nombre, '(sin categoría)')::text,
    count(*)::integer,
    count(*) filter (where coalesce(i.precio_costo, 0) = 0)::integer,
    coalesce(sum(s.cantidad_actual * coalesce(i.precio_costo, 0)), 0)::numeric
  from stock s
  join items i on i.id = s.item_id and i.activo
  join bodegas b on b.id = s.bodega_id
  left join categorias c on c.id = i.categoria_id
  where s.cantidad_actual > 0
  group by b.nombre, c.nombre
$$;

comment on function public.finanzas_inventario() is
  'Inventario valorizado de hoy por bodega y categoría, para el grupo 14 del balance de EEFF. sin_costo = artículos con existencias y sin precio de costo.';

grant execute on function public.finanzas_inventario() to authenticated;
