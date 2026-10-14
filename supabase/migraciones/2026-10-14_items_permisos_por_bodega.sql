-- ============================================================
-- Permitir crear / editar / borrar productos (items) a los roles operativos,
-- SOLO en las bodegas que tienen asignadas (profile_bodegas).
-- LOGISTICA puede en cualquier bodega. ADMIN ya puede por items_manage_admin.
-- Es idempotente: se puede correr más de una vez.
-- Error que corrige: new row violates row-level security policy for table "items"
-- ============================================================

-- 1) DIAGNÓSTICO (opcional): ver qué políticas hay hoy sobre items
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname = 'public' AND tablename = 'items';

DROP POLICY IF EXISTS "items_insert_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_update_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_delete_roles_bodega" ON public.items;

CREATE POLICY "items_insert_roles_bodega" ON public.items FOR INSERT
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_update_roles_bodega" ON public.items FOR UPDATE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_delete_roles_bodega" ON public.items FOR DELETE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

-- 2) VERIFICAR que el usuario que falló tenga bodega asignada
--    (si no aparece MECANIZADOS aquí, hay que asignársela en Admin > Usuarios):
-- SELECT p.nombre, p.rol, b.nombre AS bodega
-- FROM public.profiles p
-- LEFT JOIN public.profile_bodegas pb ON pb.profile_id = p.id
-- LEFT JOIN public.bodegas b ON b.id = pb.bodega_id
-- WHERE p.rol IN ('OPERARIO','JEFE_MECANIZADOS','JEFE_FUNDICION','ALMACENISTA')
-- ORDER BY p.nombre;
