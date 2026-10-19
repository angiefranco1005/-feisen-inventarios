-- Corrección de stock: RUEDA 5' en ALMACEN (19/10/2026)
-- Causa: el 07/09/2026 se registraron 4 salidas seguidas (44+43+129+43 = 259 und)
-- cuando el saldo era 110. El trigger no deja bajar de 0 (GREATEST(0, ...)), así que
-- esas salidas no restaron completo y el stock quedó inflado (257 vs 93 del historial).
-- Decisión de Angie: opción B = recalcular el stock desde el historial de movimientos.
-- Ejecutar en el SQL Editor de Supabase. Solo toca RUEDA 5' / ALMACEN.

WITH x AS (
  SELECT i.id AS item_id, b.id AS bodega_id
  FROM public.items i, public.bodegas b
  WHERE i.nombre = 'RUEDA 5''' AND b.nombre = 'ALMACEN'
),
calc AS (
  SELECT x.item_id, x.bodega_id,
    GREATEST(0,
      COALESCE((SELECT SUM(m.cantidad) FROM public.movimientos m
                WHERE m.item_id = x.item_id AND m.bodega_destino_id = x.bodega_id
                  AND m.tipo IN ('entrada_compra','devolucion','entrada','traslado')), 0)
    - COALESCE((SELECT SUM(m.cantidad) FROM public.movimientos m
                WHERE m.item_id = x.item_id AND m.bodega_origen_id = x.bodega_id
                  AND m.tipo IN ('salida_produccion','salida_venta','salida','traslado')), 0)
    + COALESCE((SELECT SUM(m.cantidad) FROM public.movimientos m
                WHERE m.item_id = x.item_id AND m.bodega_destino_id = x.bodega_id
                  AND m.tipo = 'ajuste_inventario'), 0)
    ) AS valor
  FROM x
)
UPDATE public.stock s
SET cantidad_actual = c.valor, updated_at = NOW()
FROM calc c
WHERE s.item_id = c.item_id AND s.bodega_id = c.bodega_id
  AND s.cantidad_actual IS DISTINCT FROM c.valor
RETURNING s.item_id, s.bodega_id, c.valor AS nuevo_valor;
