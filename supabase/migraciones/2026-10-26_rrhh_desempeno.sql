-- ============================================================
-- Migración: RRHH — Evaluación de desempeño
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Inspirado en la gestión del desempeño de Buk: ciclos de evaluación por
-- objetivos y/o competencias, escala configurable, autoevaluación opcional,
-- calibración, matriz de talento (9-box: desempeño × potencial), plan de
-- acción y retroalimentación, con historial en la ficha del colaborador.
--
-- Cada evaluación toma una "foto" de lo que se evalúa al crear el ciclo:
--   • objetivos = criterios de evaluación del cargo (cargos.evaluacion_criterios, con peso %)
--   • competencias = las transversales del ciclo + las del cargo (cargos.competencias)
-- Así, si después cambian el cargo o sus criterios, la evaluación histórica no cambia.
-- Las registra RRHH/ADMIN (los operarios no tienen usuario en la app).

CREATE TABLE IF NOT EXISTS public.desempeno_ciclos (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                      TEXT NOT NULL,                 -- p. ej. "Evaluación 2.º semestre 2026"
  fecha_inicio                DATE NOT NULL,                 -- periodo evaluado
  fecha_fin                   DATE NOT NULL,
  estado                      TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  peso_objetivos              SMALLINT NOT NULL DEFAULT 60 CHECK (peso_objetivos BETWEEN 0 AND 100),
  peso_competencias           SMALLINT NOT NULL DEFAULT 40 CHECK (peso_competencias BETWEEN 0 AND 100),
  incluye_autoevaluacion      BOOLEAN NOT NULL DEFAULT false,
  escala                      JSONB NOT NULL DEFAULT '[]',   -- [{valor, etiqueta}] (1 a 5)
  competencias_transversales  JSONB NOT NULL DEFAULT '[]',   -- ["Trabajo en equipo", …]
  creado_por                  UUID REFERENCES public.profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_fin >= fecha_inicio),
  CHECK (peso_objetivos + peso_competencias = 100)
);

CREATE TABLE IF NOT EXISTS public.desempeno_evaluaciones (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ciclo_id                  UUID NOT NULL REFERENCES public.desempeno_ciclos(id) ON DELETE CASCADE,
  empleado_id               UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  cargo_id                  UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  cargo_nombre              TEXT,                            -- foto del cargo al crear el ciclo
  area                      TEXT,
  evaluador                 TEXT,                            -- jefe que evalúa (nombre)
  estado                    TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completa')),

  -- [{tipo: 'objetivo'|'competencia', nombre, peso, nota, nota_auto, comentario}]
  items                     JSONB NOT NULL DEFAULT '[]',

  resultado_objetivos       NUMERIC(4, 2),                   -- en la escala (1 a 5)
  resultado_competencias    NUMERIC(4, 2),
  resultado                 NUMERIC(4, 2),                   -- ponderado
  resultado_calibrado       NUMERIC(4, 2),                   -- ajuste de calibración (opcional)
  justificacion_calibracion TEXT,
  potencial                 TEXT CHECK (potencial IN ('bajo', 'medio', 'alto')),

  fortalezas                TEXT,
  oportunidades             TEXT,
  comentario_colaborador    TEXT,
  plan_accion               JSONB NOT NULL DEFAULT '[]',     -- [{accion, responsable, fecha, estado}]

  fecha_evaluacion          DATE,
  completada_en             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ciclo_id, empleado_id)
);

CREATE INDEX IF NOT EXISTS idx_desempeno_eval_ciclo    ON public.desempeno_evaluaciones(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_desempeno_eval_empleado ON public.desempeno_evaluaciones(empleado_id);

DROP TRIGGER IF EXISTS trg_desempeno_eval_updated_at ON public.desempeno_evaluaciones;
CREATE TRIGGER trg_desempeno_eval_updated_at BEFORE UPDATE ON public.desempeno_evaluaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

ALTER TABLE public.desempeno_ciclos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desempeno_evaluaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "desempeno_ciclos_rrhh_admin" ON public.desempeno_ciclos FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
CREATE POLICY "desempeno_evaluaciones_rrhh_admin" ON public.desempeno_evaluaciones FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
