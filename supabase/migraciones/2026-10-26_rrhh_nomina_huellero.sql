-- ============================================================
-- Migración: RRHH — Nómina: huellero, horas dominicales/festivas y
--            piezas de destajo solo manuales
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Decisiones de Angie:
--   • RRHH sube el archivo del huellero de la quincena; la app calcula las
--     horas extra y los días con marcación y los deja como SUGERIDOS en cada
--     liquidación (RRHH verifica si la extra está autorizada y decide si la
--     aplica). Reglas: L–J 7:30 a 5:30 p. m., viernes 7:30 a 4:00 p. m.;
--     llegar temprano y quedarse después cuentan; desde 15 minutos cuenta
--     media hora, redondeado a la media hora; sábado = extra normal;
--     domingo y festivo = extra con recargo del 100 %.
--   • Las piezas de destajo ya NO se sugieren desde producción: las ingresa
--     RRHH a mano (con la tarifa de cada pieza).

-- 1. Horas dominicales/festivas (se pagan al doble del valor hora extra) ---
ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS horas_extra_recargo NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS huellero            JSONB;   -- sugerencia calculada del archivo (no se paga sola)

-- 2. Archivo del huellero de cada quincena (en el bucket privado rrhh) ------
ALTER TABLE public.nomina_periodos
  ADD COLUMN IF NOT EXISTS huellero_path       TEXT,
  ADD COLUMN IF NOT EXISTS huellero_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS huellero_cargado_en TIMESTAMPTZ;

-- 3. nomina_alias pasa a guardar los nombres tal como salen en el huellero
--    (p. ej. "DAGOBERTO NEUT" → su ficha). Misma tabla, sin cambios.

-- 4. Quitar las piezas que se habían sugerido desde producción en quincenas
--    que siguen en borrador, y descontarlas de los totales guardados.
WITH quitadas AS (
  SELECT p.liquidacion_id, SUM(p.cantidad * p.valor_unitario) AS valor
  FROM public.nomina_piezas p
  JOIN public.nomina_liquidaciones l ON l.id = p.liquidacion_id
  JOIN public.nomina_periodos per ON per.id = l.periodo_id
  WHERE p.origen IN ('moldeo', 'mecanizado') AND per.estado = 'borrador'
  GROUP BY p.liquidacion_id
)
UPDATE public.nomina_liquidaciones l
SET total_piezas    = l.total_piezas - q.valor,
    total_devengado = l.total_devengado - q.valor,
    neto            = l.neto - q.valor
FROM quitadas q
WHERE l.id = q.liquidacion_id;

DELETE FROM public.nomina_piezas p
USING public.nomina_liquidaciones l, public.nomina_periodos per
WHERE l.id = p.liquidacion_id AND per.id = l.periodo_id
  AND p.origen IN ('moldeo', 'mecanizado') AND per.estado = 'borrador';
