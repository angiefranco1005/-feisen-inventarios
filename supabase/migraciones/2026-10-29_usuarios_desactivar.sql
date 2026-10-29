-- ============================================================
-- Desactivar usuarios + proteger rol/activo del propio perfil
-- Fecha: 2026-10-29 — re-ejecutable
-- ============================================================
-- 1) Un usuario desactivado (profiles.activo = false) queda sin rol: get_my_rol()
--    devuelve NULL y todas las políticas que piden un rol le niegan acceso.
--    La app además cierra su sesión al entrar (AuthContext).
-- 2) La política profiles_update_own deja a cada persona editar su fila (la usa
--    "Mis listas", columna sugerencias), pero no limitaba las columnas: cualquiera
--    podía cambiarse el rol a ADMIN o reactivarse. Este trigger solo deja cambiar
--    rol, activo, acceso_costeo y almacen a un ADMIN activo.

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid() AND activo IS NOT FALSE;
$$;

CREATE OR REPLACE FUNCTION public.proteger_campos_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin usuario de la app (SQL directo, service role): no se restringe
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.rol, NEW.activo, NEW.acceso_costeo, NEW.almacen)
     IS DISTINCT FROM (OLD.rol, OLD.activo, OLD.acceso_costeo, OLD.almacen)
     AND public.get_my_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol, el estado o los permisos de un usuario.';
  END IF;
  -- El administrador no se puede desactivar ni quitar el rol a sí mismo (se quedaría sin acceso)
  IF NEW.id = auth.uid() AND (NEW.activo IS FALSE OR NEW.rol IS DISTINCT FROM OLD.rol) THEN
    RAISE EXCEPTION 'No puedes desactivarte ni cambiarte el rol a ti mismo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_campos_perfil ON public.profiles;
CREATE TRIGGER trg_proteger_campos_perfil
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_perfil();

-- Prueba:
-- SELECT public.get_my_rol();  -- con un usuario desactivado devuelve NULL
