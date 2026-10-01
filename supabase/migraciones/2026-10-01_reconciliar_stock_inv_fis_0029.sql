-- ============================================================================
-- Reconciliación de stock para TODO lo que se ingresó en el inventario físico
-- "INV-FIS-0029" (Mecanizados / Fundición, septiembre 2026).
--
-- Por qué hace falta: antes del 28-sept-2026 el trigger fn_actualizar_stock
-- no reconocía los movimientos tipo 'entrada'/'salida' genéricos (los que usa
-- "Aplicar correcciones" de Inventario Físico y el registro de mecanizado).
-- Esos movimientos quedaron bien guardados en el historial, pero jamás
-- actualizaron la tabla `stock`. Por eso varios productos de ese inventario
-- muestran un stock que no cuadra con lo que Angie contó + los movimientos
-- posteriores.
--
-- Qué hace este script: NO adivina ni calcula deltas a mano. Para cada
-- producto+bodega que aparece en ese inventario físico (es decir, todo lo
-- que Angie realmente contó e ingresó), recalcula desde cero el stock
-- correcto sumando/restando el histórico COMPLETO de movimientos (la tabla
-- `movimientos` nunca se borra, así que es la fuente de verdad) con la misma
-- lógica que ya usa el trigger hoy (ya corregido). Así se corrige TODO lo de
-- esa sesión de inventario en un solo paso, no uno por uno.
--
-- Cómo correrlo: en el panel de Supabase del proyecto → SQL Editor.
--   PASO 1: corre el SELECT de abajo primero y revisa la columna "diferencia"
--           — ahí ves exactamente qué va a cambiar, SIN tocar nada todavía.
--   PASO 2: si los números tienen sentido, corre el UPDATE que sigue después.
-- Alcance: SOLO toca item+bodega que están en inventario_fisico_items de
-- INV-FIS-0029 — no toca ningún otro producto de la empresa.
-- ============================================================================

-- ─── PASO 1: VISTA PREVIA (solo lectura, no cambia nada) ───────────────────
WITH inv AS (
  SELECT id FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0029'
),
pares AS (
  SELECT DISTINCT item_id, bodega_id, item_nombre, bodega_nombre
  FROM public.inventario_fisico_items
  WHERE inventario_id = (SELECT id FROM inv)
),
entradas AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo IN ('entrada_compra', 'devolucion', 'entrada', 'traslado')
    AND bodega_destino_id IS NOT NULL
  GROUP BY item_id, bodega_destino_id
),
salidas AS (
  SELECT item_id, bodega_origen_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo IN ('salida_produccion', 'salida_venta', 'salida', 'traslado')
    AND bodega_origen_id IS NOT NULL
  GROUP BY item_id, bodega_origen_id
),
ajustes AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo = 'ajuste_inventario' AND bodega_destino_id IS NOT NULL
  GROUP BY item_id, bodega_destino_id
)
SELECT
  p.item_nombre,
  p.bodega_nombre,
  COALESCE(s.cantidad_actual, 0) AS stock_actual_en_sistema,
  GREATEST(0, COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) AS stock_correcto_recalculado,
  GREATEST(0, COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) - COALESCE(s.cantidad_actual, 0) AS diferencia
FROM pares p
LEFT JOIN entradas e  ON e.item_id = p.item_id  AND e.bodega_id = p.bodega_id
LEFT JOIN salidas  sa ON sa.item_id = p.item_id AND sa.bodega_id = p.bodega_id
LEFT JOIN ajustes  aj ON aj.item_id = p.item_id AND aj.bodega_id = p.bodega_id
LEFT JOIN public.stock s ON s.item_id = p.item_id AND s.bodega_id = p.bodega_id
ORDER BY ABS(
  GREATEST(0, COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) - COALESCE(s.cantidad_actual, 0)
) DESC;


-- ─── PASO 2: APLICAR (solo después de revisar el PASO 1) ───────────────────
-- Actualiza stock.cantidad_actual al valor recalculado, SOLO donde hay una
-- diferencia real. Devuelve (RETURNING) las filas que tocó, para que quede
-- registro de qué cambió.
WITH inv AS (
  SELECT id FROM public.inventarios_fisicos WHERE numero = 'INV-FIS-0029'
),
pares AS (
  SELECT DISTINCT item_id, bodega_id
  FROM public.inventario_fisico_items
  WHERE inventario_id = (SELECT id FROM inv)
),
entradas AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo IN ('entrada_compra', 'devolucion', 'entrada', 'traslado')
    AND bodega_destino_id IS NOT NULL
  GROUP BY item_id, bodega_destino_id
),
salidas AS (
  SELECT item_id, bodega_origen_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo IN ('salida_produccion', 'salida_venta', 'salida', 'traslado')
    AND bodega_origen_id IS NOT NULL
  GROUP BY item_id, bodega_origen_id
),
ajustes AS (
  SELECT item_id, bodega_destino_id AS bodega_id, SUM(cantidad) AS total
  FROM public.movimientos
  WHERE tipo = 'ajuste_inventario' AND bodega_destino_id IS NOT NULL
  GROUP BY item_id, bodega_destino_id
),
correcto AS (
  SELECT
    p.item_id, p.bodega_id,
    GREATEST(0, COALESCE(e.total, 0) - COALESCE(sa.total, 0) + COALESCE(aj.total, 0)) AS valor
  FROM pares p
  LEFT JOIN entradas e  ON e.item_id = p.item_id  AND e.bodega_id = p.bodega_id
  LEFT JOIN salidas  sa ON sa.item_id = p.item_id AND sa.bodega_id = p.bodega_id
  LEFT JOIN ajustes  aj ON aj.item_id = p.item_id AND aj.bodega_id = p.bodega_id
)
UPDATE public.stock s
SET cantidad_actual = c.valor,
    updated_at = NOW()
FROM correcto c
WHERE s.item_id = c.item_id
  AND s.bodega_id = c.bodega_id
  AND s.cantidad_actual IS DISTINCT FROM c.valor
RETURNING s.item_id, s.bodega_id, c.valor AS nuevo_valor;

-- Nota: si algún producto del inventario NO tiene fila todavía en `stock`
-- (nunca tuvo movimientos), el UPDATE no le afecta — no debería pasar para
-- productos que ya tenían historial, pero si ves que falta alguno en el
-- resultado de arriba, avísame y lo resolvemos aparte.
