-- ============================================================
-- Migración: RRHH — centro de costo de cada colaborador y de su nómina
-- Fecha: 2026-11-13
-- Ejecutar en Supabase Dashboard > SQL Editor (se puede correr varias veces)
-- ============================================================
-- Pedido de Angie: clasificar a la gente en Construequipos, Fundición Hierro,
-- Aluminio o Administración para sacar el valor de la nómina por centro de costo.
-- Los ids son los mismos de Finanzas › EEFF. La liquidación guarda el centro con
-- el que se pagó (si la persona cambia de centro, las quincenas viejas no cambian).

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS centro_costo TEXT;
ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS centro_costo TEXT;

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS empleados_centro_costo_check;
ALTER TABLE public.empleados ADD CONSTRAINT empleados_centro_costo_check
  CHECK (centro_costo IN ('construequipos', 'hierro', 'aluminio', 'administracion'));
ALTER TABLE public.nomina_liquidaciones DROP CONSTRAINT IF EXISTS nomina_liquidaciones_centro_costo_check;
ALTER TABLE public.nomina_liquidaciones ADD CONSTRAINT nomina_liquidaciones_centro_costo_check
  CHECK (centro_costo IN ('construequipos', 'hierro', 'aluminio', 'administracion'));

-- Verificación
SELECT column_name, table_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'centro_costo';
