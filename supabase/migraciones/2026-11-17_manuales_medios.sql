-- ============================================================
-- Manuales: imágenes por paso y video por documento
-- Fecha: 2026-11-17 — re-ejecutable. Requiere 2026-11-03_manuales_contenido.sql
-- ============================================================
-- Las imágenes y el video de un documento escrito en la app se suben al bucket 'manuales' en
-- `<manual_id>/media/…` y se referencian desde manual_versiones.contenido. Antes, quien solo
-- consulta (nivel 've') solo abría archivos de versiones aprobadas; ahora también abre los
-- medios de cualquier documento que pueda ver (la regla de `manuales` decide cuáles).
-- Subir sigue siendo para 'registra' y 'todo' (regla manuales_storage_insert).

DROP POLICY IF EXISTS manuales_storage_select ON storage.objects;
CREATE POLICY manuales_storage_select ON storage.objects FOR SELECT USING (
  bucket_id = 'manuales' AND (
    public.mi_nivel('manuales') IN ('registra','todo')
    OR (public.mi_nivel('manuales') = 've' AND EXISTS (
          SELECT 1 FROM public.manual_versiones v WHERE v.archivo_path = name AND v.estado = 'aprobada'))
    OR (public.mi_nivel('manuales') = 've' AND (storage.foldername(name))[2] = 'media' AND EXISTS (
          SELECT 1 FROM public.manuales m WHERE m.id::text = (storage.foldername(name))[1]))
  ));
