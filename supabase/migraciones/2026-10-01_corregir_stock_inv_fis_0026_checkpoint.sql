-- ============================================================================
-- CORRECCIÓN del stock de INV-FIS-0026 (piezas mecanizadas) usando el método
-- correcto, anclado en el conteo físico como punto de control.
--
-- Por qué hace falta este script: el UPDATE aplicado en
-- 2026-10-01_reconciliar_stock_inv_fis_0026.sql usaba un método de "replay"
-- de TODO el historial de movimientos (ignorando la fecha del inventario
-- físico como punto de referencia). Eso es conceptualmente incorrecto: un
-- inventario físico es un conteo que SE CONFÍA tal cual se registró — no
-- hay que reconstruirlo sumando movimientos de antes de esa fecha, que
-- pueden tener su propio desfase por otras causas. Esto dejó la mayoría de
-- las piezas "-MECANIZADO" con un stock equivocado (la mayoría demasiado
-- bajo, algunas demasiado altas).
--
-- Fórmula correcta (ya validada en modo solo-lectura en
-- 2026-10-01_verificar_stock_desde_inventario_fisico.sql):
--   stock_correcto = cantidad_fisica (lo contado en INV-FIS-0026)
--                   + entradas DESDE la fecha de ese inventario
--                   − salidas   DESDE la fecha de ese inventario
--                   + ajustes   DESDE la fecha de ese inventario
-- excluyendo de esas sumas el propio movimiento de ajuste que generó este
-- mismo inventario (se identifica por referencia = 'INV-FIS-0026'), para no
-- contarlo dos veces (ya está incluido en cantidad_fisica).
--
-- Corre esto en el SQL Editor de Supabase. Es un solo UPDATE con RETURNING
-- — corrige de una vez los 64 productos que quedaron mal, sin tener que
-- rehacer movimientos a mano.
-- ============================================================================

WITH inv AS (
  SELECT id, numero, fecha FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0026'
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
