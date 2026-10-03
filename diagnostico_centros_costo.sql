-- ============================================================================
-- Solo lectura: qué valores reales tiene centro_costo hoy en movimientos,
-- cuántas filas tiene cada uno, y su valor acumulado en COP (cantidad x
-- precio_costo_snapshot) — para armar el mapeo a tus 3 centros de costo
-- (Construequipos/Maquinaria, Fundición Hierro, Fundición de Aluminio) sin
-- adivinar sobre texto libre.
-- ============================================================================

SELECT
  centro_costo,
  tipo,
  COUNT(*) AS num_movimientos,
  SUM(cantidad * COALESCE(precio_costo_snapshot, 0)) AS valor_total
FROM public.movimientos
GROUP BY centro_costo, tipo
ORDER BY centro_costo, tipo;
