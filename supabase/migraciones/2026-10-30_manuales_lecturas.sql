-- ============================================================
-- Manuales: «leído y entendido», a quién va dirigido y avisos
-- Fecha: 2026-10-30 — re-ejecutable. Requiere 2026-10-30_manuales_aprobacion.sql
-- ============================================================
-- dirigido_a = roles que deben leer el documento (vacío = todos). ADMIN no confirma lectura:
-- es quien aprueba. Cada persona confirma la versión vigente; al aprobarse una nueva versión
-- la confirmación vuelve a quedar pendiente (ISO 9001 §7.3 toma de conciencia).
-- Las reglas de profiles solo dejan ver el propio perfil (o todos a ADMIN), por eso los nombres
-- de elaboró/revisó/aprobó y las listas de lectura salen por funciones SECURITY DEFINER.

ALTER TABLE public.manuales ADD COLUMN IF NOT EXISTS dirigido_a text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.manual_lecturas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL REFERENCES public.manual_versiones(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  leido_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS manual_lecturas_usuario_idx ON public.manual_lecturas (usuario_id);

ALTER TABLE public.manual_lecturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_lecturas_select ON public.manual_lecturas;
CREATE POLICY manual_lecturas_select ON public.manual_lecturas FOR SELECT
  USING (usuario_id = auth.uid() OR public.mi_nivel('manuales') = 'todo');
-- Solo se confirma la versión vigente (aprobada) de un documento activo; sin editar ni borrar
DROP POLICY IF EXISTS manual_lecturas_insert ON public.manual_lecturas;
CREATE POLICY manual_lecturas_insert ON public.manual_lecturas FOR INSERT WITH CHECK (
  usuario_id = auth.uid() AND public.mi_nivel('manuales') <> 'no' AND EXISTS (
    SELECT 1 FROM public.manual_versiones v JOIN public.manuales m ON m.id = v.manual_id
    WHERE v.id = version_id AND v.estado = 'aprobada' AND v.version = m.version_actual AND m.activo));

-- ¿El documento va dirigido a este rol? (ADMIN nunca: es quien aprueba)
CREATE OR REPLACE FUNCTION public.manual_dirigido(p_dirigido text[], p_rol text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_rol IS NOT NULL AND p_rol <> 'ADMIN' AND (cardinality(p_dirigido) = 0 OR p_rol = ANY (p_dirigido));
$$;

-- Nombres de personas por id (para elaboró / revisó / aprobó), para quien usa Manuales
CREATE OR REPLACE FUNCTION public.manual_nombres(p_ids uuid[])
RETURNS TABLE (id uuid, nombre text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre FROM public.profiles p
  WHERE p.id = ANY (p_ids) AND public.mi_nivel('manuales') <> 'no';
$$;

-- Quién ha leído la versión vigente de un documento (solo nivel 'todo')
CREATE OR REPLACE FUNCTION public.manual_lecturas_estado(p_manual uuid)
RETURNS TABLE (usuario_id uuid, nombre text, rol text, leido_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.rol, l.leido_at
  FROM public.manuales m
  JOIN public.manual_versiones v ON v.manual_id = m.id AND v.version = m.version_actual AND v.estado = 'aprobada'
  JOIN public.profiles p ON coalesce(p.activo, true) AND public.manual_dirigido(m.dirigido_a, p.rol)
  LEFT JOIN public.manual_lecturas l ON l.version_id = v.id AND l.usuario_id = p.id
  WHERE m.id = p_manual AND public.mi_nivel('manuales') = 'todo'
  ORDER BY l.leido_at IS NOT NULL, p.nombre;
$$;

-- Resumen de lectura por documento: leídos / total (solo nivel 'todo')
CREATE OR REPLACE FUNCTION public.manual_lecturas_resumen()
RETURNS TABLE (manual_id uuid, leidos int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, count(l.id)::int, count(p.id)::int
  FROM public.manuales m
  JOIN public.manual_versiones v ON v.manual_id = m.id AND v.version = m.version_actual AND v.estado = 'aprobada'
  JOIN public.profiles p ON coalesce(p.activo, true) AND public.manual_dirigido(m.dirigido_a, p.rol)
  LEFT JOIN public.manual_lecturas l ON l.version_id = v.id AND l.usuario_id = p.id
  WHERE m.activo AND public.mi_nivel('manuales') = 'todo'
  GROUP BY m.id;
$$;

-- Avisos del usuario actual para el menú: documentos por leer, trámites que le tocan y
-- (nivel 'todo') revisiones periódicas vencidas
CREATE OR REPLACE FUNCTION public.manuales_mis_avisos()
RETURNS TABLE (por_leer int, te_toca int, revision_vencida int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH yo AS (SELECT auth.uid() AS id, public.get_my_rol() AS rol, public.mi_nivel('manuales') AS niv)
  SELECT
    (SELECT count(*) FROM public.manuales m
       JOIN public.manual_versiones v ON v.manual_id = m.id AND v.version = m.version_actual AND v.estado = 'aprobada', yo
      WHERE m.activo AND yo.niv <> 'no' AND public.manual_dirigido(m.dirigido_a, yo.rol)
        AND NOT EXISTS (SELECT 1 FROM public.manual_lecturas l WHERE l.version_id = v.id AND l.usuario_id = yo.id))::int,
    (SELECT count(*) FROM public.manual_versiones v JOIN public.manuales m ON m.id = v.manual_id, yo
      WHERE m.activo AND (
        (yo.rol = 'ADMIN' AND (v.estado = 'revisada' OR (v.estado = 'en_revision' AND v.subido_por <> yo.id)))
        OR (yo.rol <> 'ADMIN' AND yo.niv = 'todo' AND v.estado = 'en_revision' AND v.subido_por <> yo.id)
        OR (v.subido_por = yo.id AND v.estado = 'borrador' AND v.comentario_revision IS NOT NULL)))::int,
    (SELECT count(*) FROM public.manuales m, yo
      WHERE m.activo AND yo.niv = 'todo' AND m.proxima_revision < (now() AT TIME ZONE 'America/Bogota')::date)::int;
$$;

REVOKE ALL ON FUNCTION public.manual_nombres(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.manual_lecturas_estado(uuid) FROM public;
REVOKE ALL ON FUNCTION public.manual_lecturas_resumen() FROM public;
REVOKE ALL ON FUNCTION public.manuales_mis_avisos() FROM public;
GRANT EXECUTE ON FUNCTION public.manual_nombres(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_lecturas_estado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_lecturas_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manuales_mis_avisos() TO authenticated;
