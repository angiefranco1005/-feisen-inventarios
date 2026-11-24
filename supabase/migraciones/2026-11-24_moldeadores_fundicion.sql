-- ============================================================
-- Lista de moldeadores para la plantilla de planeación de moldeo
-- Fecha: 2026-11-24 — re-ejecutable
-- ============================================================
-- La tabla empleados solo la leen ADMIN y RRHH (tiene salario, documento, cuentas).
-- El Jefe de Fundición necesita elegir el moldeador de una lista en la plantilla de Excel
-- (y más adelante en la app), así que esta función expone SOLO nombres y apellidos de los
-- colaboradores activos de Fundición Hierro cuyo cargo es de moldeo (en RRHH está escrito
-- "MOLDEDADOR"; se busca '%MOLD%' para que también sirva si lo corrigen). Mismo patrón que
-- operarios_mecanizado (2026-10-28). No cambia ninguna política de empleados.

CREATE OR REPLACE FUNCTION public.moldeadores_fundicion()
RETURNS TABLE (nombres text, apellidos text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.nombres, e.apellidos
  FROM public.empleados e
  WHERE e.estado = 'activo'
    AND e.centro_costo = 'fundicionHierro'
    AND e.cargo ILIKE '%MOLD%'
    AND public.get_my_rol() IN ('ADMIN', 'RRHH', 'JEFE_FUNDICION')
  ORDER BY e.nombres, e.apellidos
$$;

REVOKE ALL ON FUNCTION public.moldeadores_fundicion() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.moldeadores_fundicion() TO authenticated;

-- Prueba (como ADMIN devuelve la lista; con otro rol devuelve 0 filas):
-- SELECT * FROM public.moldeadores_fundicion();
