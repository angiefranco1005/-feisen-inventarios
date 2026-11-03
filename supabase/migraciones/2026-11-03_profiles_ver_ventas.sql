-- ============================================================
-- Ventas: ver quién creó cada OF y quién registró fabricación/entregas
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- profiles_select solo dejaba ver el perfil propio (o todo a ADMIN), así que a Leidy y a los
-- asesores les salía "Creado por: —" en las OF de otros. Quien tiene OF con Registra o Todo
-- (of_puede_crear) puede leer los perfiles. Jefes de área y despachos siguen igual.
-- Las políticas SELECT se suman: la de siempre (propio o ADMIN) se mantiene.

DROP POLICY IF EXISTS profiles_select_ventas ON public.profiles;
CREATE POLICY profiles_select_ventas ON public.profiles FOR SELECT
  USING (public.of_puede_crear());
