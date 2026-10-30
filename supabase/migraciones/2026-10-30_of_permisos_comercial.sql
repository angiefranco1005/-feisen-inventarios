-- ============================================================
-- OF por la matriz de permisos + rol Asesor comercial
-- Fecha: 2026-10-30 — re-ejecutable
-- ============================================================
-- Primer módulo de la etapa 2: las reglas de las tablas de OF leen rol_permisos en vez del
-- rol fijo. Nivel del módulo 'of':
--   'registra' = crea OF, ve todas y solo edita/cancela/registra entregas en las que él creó
--   'todo'     = edita todas (ADMIN siempre)
-- Registrar fabricación sigue igual (ADMIN o el centro de costo del ítem).

-- Nivel del usuario actual en un módulo (sirve para los próximos módulos de la etapa 2)
CREATE OR REPLACE FUNCTION public.mi_nivel(p_modulo text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.get_my_rol() IS NULL THEN 'no'
    WHEN public.get_my_rol() = 'ADMIN' THEN 'todo'
    ELSE coalesce((SELECT nivel FROM public.rol_permisos
                    WHERE rol = public.get_my_rol() AND modulo = p_modulo), 'no')
  END;
$$;

-- Todas las OF
CREATE OR REPLACE FUNCTION public.of_puede_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mi_nivel('of') = 'todo';
$$;

-- Crear OF, clientes y productos del catálogo
CREATE OR REPLACE FUNCTION public.of_puede_crear()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mi_nivel('of') IN ('registra', 'todo');
$$;

-- Esta OF la puedo editar: tengo 'todo', o tengo 'registra' y yo la creé
CREATE OR REPLACE FUNCTION public.of_puedo_editar_orden(p_orden uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.of_puede_editar()
      OR (public.of_puede_crear() AND EXISTS (
            SELECT 1 FROM public.ordenes_fabricacion o WHERE o.id = p_orden AND o.creado_por = auth.uid()));
$$;

-- ---------- Órdenes ----------
DROP POLICY IF EXISTS of_insert ON public.ordenes_fabricacion;
CREATE POLICY of_insert ON public.ordenes_fabricacion FOR INSERT
  WITH CHECK (public.of_puede_editar() OR (public.of_puede_crear() AND creado_por = auth.uid()));
DROP POLICY IF EXISTS of_update ON public.ordenes_fabricacion;
CREATE POLICY of_update ON public.ordenes_fabricacion FOR UPDATE
  USING (public.of_puedo_editar_orden(id))
  WITH CHECK (public.of_puede_editar() OR (public.of_puede_crear() AND creado_por = auth.uid()));

-- ---------- Productos de cada OF ----------
DROP POLICY IF EXISTS items_of_insert ON public.items_of;
CREATE POLICY items_of_insert ON public.items_of FOR INSERT WITH CHECK (public.of_puedo_editar_orden(orden_id));
DROP POLICY IF EXISTS items_of_update ON public.items_of;
CREATE POLICY items_of_update ON public.items_of FOR UPDATE
  USING (public.of_puedo_editar_orden(orden_id)) WITH CHECK (public.of_puedo_editar_orden(orden_id));
DROP POLICY IF EXISTS items_of_delete ON public.items_of;
CREATE POLICY items_of_delete ON public.items_of FOR DELETE
  USING (public.of_puedo_editar_orden(orden_id) AND producido = 0 AND entregado = 0);

-- ---------- Entregas (y su reversión) ----------
DROP POLICY IF EXISTS of_entregas_insert ON public.of_entregas;
CREATE POLICY of_entregas_insert ON public.of_entregas FOR INSERT
  WITH CHECK (registrado_por = auth.uid() AND EXISTS (
    SELECT 1 FROM public.items_of i WHERE i.id = of_entregas.item_id AND public.of_puedo_editar_orden(i.orden_id)));

-- ---------- Catálogo de clientes y productos OF (borrar sigue siendo solo ADMIN) ----------
DROP POLICY IF EXISTS of_clientes_insert ON public.of_clientes;
CREATE POLICY of_clientes_insert ON public.of_clientes FOR INSERT WITH CHECK (public.of_puede_crear());
DROP POLICY IF EXISTS of_clientes_update ON public.of_clientes;
CREATE POLICY of_clientes_update ON public.of_clientes FOR UPDATE USING (public.of_puede_crear());
DROP POLICY IF EXISTS of_productos_insert ON public.of_productos;
CREATE POLICY of_productos_insert ON public.of_productos FOR INSERT WITH CHECK (public.of_puede_crear());
DROP POLICY IF EXISTS of_productos_update ON public.of_productos;
CREATE POLICY of_productos_update ON public.of_productos FOR UPDATE USING (public.of_puede_crear());

-- ---------- Adjuntos (orden de compra del cliente) ----------
DROP POLICY IF EXISTS of_adjuntos_insert ON storage.objects;
CREATE POLICY of_adjuntos_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'of-adjuntos' AND public.of_puede_crear());
DROP POLICY IF EXISTS of_adjuntos_delete ON storage.objects;
CREATE POLICY of_adjuntos_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'of-adjuntos' AND (public.of_puede_editar() OR (public.of_puede_crear() AND owner = auth.uid())));

-- ---------- Rol nuevo ----------
INSERT INTO public.roles (nombre, label, color)
VALUES ('COMERCIAL', 'Asesor comercial', 'bg-emerald-600 text-white')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES ('COMERCIAL', 'of', 'registra')
ON CONFLICT (rol, modulo) DO NOTHING;
