-- ============================================================
-- Innovación: interrupciones por mantenimiento
-- Fecha: 2026-11-20 — re-ejecutable
-- ============================================================
-- El jefe de Innovación y Diseño hace trabajos de mantenimiento que solo él puede hacer y que
-- le quitan tiempo a los proyectos. Opción elegida por Angie (20/11): anotar cada interrupción
-- (fecha, horas, equipo, motivo) y ver en el seguimiento mensual cuántas horas perdió el proyecto;
-- en la reunión de jefes se decide si se corre la fecha o se cambia la prioridad.
-- Las horas del mes se suman en pantalla (no se guardan en innovacion_avances). Solo ADMIN.

CREATE TABLE IF NOT EXISTS public.innovacion_interrupciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id  uuid NOT NULL REFERENCES public.innovacion_proyectos(id) ON DELETE CASCADE,
  fecha        date NOT NULL DEFAULT current_date,
  horas        numeric NOT NULL CHECK (horas > 0),
  equipo_id    uuid REFERENCES public.mant_equipos(id) ON DELETE SET NULL,  -- equipo de Mantenimiento, si aplica
  motivo       text NOT NULL,
  creado_por   uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS innovacion_interrupciones_proyecto_idx ON public.innovacion_interrupciones(proyecto_id, fecha DESC);

ALTER TABLE public.innovacion_interrupciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS innovacion_interrupciones_admin ON public.innovacion_interrupciones;
CREATE POLICY innovacion_interrupciones_admin ON public.innovacion_interrupciones FOR ALL
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');
