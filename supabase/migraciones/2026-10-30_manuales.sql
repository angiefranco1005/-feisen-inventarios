-- ============================================================
-- Manuales de procedimiento
-- Fecha: 2026-10-30 — re-ejecutable
-- ============================================================
-- Biblioteca de manuales, procedimientos, instructivos, formatos y políticas por área, con
-- historial de versiones. Cada versión es un archivo (PDF, Word, Excel…) en el bucket privado
-- 'manuales'; el manual apunta a su versión vigente (version_actual).
-- Permisos por la matriz (módulo 'manuales', función mi_nivel):
--   've'   = consulta y descarga los manuales activos
--   'todo' = crea, edita, sube versiones y marca obsoletos (ADMIN siempre)
-- Carga inicial: todos los roles con 've' (la empresa entera consulta los procedimientos).

CREATE TABLE IF NOT EXISTS public.manuales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            text NOT NULL UNIQUE,            -- PR-FUN-001
  titulo            text NOT NULL,
  tipo              text NOT NULL DEFAULT 'procedimiento'
                    CHECK (tipo IN ('manual','procedimiento','instructivo','formato','politica')),
  area              text NOT NULL,                   -- catálogo en src/components/manuales/comun.js
  descripcion       text,
  responsable       text,                            -- cargo dueño del documento
  version_actual    int NOT NULL DEFAULT 0,          -- 0 = todavía sin archivo
  proxima_revision  date,
  activo            boolean NOT NULL DEFAULT true,   -- false = obsoleto
  creado_por        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manual_versiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id       uuid NOT NULL REFERENCES public.manuales(id) ON DELETE CASCADE,
  version         int NOT NULL CHECK (version > 0),
  archivo_path    text NOT NULL,
  archivo_nombre  text NOT NULL,
  archivo_tamano  bigint,
  cambios         text,                              -- qué cambió frente a la anterior
  vigente_desde   date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota')::date,
  subido_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manual_id, version)
);
CREATE INDEX IF NOT EXISTS manual_versiones_manual_idx ON public.manual_versiones (manual_id);

CREATE OR REPLACE FUNCTION public.manuales_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS manuales_touch ON public.manuales;
CREATE TRIGGER manuales_touch BEFORE UPDATE ON public.manuales FOR EACH ROW EXECUTE FUNCTION public.manuales_touch();

-- ---------- RLS ----------
ALTER TABLE public.manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manuales_select ON public.manuales;
CREATE POLICY manuales_select ON public.manuales FOR SELECT
  USING (public.mi_nivel('manuales') = 'todo' OR (public.mi_nivel('manuales') <> 'no' AND activo));
DROP POLICY IF EXISTS manuales_gestion ON public.manuales;
CREATE POLICY manuales_gestion ON public.manuales FOR ALL
  USING (public.mi_nivel('manuales') = 'todo') WITH CHECK (public.mi_nivel('manuales') = 'todo');

DROP POLICY IF EXISTS manual_versiones_select ON public.manual_versiones;
CREATE POLICY manual_versiones_select ON public.manual_versiones FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.manuales m WHERE m.id = manual_id));   -- hereda la regla del manual
DROP POLICY IF EXISTS manual_versiones_gestion ON public.manual_versiones;
CREATE POLICY manual_versiones_gestion ON public.manual_versiones FOR ALL
  USING (public.mi_nivel('manuales') = 'todo') WITH CHECK (public.mi_nivel('manuales') = 'todo');

-- ---------- Archivos (bucket privado, máx. 50 MB por archivo) ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('manuales', 'manuales', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS manuales_storage_select ON storage.objects;
CREATE POLICY manuales_storage_select ON storage.objects FOR SELECT
  USING (bucket_id = 'manuales' AND public.mi_nivel('manuales') <> 'no');
DROP POLICY IF EXISTS manuales_storage_insert ON storage.objects;
CREATE POLICY manuales_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'manuales' AND public.mi_nivel('manuales') = 'todo');
DROP POLICY IF EXISTS manuales_storage_delete ON storage.objects;
CREATE POLICY manuales_storage_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'manuales' AND public.mi_nivel('manuales') = 'todo');

-- ---------- Permisos: todos los roles consultan ----------
INSERT INTO public.rol_permisos (rol, modulo, nivel)
SELECT nombre, 'manuales', 've' FROM public.roles WHERE nombre <> 'ADMIN'
ON CONFLICT (rol, modulo) DO NOTHING;
