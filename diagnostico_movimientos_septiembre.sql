-- ============================================================================
-- Solo lectura: ¿hay movimientos reales de septiembre 2026, y con qué fecha
-- quedaron guardados? (fecha_movimiento vs. created_at pueden no coincidir
-- si alguien editó la fecha a mano).
-- ============================================================================

SELECT
  to_char(COALESCE(fecha_movimiento, created_at::date), 'YYYY-MM') AS mes,
  COUNT(*) AS num_movimientos,
  MIN(COALESCE(fecha_movimiento, created_at::date)) AS fecha_min,
  MAX(COALESCE(fecha_movimiento, created_at::date)) AS fecha_max
FROM public.movimientos
WHERE COALESCE(fecha_movimiento, created_at::date) >= '2026-07-01'
GROUP BY 1
ORDER BY 1;
