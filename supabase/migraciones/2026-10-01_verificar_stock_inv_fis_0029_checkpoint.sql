-- ============================================================================
-- VERIFICACIÓN (solo lectura) de stock para INV-FIS-0029, con el método
-- correcto anclado en el conteo físico (mismo método ya aplicado en
-- INV-FIS-0026). No cambia nada — solo muestra la columna "diferencia".
-- ============================================================================

WITH inv AS (
  SELECT id, numero, fecha FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0029'
),
conteo AS (
  SELECT item_id, bodega_id, item_nombre, bodega_nombre, cantidad_fisica
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
)
SELECT
  c.item_nombre,
  c.bodega_nombre,
  c.cantidad_fisica,
  COALESCE(s.cantidad_actual, 0) AS stock_actual_en_sistema,
  GREATEST(0, c.cantidad_fisica + COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) AS stock_correcto,
  GREATEST(0, c.cantidad_fisica + COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) - COALESCE(s.cantidad_actual, 0) AS diferencia
FROM conteo c
LEFT JOIN entradas_desde e  ON e.item_id = c.item_id  AND e.bodega_id = c.bodega_id
LEFT JOIN salidas_desde  sa ON sa.item_id = c.item_id AND sa.bodega_id = c.bodega_id
LEFT JOIN ajustes_desde  aj ON aj.item_id = c.item_id AND aj.bodega_id = c.bodega_id
LEFT JOIN public.stock s ON s.item_id = c.item_id AND s.bodega_id = c.bodega_id
ORDER BY ABS(
  GREATEST(0, c.cantidad_fisica + COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) - COALESCE(s.cantidad_actual, 0)
) DESC;

-- Si aparecen diferencias reales, avísame y te paso el UPDATE correspondiente
-- (mismo patrón que el de INV-FIS-0026).
