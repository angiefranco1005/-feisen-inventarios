-- ============================================================
-- Migración: RRHH — Registrar el preaviso de no prórroga entregado
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Contratos a término fijo: cuando RRHH entrega el preaviso de no prórroga
-- (mínimo 30 días antes del vencimiento, CST art. 46) se guarda la fecha de
-- entrega, a qué fecha fin de contrato corresponde y la carta firmada (en
-- empleado_documentos, tipo 'Preaviso de no prórroga').
-- `preaviso_para_fin` permite que, si el contrato se prorroga y cambia la
-- fecha fin, el recordatorio vuelva a aparecer para el nuevo vencimiento.

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS preaviso_fecha_entrega DATE,
  ADD COLUMN IF NOT EXISTS preaviso_para_fin      DATE,
  ADD COLUMN IF NOT EXISTS preaviso_documento_id  UUID REFERENCES public.empleado_documentos(id) ON DELETE SET NULL;
