-- Innovación: acceso para Leonardo, bitácora de seguimiento con archivos (pedido de Angie, 2026-11-20).
--
-- 1. El módulo deja de ser solo ADMIN: JEFE_MANTENIMIENTO (Leonardo Cardozo, «Jefe de Mantenimiento,
--    Innovación y Diseño») tiene nivel «todo». Las RLS pasan a la matriz (mi_nivel). Aprobar sigue
--    siendo solo de Angie (trigger innovacion_solo_angie_aprueba).
-- 2. La revisión mensual (avance %, gasto, semáforo) se reemplaza por una bitácora: cada entrada con
--    fecha, fase, nota y archivos (planos, fotos, PDF). innovacion_avances tenía 0 filas.
-- 3. Bucket privado «innovacion» para los archivos (se abren con enlace firmado).
-- Se puede correr varias veces.

-- 1. Permiso y RLS
INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES ('JEFE_MANTENIMIENTO', 'innovacion', 'todo')
ON CONFLICT (rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel;

DROP POLICY IF EXISTS innovacion_proyectos_admin ON public.innovacion_proyectos;
DROP POLICY IF EXISTS innovacion_proyectos_matriz ON public.innovacion_proyectos;
CREATE POLICY innovacion_proyectos_matriz ON public.innovacion_proyectos FOR ALL
  USING (public.mi_nivel('innovacion') = 'todo') WITH CHECK (public.mi_nivel('innovacion') = 'todo');

DROP POLICY IF EXISTS innovacion_avances_admin ON public.innovacion_avances;
DROP POLICY IF EXISTS innovacion_avances_matriz ON public.innovacion_avances;
CREATE POLICY innovacion_avances_matriz ON public.innovacion_avances FOR ALL
  USING (public.mi_nivel('innovacion') = 'todo') WITH CHECK (public.mi_nivel('innovacion') = 'todo');

DROP POLICY IF EXISTS innovacion_interrupciones_admin ON public.innovacion_interrupciones;
DROP POLICY IF EXISTS innovacion_interrupciones_matriz ON public.innovacion_interrupciones;
CREATE POLICY innovacion_interrupciones_matriz ON public.innovacion_interrupciones FOR ALL
  USING (public.mi_nivel('innovacion') = 'todo') WITH CHECK (public.mi_nivel('innovacion') = 'todo');

-- 2. Bitácora: nota y archivos [{path, nombre, tipo, tamano}]
ALTER TABLE public.innovacion_avances ADD COLUMN IF NOT EXISTS nota text;
ALTER TABLE public.innovacion_avances ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Archivos (privado, máx. 50 MB por archivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('innovacion', 'innovacion', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

DROP POLICY IF EXISTS innovacion_archivos_select ON storage.objects;
CREATE POLICY innovacion_archivos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'innovacion' AND public.mi_nivel('innovacion') = 'todo');
DROP POLICY IF EXISTS innovacion_archivos_insert ON storage.objects;
CREATE POLICY innovacion_archivos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'innovacion' AND public.mi_nivel('innovacion') = 'todo');
DROP POLICY IF EXISTS innovacion_archivos_delete ON storage.objects;
CREATE POLICY innovacion_archivos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'innovacion' AND public.mi_nivel('innovacion') = 'todo');
