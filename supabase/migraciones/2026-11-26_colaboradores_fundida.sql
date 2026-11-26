-- ============================================================
-- Lista de colaboradores internos para el personal de la fundida
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- En Registrar fundida el Jefe de Fundición elige de un menú quién fue hornero, vaceador,
-- auxiliar, quién pisó, arregló/ladrilló y picó; si no está, lo escribe como externo (gente
-- contratada por el día). La tabla empleados solo la leen ADMIN y RRHH (tiene salario, documento,
-- cuentas), así que esta función expone SOLO nombre completo y área de los colaboradores activos.
-- Mismo patrón que moldeadores_fundicion (2026-11-24). No cambia ninguna política de empleados.

CREATE OR REPLACE FUNCTION public.colaboradores_fundida()
RETURNS TABLE (nombre text, area text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trim(regexp_replace(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, ''), '\s+', ' ', 'g')) AS nombre,
         e.centro_costo AS area
  FROM public.empleados e
  WHERE e.estado = 'activo'
    AND public.get_my_rol() IN ('ADMIN', 'RRHH', 'JEFE_FUNDICION')
  ORDER BY (e.centro_costo = 'fundicionHierro') DESC, e.nombres, e.apellidos
$$;

REVOKE ALL ON FUNCTION public.colaboradores_fundida() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.colaboradores_fundida() TO authenticated;

-- Prueba (como ADMIN devuelve la lista; con otro rol devuelve 0 filas):
-- SELECT * FROM public.colaboradores_fundida();
