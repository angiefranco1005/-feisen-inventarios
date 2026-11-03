-- ============================================================
-- Manuales: documentos construidos en la app (asistente guiado)
-- Fecha: 2026-11-03 — re-ejecutable. Requiere 2026-10-30_manuales_lecturas.sql
-- ============================================================
-- Una versión ahora es un archivo subido (archivo_path) o un documento escrito en la app
-- (contenido jsonb, con la estructura del tipo: objetivo, alcance, pasos…). El PDF y el Word se
-- generan en el navegador a partir de `contenido`, así que no hay archivo que guardar.
-- `plantilla` = clave de la guía ISO con la que se creó el documento (para marcarla como hecha).

ALTER TABLE public.manual_versiones ADD COLUMN IF NOT EXISTS contenido jsonb;
ALTER TABLE public.manual_versiones ALTER COLUMN archivo_path DROP NOT NULL;
ALTER TABLE public.manual_versiones ALTER COLUMN archivo_nombre DROP NOT NULL;
ALTER TABLE public.manual_versiones DROP CONSTRAINT IF EXISTS manual_versiones_archivo_o_contenido;
ALTER TABLE public.manual_versiones ADD CONSTRAINT manual_versiones_archivo_o_contenido
  CHECK (archivo_path IS NOT NULL OR contenido IS NOT NULL);

ALTER TABLE public.manuales ADD COLUMN IF NOT EXISTS plantilla text;
