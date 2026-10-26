-- ============================================================
-- Migración: RRHH — Organigrama por cargos (puestos de trabajo)
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- El organigrama se arma con CARGOS (puestos), no con personas: cada cargo
-- reporta a un cargo superior (cargo_padre_id) y tiene N plazas. Los
-- colaboradores se asignan a un cargo (empleados.cargo_id), así se ven las
-- vacantes y, en cada puesto: perfil requerido, asignación salarial, manual
-- de funciones, criterios de evaluación de desempeño, EPP, capacitación y
-- herramientas a entregar.
-- Las listas se guardan como JSONB (arreglos) para editarlas como tablas
-- sencillas desde la app.

CREATE TABLE IF NOT EXISTS public.cargos (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                 TEXT NOT NULL,
  area                   TEXT,
  cargo_padre_id         UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  plazas                 SMALLINT NOT NULL DEFAULT 1 CHECK (plazas >= 0),
  orden                  INTEGER NOT NULL DEFAULT 0,
  objetivo               TEXT,                         -- propósito del cargo

  -- Perfil requerido
  nivel_educativo        TEXT,
  formacion              TEXT,                         -- título / área de estudio
  experiencia            TEXT,
  competencias           JSONB NOT NULL DEFAULT '[]',  -- ["Trabajo en equipo", …]
  requisitos_adicionales TEXT,                         -- licencias, curso de alturas…

  -- Asignación salarial
  salario_min            NUMERIC(14, 2),
  salario_max            NUMERIC(14, 2),
  nota_salarial          TEXT,

  -- Manual de funciones
  funciones              JSONB NOT NULL DEFAULT '[]',  -- ["Moldear piezas…", …]
  manual_path            TEXT,                         -- PDF en bucket rrhh
  manual_nombre          TEXT,

  -- Evaluación de desempeño
  evaluacion_periodicidad TEXT,
  evaluacion_criterios   JSONB NOT NULL DEFAULT '[]',  -- [{criterio, peso}]

  -- Dotación y formación
  epp                    JSONB NOT NULL DEFAULT '[]',  -- [{elemento, reposicion}]
  capacitaciones         JSONB NOT NULL DEFAULT '[]',  -- [{tema, periodicidad}]
  herramientas           JSONB NOT NULL DEFAULT '[]',  -- [{herramienta, cantidad}]

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cargo_padre_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS idx_cargos_padre ON public.cargos(cargo_padre_id);

DROP TRIGGER IF EXISTS trg_cargos_updated_at ON public.cargos;
CREATE TRIGGER trg_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cargos_rrhh_admin" ON public.cargos FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- Vínculo colaborador → cargo. La columna de texto `empleados.cargo` se
-- mantiene sincronizada con el nombre del cargo (la usan listado y alertas).
ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_empleados_cargo ON public.empleados(cargo_id);

-- Crear los cargos que ya existen como texto en las fichas (uno por nombre+área)
-- y enlazar a cada colaborador. Las plazas quedan = personas activas en ese cargo.
INSERT INTO public.cargos (nombre, area, plazas)
SELECT TRIM(e.cargo), e.area, GREATEST(COUNT(*) FILTER (WHERE e.estado <> 'retirado'), 1)
FROM public.empleados e
WHERE e.cargo IS NOT NULL AND TRIM(e.cargo) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.cargos c
    WHERE UPPER(TRIM(c.nombre)) = UPPER(TRIM(e.cargo)) AND c.area IS NOT DISTINCT FROM e.area)
GROUP BY TRIM(e.cargo), e.area;

UPDATE public.empleados e SET cargo_id = c.id
FROM public.cargos c
WHERE e.cargo_id IS NULL
  AND UPPER(TRIM(c.nombre)) = UPPER(TRIM(e.cargo))
  AND c.area IS NOT DISTINCT FROM e.area;
