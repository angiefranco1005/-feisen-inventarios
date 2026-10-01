-- ============================================================================
-- APLICAR el stock correcto (método anclado en el conteo físico) para
-- INV-FIS-0029. Mismo patrón ya usado en INV-FIS-0026.
--
-- Según la verificación de solo-lectura, de todos los productos de este
-- inventario SOLO uno tiene diferencia real: POLEA ARRASTRE PLUMA LITEMIX
-- (contado: 25, sistema: 55, correcto: 25). Este UPDATE solo toca ese tipo
-- de casos (WHERE ... IS DISTINCT FROM ...), así que es seguro correrlo
-- sobre todo el inventario: no va a mover nada que ya esté bien.
-- ============================================================================

WITH inv AS (
  SELECT id, numero, fecha FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0029'
),
conteo AS (
  SELECT item_id, bodega_id, cantidad_fisica
  FROM public.inventario_fisico_items
  WHERE inventario_id = (SELECT id FROM inv)
),
entradas_desde AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos, inv
  WHERE tipo IN ('entrada_compra', 'devolucion', 'entrada', 'traslado')
    AND bodega_destino_id IS NOT NULL
    AND fecha_movimiento >= inv.fecha
    AND referencia IS DISTINCT FROM inv.numero
  GROUP BY item_id, bodega_destino_id
),
salidas_desde AS (
  SELECT item_id, bodega_origen_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos, inv
  WHERE tipo IN ('salida_produccion', 'salida_venta', 'salida', 'traslado')
    AND bodega_origen_id IS NOT NULL
    AND fecha_movimiento >= inv.fecha
    AND referencia IS DISTINCT FROM inv.numero
  GROUP BY item_id, bodega_origen_id
),
ajustes_desde AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos, inv
  WHERE tipo = 'ajuste_inventario'
    AND bodega_destino_id IS NOT NULL
    AND fecha_movimiento >= inv.fecha
    AND referencia IS DISTINCT FROM inv.numero
  GROUP BY item_id, bodega_destino_id
),
correcto AS (
  SELECT
    c.item_id, c.bodega_id,
    GREATEST(0, c.cantidad_fisica + COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) AS valor
  FROM conteo c
  LEFT JOIN entradas_desde e  ON e.item_id = c.item_id  AND e.bodega_id = c.bodega_id
  LEFT JOIN salidas_desde  sa ON sa.item_id = c.item_id AND sa.bodega_id = c.bodega_id
  LEFT JOIN ajustes_desde  aj ON aj.item_id = c.item_id AND aj.bodega_id = c.bodega_id
)
UPDATE public.stock s
SET cantidad_actual = c.valor,
    updated_at = NOW()
FROM correcto c
WHERE s.item_id = c.item_id
  AND s.bodega_id = c.bodega_id
  AND s.cantidad_actual IS DISTINCT FROM c.valor
RETURNING s.item_id, s.bodega_id, c.valor AS nuevo_valor;
