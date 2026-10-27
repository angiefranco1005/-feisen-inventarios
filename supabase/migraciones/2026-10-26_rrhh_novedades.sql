-- ============================================================
-- Migración: RRHH — Registro de novedades (ausencias)
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Incapacidades, permisos, vacaciones y licencias de cada colaborador, con
-- sus soportes (archivos en el bucket privado rrhh, carpeta novedades/{id}/).
-- Solo ADMIN y RRHH ven o editan.

CREATE TABLE IF NOT EXISTS public.novedades (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo              TEXT UNIQUE,                       -- NOV-0001
  empleado_id         UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('incapacidad', 'permiso', 'vacaciones', 'licencia')),
  subtipo             TEXT,                              -- Enfermedad general, Cita médica, Luto…
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE NOT NULL,
  por_horas           BOOLEAN NOT NULL DEFAULT false,    -- permisos de unas horas
  hora_inicio         TIME,
  hora_fin            TIME,
  dias                NUMERIC(6, 2),                     -- días que cuenta la novedad (editable)
  horas               NUMERIC(6, 2),                     -- solo permisos por horas
  remunerado          BOOLEAN,                           -- permisos y licencias

  -- Solo incapacidades
  entidad             TEXT,                              -- EPS o ARL que la expide
  numero_incapacidad  TEXT,
  diagnostico         TEXT,
  prorroga            BOOLEAN NOT NULL DEFAULT false,

  observaciones       TEXT,
  creado_por          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_novedades_empleado ON public.novedades(empleado_id);
CREATE INDEX IF NOT EXISTS idx_novedades_fechas   ON public.novedades(fecha_inicio, fecha_fin);

DROP TRIGGER IF EXISTS trg_novedades_updated_at ON public.novedades;
CREATE TRIGGER trg_novedades_updated_at
  BEFORE UPDATE ON public.novedades
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

CREATE TABLE IF NOT EXISTS public.novedad_soportes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  novedad_id   UUID NOT NULL REFERENCES public.novedades(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  path         TEXT NOT NULL,
  subido_por   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novedad_soportes_novedad ON public.novedad_soportes(novedad_id);

ALTER TABLE public.novedades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedad_soportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "novedades_rrhh_admin" ON public.novedades;
CREATE POLICY "novedades_rrhh_admin" ON public.novedades FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

DROP POLICY IF EXISTS "novedad_soportes_rrhh_admin" ON public.novedad_soportes;
CREATE POLICY "novedad_soportes_rrhh_admin" ON public.novedad_soportes FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
