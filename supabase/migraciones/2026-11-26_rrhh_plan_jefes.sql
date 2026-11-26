-- ============================================================
-- Migración: RRHH — plan de evaluación de jefes de área (KPIs + competencias comunes)
-- Fecha: 2026-11-26
-- Ejecutar en Supabase Dashboard > SQL Editor (se puede correr varias veces)
-- ============================================================
-- Pedido de Angie: llevar al módulo de Desempeño el plan de evaluación de jefes 2027
-- (armado en el registro "Evaluación de jefes de área 2027"), editable desde el ERP.
--   • Nota del jefe = KPIs de su área × 60 % + competencias comunes × 40 %.
--   • Cada área tiene un jefe y hasta 3 KPIs con peso, meta, mínimo, línea base…
--   • Las competencias comunes tienen un peso para los trimestres con encuesta (junio y
--     diciembre) y otro para los trimestres sin encuesta (marzo y septiembre).
--   • Se evalúa por trimestre: ciclos de tipo 'jefes' que copian el plan al crearse.

CREATE TABLE IF NOT EXISTS public.desempeno_jefes_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio        SMALLINT NOT NULL,
  codigo      TEXT NOT NULL,                         -- COM, ENS, FUN… ; COMUN para la evaluación común
  nombre      TEXT NOT NULL,
  es_comun    BOOLEAN NOT NULL DEFAULT false,        -- true = competencias comunes (40 %)
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE SET NULL,  -- jefe evaluado
  aporte      TEXT,                                  -- aporte del área al objetivo del año
  reglas      TEXT,                                  -- reglas de juego (no son KPI)
  pendientes  TEXT,                                  -- datos o formatos que faltan
  orden       SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, codigo)
);

CREATE TABLE IF NOT EXISTS public.desempeno_jefes_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id           UUID NOT NULL REFERENCES public.desempeno_jefes_areas(id) ON DELETE CASCADE,
  codigo            TEXT,                            -- id del KPI en el registro (p. ej. comercial-ventas)
  tipo              TEXT NOT NULL DEFAULT 'kpi' CHECK (tipo IN ('kpi', 'competencia')),
  nombre            TEXT NOT NULL,
  formula           TEXT,
  peso              NUMERIC(5, 2) NOT NULL DEFAULT 0,  -- KPI: % dentro del 60 %. Competencia: % del 40 % en trimestres con encuesta
  peso_sin_encuesta NUMERIC(5, 2),                     -- competencia: % del 40 % en trimestres sin encuesta
  frecuencia        TEXT,
  linea_base        TEXT,
  meta              TEXT,
  minimo            TEXT,
  hay_dato          TEXT CHECK (hay_dato IN ('si', 'parcial', 'no')),
  fuente_dato       TEXT,
  que_falta         TEXT,
  quien_califica    TEXT,
  estado            TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'acordado', 'firmado')),
  notas             TEXT,
  orden             SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (area_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_desempeno_jefes_items_area ON public.desempeno_jefes_items(area_id);

DROP TRIGGER IF EXISTS trg_desempeno_jefes_areas_updated_at ON public.desempeno_jefes_areas;
CREATE TRIGGER trg_desempeno_jefes_areas_updated_at BEFORE UPDATE ON public.desempeno_jefes_areas
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();
DROP TRIGGER IF EXISTS trg_desempeno_jefes_items_updated_at ON public.desempeno_jefes_items;
CREATE TRIGGER trg_desempeno_jefes_items_updated_at BEFORE UPDATE ON public.desempeno_jefes_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

ALTER TABLE public.desempeno_jefes_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desempeno_jefes_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "desempeno_jefes_areas_rrhh_admin" ON public.desempeno_jefes_areas;
CREATE POLICY "desempeno_jefes_areas_rrhh_admin" ON public.desempeno_jefes_areas FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
DROP POLICY IF EXISTS "desempeno_jefes_items_rrhh_admin" ON public.desempeno_jefes_items;
CREATE POLICY "desempeno_jefes_items_rrhh_admin" ON public.desempeno_jefes_items FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- Ciclos de jefes y regla de conducta
ALTER TABLE public.desempeno_ciclos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.desempeno_ciclos ADD COLUMN IF NOT EXISTS plan_anio SMALLINT;
ALTER TABLE public.desempeno_ciclos ADD COLUMN IF NOT EXISTS con_encuesta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.desempeno_ciclos DROP CONSTRAINT IF EXISTS desempeno_ciclos_tipo_check;
ALTER TABLE public.desempeno_ciclos ADD CONSTRAINT desempeno_ciclos_tipo_check CHECK (tipo IN ('general', 'jefes'));
-- Falta grave documentada: deja las competencias (40 %) del trimestre en cero
ALTER TABLE public.desempeno_evaluaciones ADD COLUMN IF NOT EXISTS falta_grave BOOLEAN NOT NULL DEFAULT false;

-- Verificación
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'desempeno_jefes%';
