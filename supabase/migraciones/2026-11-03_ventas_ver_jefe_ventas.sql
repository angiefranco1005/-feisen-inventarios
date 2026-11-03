-- ============================================================
-- Dashboard de ventas (facturación de Odoo): también la gerente de ventas
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- Antes solo ADMIN. Angie pidió que Leidy (JEFE_VENTAS) lo vea; los asesores no.
-- En la app: veVentasOdoo (AuthContext) muestra la pestaña «Dashboard de ventas».
-- Ojo: la función ventas-odoo también usa esta regla; el botón «Actualizar desde Odoo» sigue
-- saliendo solo a ADMIN en la pantalla.

CREATE OR REPLACE FUNCTION public.ventas_puede_ver()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.get_my_rol() IN ('ADMIN', 'JEFE_VENTAS'), false);
$$;
