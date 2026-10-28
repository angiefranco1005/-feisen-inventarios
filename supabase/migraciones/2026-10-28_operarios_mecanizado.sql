-- ============================================================
-- Lista de operarios para el registro de mecanizado
-- Fecha: 2026-10-28 — re-ejecutable
-- ============================================================
-- La tabla empleados solo la leen ADMIN y RRHH (tiene salario, documento, cuentas).
-- El Jefe de Mecanizados necesita elegir al operario de una lista, así que esta
-- función expone SOLO id, nombres, apellidos y área de los colaboradores activos
-- DEL ÁREA MECANIZADOS (decisión de Angie, 2026-10-28), y solo a ADMIN, RRHH y
-- JEFE_MECANIZADOS. No cambia ninguna política de empleados.

CREATE OR REPLACE FUNCTION public.operarios_mecanizado()
RETURNS TABLE (id uuid, nombres text, apellidos text, area text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.nombres, e.apellidos, e.area
  FROM public.empleados e
  WHERE e.estado = 'activo'
    AND e.area ILIKE 'mecaniz%'
    AND public.get_my_rol() IN ('ADMIN', 'RRHH', 'JEFE_MECANIZADOS')
  ORDER BY e.nombres, e.apellidos
$$;

REVOKE ALL ON FUNCTION public.operarios_mecanizado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operarios_mecanizado() TO authenticated;

-- Prueba (como ADMIN devuelve la lista; con otro rol devuelve 0 filas):
-- SELECT * FROM public.operarios_mecanizado();
