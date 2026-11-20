-- ============================================================
-- KPIs 2027 de los jefes de área: datos que el ERP no guardaba
-- Fecha: 2026-11-20 — re-ejecutable
-- ============================================================
-- 1. Tiempos de mecanizado (William Angulo: tiempo por pieza; Leonardo Cardozo: horas
--    produciendo del centro de mecanizado). Una fila por registro MEC-xxxx.
-- 2. Errores de despacho en las entregas de OF (Efraín Palma, Logística).
-- 3. Rol de Leonardo Cardozo: sigue siendo JEFE_MANTENIMIENTO (Angie: «Jefe de mantenimiento,
--    innovación y diseño»), con etiqueta nueva y permisos para registrar mecanizado y calidad.
-- Las no conformidades de Mecanizados y los motivos de la recogida de Fundición NO necesitan
-- migración: tipo_defecto / motivo_nc ya son texto.

-- ── 1. Tiempos de mecanizado ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mecanizado_tiempos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        text NOT NULL UNIQUE,                 -- MEC-0123 (el mismo de movimientos)
  fecha         date NOT NULL,
  hora_inicio   time NOT NULL,
  hora_fin      time NOT NULL,
  -- Si termina después de medianoche (fin < inicio) se suma un día
  minutos       integer GENERATED ALWAYS AS (
                  (EXTRACT(EPOCH FROM (hora_fin - hora_inicio))::int / 60
                   + CASE WHEN hora_fin < hora_inicio THEN 1440 ELSE 0 END)
                ) STORED,
  maquina       text NOT NULL,                        -- 'Centro de mecanizado', 'Torno', ...
  operario      text,
  piezas        numeric NOT NULL DEFAULT 0,           -- unidades del registro
  referencias   integer NOT NULL DEFAULT 0,           -- productos distintos del registro
  registrado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fin <> hora_inicio)
);
CREATE INDEX IF NOT EXISTS mecanizado_tiempos_fecha_idx ON public.mecanizado_tiempos (fecha);

ALTER TABLE public.mecanizado_tiempos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mec_tiempos_select ON public.mecanizado_tiempos;
CREATE POLICY mec_tiempos_select ON public.mecanizado_tiempos FOR SELECT
  USING (public.mi_nivel('mecanizados') <> 'no');
DROP POLICY IF EXISTS mec_tiempos_insert ON public.mecanizado_tiempos;
CREATE POLICY mec_tiempos_insert ON public.mecanizado_tiempos FOR INSERT
  WITH CHECK (registrado_por = auth.uid() AND public.mi_nivel('mecanizados') IN ('registra', 'todo'));
DROP POLICY IF EXISTS mec_tiempos_admin ON public.mecanizado_tiempos;
CREATE POLICY mec_tiempos_admin ON public.mecanizado_tiempos FOR ALL
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');

-- ── 2. Errores de despacho ──────────────────────────────────────────────────
ALTER TABLE public.of_entregas ADD COLUMN IF NOT EXISTS error_tipo text;
ALTER TABLE public.of_entregas ADD COLUMN IF NOT EXISTS error_detalle text;
ALTER TABLE public.of_entregas ADD COLUMN IF NOT EXISTS error_marcado_por uuid REFERENCES public.profiles(id);
ALTER TABLE public.of_entregas ADD COLUMN IF NOT EXISTS error_marcado_at timestamptz;
ALTER TABLE public.of_entregas DROP CONSTRAINT IF EXISTS of_entregas_error_tipo_check;
ALTER TABLE public.of_entregas ADD CONSTRAINT of_entregas_error_tipo_check CHECK (
  error_tipo IS NULL OR error_tipo IN ('equipo_equivocado', 'faltante', 'dano', 'documento', 'direccion', 'otro'));

-- of_entregas no tiene política de UPDATE (las entregas no se editan, se reversan).
-- Marcar el error va por esta función, que solo toca las columnas del error.
CREATE OR REPLACE FUNCTION public.of_marcar_error_entrega(p_entrega uuid, p_tipo text, p_detalle text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.of_puede_crear() THEN
    RAISE EXCEPTION 'Tu rol no puede marcar errores de despacho';
  END IF;
  UPDATE public.of_entregas
     SET error_tipo        = nullif(p_tipo, ''),
         error_detalle     = CASE WHEN nullif(p_tipo, '') IS NULL THEN NULL ELSE nullif(trim(p_detalle), '') END,
         error_marcado_por = CASE WHEN nullif(p_tipo, '') IS NULL THEN NULL ELSE auth.uid() END,
         error_marcado_at  = CASE WHEN nullif(p_tipo, '') IS NULL THEN NULL ELSE now() END
   WHERE id = p_entrega AND tipo = 'entrega';
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la entrega'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.of_marcar_error_entrega(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.of_marcar_error_entrega(uuid, text, text) TO authenticated;

-- ── 3. Rol de Leonardo Cardozo (JEFE_MANTENIMIENTO) ─────────────────────────
UPDATE public.roles SET label = 'Jefe de Mantenimiento, Innovación y Diseño' WHERE nombre = 'JEFE_MANTENIMIENTO';
INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES
  ('JEFE_MANTENIMIENTO', 'mecanizados',   'todo'),
  ('JEFE_MANTENIMIENTO', 'calidad',       'registra'),
  ('JEFE_MANTENIMIENTO', 'mantenimiento', 'registra')
ON CONFLICT (rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel;
