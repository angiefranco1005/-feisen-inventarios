-- ============================================================
-- Migración: RRHH maneja la bodega "Administración" y hace pedidos
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Se puede correr varias veces: cada paso solo agrega lo que falta.
-- Pedido de Angie: la coordinadora de RRHH maneja la bodega de
-- Administración (categorías Dotación, Papelería y Aseo): ve su stock, crea
-- y edita sus productos, registra entradas/salidas y hace pedidos.
-- El acceso por bodega funciona igual que para los jefes de área: por
-- profile_bodegas (Configuración → Usuarios → bodegas asignadas).

-- 1. Bodega "Administración" (solo si no existe con ese nombre) -------------
INSERT INTO public.bodegas (nombre, descripcion)
SELECT 'Administración', 'Dotación, papelería y aseo — la maneja Recursos Humanos'
WHERE NOT EXISTS (
  SELECT 1 FROM public.bodegas
  WHERE UPPER(TRANSLATE(TRIM(nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'ADMINISTRACION'
);

-- 2. Categorías de la bodega (cada categoría pertenece a una bodega:
--    categorias.bodega_id es obligatorio en la base real; schema.sql está
--    desactualizado). Solo se crean las que falten en Administración.
INSERT INTO public.categorias (nombre, bodega_id)
SELECT c.nombre, b.id
FROM (VALUES ('Dotación'), ('Papelería'), ('Aseo')) AS c(nombre)
CROSS JOIN public.bodegas b
WHERE UPPER(TRANSLATE(TRIM(b.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'ADMINISTRACION'
  AND NOT EXISTS (
    SELECT 1 FROM public.categorias x
    WHERE x.bodega_id = b.id
      AND UPPER(TRANSLATE(TRIM(x.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
        = UPPER(TRANSLATE(c.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
  );

-- 3. Asignar la bodega a los usuarios con rol RRHH -------------------------
INSERT INTO public.profile_bodegas (profile_id, bodega_id)
SELECT p.id, b.id
FROM public.profiles p
JOIN public.bodegas b ON UPPER(TRANSLATE(TRIM(b.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'ADMINISTRACION'
WHERE p.rol = 'RRHH'
  AND NOT EXISTS (SELECT 1 FROM public.profile_bodegas pb WHERE pb.profile_id = p.id AND pb.bodega_id = b.id);

-- 4. Productos: RRHH crea/edita/elimina ítems SOLO en sus bodegas -----------
-- Mismas políticas de 2026-10-26_produccion_ensamble.sql + RRHH.
DROP POLICY IF EXISTS "items_insert_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_update_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_delete_roles_bodega" ON public.items;

CREATE POLICY "items_insert_roles_bodega" ON public.items FOR INSERT
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE','RRHH')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_update_roles_bodega" ON public.items FOR UPDATE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE','RRHH')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE','RRHH')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_delete_roles_bodega" ON public.items FOR DELETE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE','RRHH')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

-- Verificación: la bodega, sus categorías y quién la tiene asignada
SELECT b.nombre AS bodega,
       (SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre) FROM public.categorias c WHERE c.bodega_id = b.id) AS categorias,
       p.nombre AS usuario, p.rol
FROM public.bodegas b
LEFT JOIN public.profile_bodegas pb ON pb.bodega_id = b.id
LEFT JOIN public.profiles p ON p.id = pb.profile_id
WHERE UPPER(TRANSLATE(TRIM(b.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'ADMINISTRACION';
