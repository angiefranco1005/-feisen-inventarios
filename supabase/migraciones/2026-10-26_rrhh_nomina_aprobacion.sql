-- ============================================================
-- Migración: RRHH — Nómina: valor hora automático, aprobación de
--            gerencia y envío de desprendibles por correo
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Decisiones de Angie:
--   • Valor hora a partir del valor del día (fórmula que ya usaban en el
--     Excel desde la 2.ª quincena de julio 2026): hora normal = día ÷ 8,4
--     (42 h semanales ÷ 5 días); hora adicional = hora normal × 1,25;
--     hora domingo/festivo = hora normal × 2 (recargo del 100 %). Todo
--     truncado a $100 y editable.
--   • Flujo: RRHH cierra la quincena → gerencia (ADMIN) la aprueba → al
--     aprobar se envía a cada persona su desprendible por correo (Resend,
--     Edge Function `enviar-desprendible`).

-- 1. Valor hora domingo/festivo ---------------------------------------------
ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS valor_hora_recargo NUMERIC(14, 2);
ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS valor_hora_recargo NUMERIC(14, 2);

-- 2. Estado "aprobada" ------------------------------------------------------
ALTER TABLE public.nomina_periodos DROP CONSTRAINT IF EXISTS nomina_periodos_estado_check;
ALTER TABLE public.nomina_periodos ADD CONSTRAINT nomina_periodos_estado_check
  CHECK (estado IN ('borrador', 'cerrada', 'aprobada'));
ALTER TABLE public.nomina_periodos
  ADD COLUMN IF NOT EXISTS aprobada_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS aprobada_en  TIMESTAMPTZ;

-- Solo ADMIN puede aprobar o desaprobar una quincena, y una quincena
-- aprobada no la puede modificar RRHH.
CREATE OR REPLACE FUNCTION public.fn_nomina_periodo_aprobacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.estado = 'aprobada' OR OLD.estado = 'aprobada')
     AND NEW.estado IS DISTINCT FROM OLD.estado
     AND public.get_my_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo gerencia (ADMIN) puede aprobar o desaprobar la nómina';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_nomina_periodo_aprobacion ON public.nomina_periodos;
CREATE TRIGGER trg_nomina_periodo_aprobacion BEFORE UPDATE ON public.nomina_periodos
  FOR EACH ROW EXECUTE FUNCTION public.fn_nomina_periodo_aprobacion();

-- 3. Seguimiento del envío del desprendible ---------------------------------
ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS email_enviado_a  TEXT,
  ADD COLUMN IF NOT EXISTS email_enviado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error      TEXT;
