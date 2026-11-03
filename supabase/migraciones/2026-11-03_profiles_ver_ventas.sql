-- ============================================================
-- OF: ver quién creó cada OF y quién registró fabricación/entregas
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- profiles_select solo dejaba ver el perfil propio (o todo a ADMIN), así que salía
-- "Creado por: —" en las OF de otros. Quien tiene acceso a las OF (cualquier nivel: asesores,
-- gerente de ventas, jefes de área, despachos) puede leer los perfiles, para saber a qué
-- asesor preguntarle por un pedido. Las políticas SELECT se suman: la de siempre se mantiene.

DROP POLICY IF EXISTS profiles_select_ventas ON public.profiles;
CREATE POLICY profiles_select_ventas ON public.profiles FOR SELECT
  USING (public.mi_nivel('of') <> 'no');
