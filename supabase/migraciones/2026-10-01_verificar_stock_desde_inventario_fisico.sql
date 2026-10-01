-- ============================================================================
-- VERIFICACIÓN CORREGIDA de stock a partir de un inventario físico
-- (reemplaza el método de los scripts anteriores — ver nota abajo)
--
-- Corrección de enfoque (gracias a Angie): un inventario físico es un punto
-- de control confiable. Lo que se contó ESE día es la verdad a partir de
-- ahí — no hay que "demostrar" ese número reconstruyendo todo el historial
-- de movimientos desde el principio de los tiempos. Replayar TODO el
-- historial (como hacían los scripts anteriores,
-- 2026-10-01_reconciliar_stock_inv_fis_0029.sql y ...0026.sql) corre el
-- riesgo de pisar el conteo físico con una reconstrucción basada en
-- movimientos de ANTES de la auditoría, que pueden tener su propio drift
-- por otras causas (no solo el bug del trigger).
--
-- Fórmula correcta:
--   stock_correcto = cantidad_fisica (lo que se contó ese día)
--                   + entradas DESDE esa fecha en adelante
--                   − salidas   DESDE esa fecha en adelante
-- excluyendo de esa suma el propio movimiento de ajuste que generó ESE
-- inventario físico (se identifica porque su `referencia` = el número del
-- inventario — ya está representado en cantidad_fisica, sumarlo aparte
-- sería contarlo dos veces).
--
-- Cómo usarlo: cambia 'INV-FIS-0026' por el número de inventario que quieras
-- revisar (ej. 'INV-FIS-0029') y corre el SELECT. Es de SOLO LECTURA — no
-- cambia nada. Revisa la columna "diferencia" antes de decidir si hace
-- falta un UPDATE (te lo paso aparte si los números lo piden).
-- ============================================================================

WITH inv AS (
  SELECT id, numero, fecha FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0026'
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

-- Para revisar INV-FIS-0029 con este mismo método correcto, cambia el
-- 'INV-FIS-0026' del primer WITH (línea de "inv AS") por 'INV-FIS-0029' y
-- vuelve a correr.
