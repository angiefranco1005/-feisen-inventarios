-- ============================================================
-- Migración: Módulo Recursos Humanos — Fase 1: fichas de empleado
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Inspirado en la "ficha de colaborador" de Buk: una ficha por persona con
-- datos personales, laborales, seguridad social, pago, contacto de emergencia
-- y documentos adjuntos.
--
-- Datos sensibles (salario, cuenta bancaria, documentos): solo ADMIN y el
-- nuevo rol RRHH (coordinadora de Recursos Humanos) pueden ver o editar.
-- `usuario_id` queda opcional para enlazar a futuro la ficha con el usuario
-- de la app (autoservicio del empleado — fase posterior).

-- 1. Rol nuevo -------------------------------------------------------------
INSERT INTO public.roles (nombre, label, color)
VALUES ('RRHH', 'Recursos Humanos', 'bg-pink-600 text-white')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Empleados -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empleados (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo                TEXT UNIQUE,                    -- EMP-0001

  -- Personal
  tipo_documento        TEXT NOT NULL DEFAULT 'CC',
  numero_documento      TEXT NOT NULL UNIQUE,
  fecha_expedicion      DATE,
  lugar_expedicion      TEXT,
  nombres               TEXT NOT NULL,
  apellidos             TEXT NOT NULL,
  fecha_nacimiento      DATE,
  lugar_nacimiento      TEXT,
  genero                TEXT,
  estado_civil          TEXT,
  grupo_sanguineo       TEXT,
  direccion             TEXT,
  barrio                TEXT,
  ciudad                TEXT,
  telefono              TEXT,
  celular               TEXT,
  email_personal        TEXT,
  nivel_educativo       TEXT,
  profesion             TEXT,
  talla_camisa          TEXT,
  talla_pantalon        TEXT,
  talla_calzado         TEXT,
  foto_path             TEXT,                           -- ruta en bucket rrhh

  -- Laboral
  cargo                 TEXT,
  area                  TEXT,
  jefe_id               UUID REFERENCES public.empleados(id) ON DELETE SET NULL,
  fecha_ingreso         DATE,
  tipo_contrato         TEXT,
  fecha_fin_contrato    DATE,
  jornada               TEXT,
  salario_base          NUMERIC(14, 2),
  auxilio_transporte    BOOLEAN NOT NULL DEFAULT true,
  email_corporativo     TEXT,
  estado                TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'licencia', 'retirado')),
  fecha_retiro          DATE,
  motivo_retiro         TEXT,

  -- Seguridad social
  eps                   TEXT,
  fondo_pension         TEXT,
  fondo_cesantias       TEXT,
  arl                   TEXT,
  nivel_riesgo_arl      SMALLINT CHECK (nivel_riesgo_arl BETWEEN 1 AND 5),
  caja_compensacion     TEXT,

  -- Pago
  banco                 TEXT,
  tipo_cuenta           TEXT,
  numero_cuenta         TEXT,

  -- Contacto de emergencia
  emergencia_nombre     TEXT,
  emergencia_parentesco TEXT,
  emergencia_telefono   TEXT,

  observaciones         TEXT,
  usuario_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.fn_empleados_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empleados_updated_at ON public.empleados;
CREATE TRIGGER trg_empleados_updated_at
  BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

-- 3. Documentos del empleado ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.empleado_documentos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empleado_id  UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,          -- Contrato, Cédula, Hoja de vida, …
  nombre       TEXT NOT NULL,          -- nombre original del archivo
  path         TEXT NOT NULL,          -- ruta en bucket rrhh
  subido_por   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empleado_documentos_empleado
  ON public.empleado_documentos(empleado_id);

-- 4. RLS: solo ADMIN y RRHH ----------------------------------------------
ALTER TABLE public.empleados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleado_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empleados_rrhh_admin" ON public.empleados;
CREATE POLICY "empleados_rrhh_admin" ON public.empleados FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

DROP POLICY IF EXISTS "empleado_documentos_rrhh_admin" ON public.empleado_documentos;
CREATE POLICY "empleado_documentos_rrhh_admin" ON public.empleado_documentos FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- 5. Bucket privado para fotos y documentos -------------------------------
-- Privado: los archivos se ven con URL firmada (expira), nunca URL pública.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rrhh', 'rrhh', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rrhh_storage_select" ON storage.objects;
CREATE POLICY "rrhh_storage_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'rrhh' AND public.get_my_rol() IN ('ADMIN', 'RRHH'));
DROP POLICY IF EXISTS "rrhh_storage_insert" ON storage.objects;
CREATE POLICY "rrhh_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'rrhh' AND public.get_my_rol() IN ('ADMIN', 'RRHH'));
DROP POLICY IF EXISTS "rrhh_storage_update" ON storage.objects;
CREATE POLICY "rrhh_storage_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'rrhh' AND public.get_my_rol() IN ('ADMIN', 'RRHH'));
DROP POLICY IF EXISTS "rrhh_storage_delete" ON storage.objects;
CREATE POLICY "rrhh_storage_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'rrhh' AND public.get_my_rol() IN ('ADMIN', 'RRHH'));
