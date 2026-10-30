-- ============================================================
-- Manuales: flujo de aprobación (ISO 9001 §7.5 — información documentada)
-- Fecha: 2026-10-30 — re-ejecutable. Requiere 2026-10-30_manuales.sql
-- ============================================================
-- Cada versión pasa por: borrador → en_revision → revisada → aprobada.
--   Elabora  (nivel 'registra' o 'todo'): sube el borrador y lo envía a revisión.
--   Revisa   (nivel 'todo', distinto de quien elaboró): revisa o devuelve con comentario.
--   Aprueba  (ADMIN = gerencia): aprueba y la versión queda vigente; la anterior queda obsoleta.
--            ADMIN puede revisar y aprobar en un paso si no fue quien elaboró.
-- Devolver regresa la versión a borrador con el comentario; quien elaboró cambia el archivo y la reenvía.
-- 'Cargar como aprobado' (solo ADMIN): para los documentos que ya estaban aprobados en papel;
-- queda marcado aprobado_externo para que el listado maestro lo diga.
-- Quien solo consulta (nivel 've') ve únicamente versiones aprobadas.

-- ---------- Columnas del flujo ----------
ALTER TABLE public.manual_versiones
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'aprobada',
  ADD COLUMN IF NOT EXISTS enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comentario_revision text;
-- Las filas que existieran antes del flujo quedan aprobadas; las nuevas nacen en borrador
ALTER TABLE public.manual_versiones ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE public.manual_versiones DROP CONSTRAINT IF EXISTS manual_versiones_estado_check;
ALTER TABLE public.manual_versiones ADD CONSTRAINT manual_versiones_estado_check
  CHECK (estado IN ('borrador','en_revision','revisada','aprobada'));
-- 'vigente_desde' se fija al aprobar
ALTER TABLE public.manual_versiones ALTER COLUMN vigente_desde DROP NOT NULL;

-- Un solo borrador abierto por documento (así los números de versión no saltan)
CREATE UNIQUE INDEX IF NOT EXISTS manual_versiones_un_borrador
  ON public.manual_versiones (manual_id) WHERE estado <> 'aprobada';

-- ---------- RLS ----------
-- Documentos: 'todo' ve todo; 'registra' ve los activos; 've' solo los activos con versión aprobada
DROP POLICY IF EXISTS manuales_select ON public.manuales;
CREATE POLICY manuales_select ON public.manuales FOR SELECT USING (
  public.mi_nivel('manuales') = 'todo'
  OR (public.mi_nivel('manuales') = 'registra' AND activo)
  OR (public.mi_nivel('manuales') = 've' AND activo AND version_actual > 0));
-- 'registra' crea documentos nuevos (sin versión); editar la ficha sigue siendo 'todo'
DROP POLICY IF EXISTS manuales_insert_registra ON public.manuales;
CREATE POLICY manuales_insert_registra ON public.manuales FOR INSERT WITH CHECK (
  public.mi_nivel('manuales') = 'registra' AND creado_por = auth.uid() AND version_actual = 0 AND activo);

DROP POLICY IF EXISTS manual_versiones_select ON public.manual_versiones;
CREATE POLICY manual_versiones_select ON public.manual_versiones FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.manuales m WHERE m.id = manual_id)
  AND (estado = 'aprobada' OR public.mi_nivel('manuales') IN ('registra','todo')));
-- Los cambios de estado van por la función manual_version_accion; directo solo se crea el
-- borrador y quien lo elaboró le cambia el archivo o lo descarta mientras siga en borrador
DROP POLICY IF EXISTS manual_versiones_gestion ON public.manual_versiones;
DROP POLICY IF EXISTS manual_versiones_insert ON public.manual_versiones;
CREATE POLICY manual_versiones_insert ON public.manual_versiones FOR INSERT WITH CHECK (
  public.mi_nivel('manuales') IN ('registra','todo') AND subido_por = auth.uid() AND estado = 'borrador'
  AND revisado_por IS NULL AND aprobado_por IS NULL AND NOT aprobado_externo);
DROP POLICY IF EXISTS manual_versiones_update ON public.manual_versiones;
CREATE POLICY manual_versiones_update ON public.manual_versiones FOR UPDATE
  USING (estado = 'borrador' AND subido_por = auth.uid() AND public.mi_nivel('manuales') IN ('registra','todo'))
  WITH CHECK (estado = 'borrador' AND subido_por = auth.uid() AND revisado_por IS NULL AND aprobado_por IS NULL AND NOT aprobado_externo);
DROP POLICY IF EXISTS manual_versiones_delete ON public.manual_versiones;
CREATE POLICY manual_versiones_delete ON public.manual_versiones FOR DELETE
  USING (estado = 'borrador' AND (subido_por = auth.uid() OR public.mi_nivel('manuales') = 'todo'));

-- Archivos: quien consulta solo abre los de versiones aprobadas
DROP POLICY IF EXISTS manuales_storage_select ON storage.objects;
CREATE POLICY manuales_storage_select ON storage.objects FOR SELECT USING (
  bucket_id = 'manuales' AND (public.mi_nivel('manuales') IN ('registra','todo')
    OR (public.mi_nivel('manuales') = 've' AND EXISTS (
      SELECT 1 FROM public.manual_versiones v WHERE v.archivo_path = name AND v.estado = 'aprobada'))));
DROP POLICY IF EXISTS manuales_storage_insert ON storage.objects;
CREATE POLICY manuales_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'manuales' AND public.mi_nivel('manuales') IN ('registra','todo'));
DROP POLICY IF EXISTS manuales_storage_delete ON storage.objects;
CREATE POLICY manuales_storage_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'manuales' AND (public.mi_nivel('manuales') = 'todo' OR owner = auth.uid()));

-- ---------- Acciones del flujo ----------
-- p_accion: 'enviar' | 'revisar' | 'aprobar' | 'devolver' | 'cargar_aprobado'
CREATE OR REPLACE FUNCTION public.manual_version_accion(p_version uuid, p_accion text, p_comentario text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v   public.manual_versiones%ROWTYPE;
  yo  uuid := auth.uid();
  niv text := public.mi_nivel('manuales');
  admin boolean := public.get_my_rol() = 'ADMIN';
  hoy date := (now() AT TIME ZONE 'America/Bogota')::date;
BEGIN
  SELECT * INTO v FROM public.manual_versiones WHERE id = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La versión no existe'; END IF;

  IF p_accion = 'enviar' THEN
    IF v.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo un borrador se puede enviar a revisión'; END IF;
    IF v.subido_por IS DISTINCT FROM yo AND niv <> 'todo' THEN RAISE EXCEPTION 'Solo quien elaboró el borrador lo envía a revisión'; END IF;
    UPDATE public.manual_versiones SET estado = 'en_revision', enviado_at = now(), comentario_revision = NULL WHERE id = v.id;

  ELSIF p_accion = 'revisar' THEN
    IF v.estado <> 'en_revision' THEN RAISE EXCEPTION 'La versión no está en revisión'; END IF;
    IF niv <> 'todo' THEN RAISE EXCEPTION 'No tienes permiso para revisar documentos'; END IF;
    IF v.subido_por = yo THEN RAISE EXCEPTION 'Quien elaboró el documento no puede revisarlo'; END IF;
    UPDATE public.manual_versiones SET estado = 'revisada', revisado_por = yo, revisado_at = now() WHERE id = v.id;

  ELSIF p_accion = 'aprobar' THEN
    IF NOT admin THEN RAISE EXCEPTION 'Solo gerencia aprueba documentos'; END IF;
    IF v.estado = 'en_revision' THEN
      IF v.subido_por = yo THEN RAISE EXCEPTION 'Otra persona debe revisar el documento antes de que lo apruebes'; END IF;
      UPDATE public.manual_versiones SET revisado_por = yo, revisado_at = now() WHERE id = v.id;
    ELSIF v.estado <> 'revisada' THEN
      RAISE EXCEPTION 'La versión todavía no está lista para aprobar';
    END IF;
    UPDATE public.manual_versiones SET estado = 'aprobada', aprobado_por = yo, aprobado_at = now(),
      vigente_desde = coalesce(vigente_desde, hoy) WHERE id = v.id;

  ELSIF p_accion = 'devolver' THEN
    IF v.estado NOT IN ('en_revision','revisada') THEN RAISE EXCEPTION 'Solo se devuelve una versión en revisión'; END IF;
    IF niv <> 'todo' THEN RAISE EXCEPTION 'No tienes permiso para devolver documentos'; END IF;
    IF coalesce(trim(p_comentario), '') = '' THEN RAISE EXCEPTION 'Escribe qué hay que corregir'; END IF;
    UPDATE public.manual_versiones SET estado = 'borrador', revisado_por = NULL, revisado_at = NULL,
      comentario_revision = trim(p_comentario) WHERE id = v.id;

  ELSIF p_accion = 'cargar_aprobado' THEN
    IF NOT admin THEN RAISE EXCEPTION 'Solo gerencia carga documentos ya aprobados'; END IF;
    IF v.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo un borrador se puede cargar como aprobado'; END IF;
    UPDATE public.manual_versiones SET estado = 'aprobada', aprobado_por = yo, aprobado_at = now(), aprobado_externo = true,
      vigente_desde = coalesce(vigente_desde, hoy) WHERE id = v.id;

  ELSE
    RAISE EXCEPTION 'Acción desconocida: %', p_accion;
  END IF;

  -- Al aprobar: queda vigente y la revisión periódica vuelve a contar un año desde su vigencia
  IF p_accion IN ('aprobar','cargar_aprobado') THEN
    UPDATE public.manuales m SET version_actual = v.version,
      proxima_revision = (SELECT vigente_desde FROM public.manual_versiones WHERE id = v.id) + interval '1 year'
    WHERE m.id = v.manual_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.manual_version_accion(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.manual_version_accion(uuid, text, text) TO authenticated;
