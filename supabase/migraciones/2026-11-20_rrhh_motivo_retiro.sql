-- ============================================================
-- Migración: RRHH — causal de desvinculación (renuncia o despido)
-- Fecha: 2026-11-20
-- Ejecutar en Supabase Dashboard > SQL Editor (se puede correr varias veces)
-- ============================================================
-- Pedido de Angie: saber por qué se va la gente para sacar estadísticas de retiros
-- (alimenta el informe de retiros del inicio). La categoría va en motivo_retiro_tipo;
-- motivo_retiro se conserva como detalle libre. Los valores son los de
-- MOTIVOS_RETIRO en src/components/rrhh/catalogosRRHH.js: si cambia uno, cambiar los dos.

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS motivo_retiro_tipo TEXT;

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS empleados_motivo_retiro_tipo_check;
ALTER TABLE public.empleados ADD CONSTRAINT empleados_motivo_retiro_tipo_check
  CHECK (motivo_retiro_tipo IS NULL OR motivo_retiro_tipo IN ('renuncia', 'despido'));

-- Jhon Betancur (retirado el 2026-10-30): despido, según Angie
UPDATE public.empleados SET motivo_retiro_tipo = 'despido'
WHERE UPPER(nombres || ' ' || apellidos) = 'JHON EDUARD BETANCUR SALAZAR' AND estado = 'retirado' AND motivo_retiro_tipo IS NULL;

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'empleados' AND column_name IN ('motivo_retiro', 'motivo_retiro_tipo');
