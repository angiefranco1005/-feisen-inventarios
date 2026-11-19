-- ============================================================
-- Manuales: con nivel 'registra' cada jefe ve solo los documentos que él creó
-- Fecha: 2026-11-19 — re-ejecutable. Requiere 2026-11-17_manuales_medios.sql
-- ============================================================
-- Decisión de Angie (2026-11-19): los jefes de área (Fundición, Mecanizados, Ensamble,
-- Mantenimiento, Ventas, Logística y RRHH) crean los manuales de su área y en el módulo ven
-- únicamente los suyos (creado_por = ellos), ni siquiera los aprobados de otras áreas.
--   'registra' = crea documentos y ve/escribe solo los suyos
--   've'       = consulta lo aprobado (sin cambios)
--   'todo'     = todo el módulo; ADMIN aprueba (sin cambios)
-- Como no ven los códigos de los demás, la app pide los códigos ocupados a manual_codigos_usados().

DROP POLICY IF EXISTS manuales_select ON public.manuales;
CREATE POLICY manuales_select ON public.manuales FOR SELECT USING (
  public.mi_nivel('manuales') = 'todo'
  OR (public.mi_nivel('manuales') = 'registra' AND activo AND creado_por = auth.uid())
  OR (public.mi_nivel('manuales') = 've' AND activo AND version_actual > 0));

-- Las versiones heredan la regla del documento; un borrador solo se crea en un documento visible
DROP POLICY IF EXISTS manual_versiones_insert ON public.manual_versiones;
CREATE POLICY manual_versiones_insert ON public.manual_versiones FOR INSERT WITH CHECK (
  public.mi_nivel('manuales') IN ('registra','todo') AND subido_por = auth.uid() AND estado = 'borrador'
  AND revisado_por IS NULL AND aprobado_por IS NULL AND NOT aprobado_externo
  AND EXISTS (SELECT 1 FROM public.manuales m WHERE m.id = manual_id));

-- Archivos e imágenes: con 'registra', solo los de sus propios documentos
DROP POLICY IF EXISTS manuales_storage_select ON storage.objects;
CREATE POLICY manuales_storage_select ON storage.objects FOR SELECT USING (
  bucket_id = 'manuales' AND (
    public.mi_nivel('manuales') = 'todo'
    OR (public.mi_nivel('manuales') = 'registra' AND EXISTS (
          SELECT 1 FROM public.manuales m WHERE m.id::text = (storage.foldername(name))[1]))
    OR (public.mi_nivel('manuales') = 've' AND EXISTS (
          SELECT 1 FROM public.manual_versiones v WHERE v.archivo_path = name AND v.estado = 'aprobada'))
    OR (public.mi_nivel('manuales') = 've' AND (storage.foldername(name))[2] = 'media' AND EXISTS (
          SELECT 1 FROM public.manuales m WHERE m.id::text = (storage.foldername(name))[1]))
  ));
DROP POLICY IF EXISTS manuales_storage_insert ON storage.objects;
CREATE POLICY manuales_storage_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'manuales' AND (
    public.mi_nivel('manuales') = 'todo'
    OR (public.mi_nivel('manuales') = 'registra' AND EXISTS (
          SELECT 1 FROM public.manuales m WHERE m.id::text = (storage.foldername(name))[1]))));

-- Códigos (y plantilla de la guía ISO) ocupados por cualquier documento, para no repetirlos
CREATE OR REPLACE FUNCTION public.manual_codigos_usados()
RETURNS TABLE (codigo text, plantilla text, mio boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.codigo, m.plantilla, m.creado_por = auth.uid()
  FROM public.manuales m
  WHERE public.mi_nivel('manuales') IN ('registra','todo');
$$;
REVOKE ALL ON FUNCTION public.manual_codigos_usados() FROM public;
GRANT EXECUTE ON FUNCTION public.manual_codigos_usados() TO authenticated;

-- Avisos del menú: con 'registra' solo cuenta por leer sus propios documentos
CREATE OR REPLACE FUNCTION public.manuales_mis_avisos()
RETURNS TABLE (por_leer int, te_toca int, revision_vencida int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH yo AS (SELECT auth.uid() AS id, public.get_my_rol() AS rol, public.mi_nivel('manuales') AS niv)
  SELECT
    (SELECT count(*) FROM public.manuales m
       JOIN public.manual_versiones v ON v.manual_id = m.id AND v.version = m.version_actual AND v.estado = 'aprobada', yo
      WHERE m.activo AND yo.niv <> 'no' AND public.manual_dirigido(m.dirigido_a, yo.rol)
        AND (yo.niv <> 'registra' OR m.creado_por = yo.id)
        AND NOT EXISTS (SELECT 1 FROM public.manual_lecturas l WHERE l.version_id = v.id AND l.usuario_id = yo.id))::int,
    (SELECT count(*) FROM public.manual_versiones v JOIN public.manuales m ON m.id = v.manual_id, yo
      WHERE m.activo AND (
        (yo.rol = 'ADMIN' AND (v.estado = 'revisada' OR (v.estado = 'en_revision' AND v.subido_por <> yo.id)))
        OR (yo.rol <> 'ADMIN' AND yo.niv = 'todo' AND v.estado = 'en_revision' AND v.subido_por <> yo.id)
        OR (v.subido_por = yo.id AND v.estado = 'borrador' AND v.comentario_revision IS NOT NULL)))::int,
    (SELECT count(*) FROM public.manuales m, yo
      WHERE m.activo AND yo.niv = 'todo' AND m.proxima_revision < (now() AT TIME ZONE 'America/Bogota')::date)::int;
$$;

-- Permiso: los jefes de área crean y ven sus propios documentos
INSERT INTO public.rol_permisos (rol, modulo, nivel)
SELECT r, 'manuales', 'registra'
FROM unnest(ARRAY['JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE','JEFE_MANTENIMIENTO','JEFE_VENTAS','LOGISTICA','RRHH']) r
WHERE EXISTS (SELECT 1 FROM public.roles WHERE nombre = r)
ON CONFLICT (rol, modulo) DO UPDATE SET nivel = 'registra', updated_at = now();
