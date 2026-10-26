-- ============================================================
-- Migración: RRHH — checklist de documentos de ingreso
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- La pestaña Documentos pasa a ser un checklist con los 10 documentos que
-- pide RRHH (ver DOCUMENTOS_REQUERIDOS en src/components/rrhh/catalogosRRHH.js).
-- Solo renombra los tipos de la fase 1 que equivalen a uno del checklist,
-- para que los archivos ya cargados cuenten como entregados. No borra nada.
-- Sin correr esta migración la app funciona igual: esos archivos solo se
-- verían en "Otros documentos".

UPDATE public.empleado_documentos SET tipo = 'Fotocopia de la cédula'
  WHERE tipo = 'Documento de identidad';
UPDATE public.empleado_documentos SET tipo = 'Certificado de estudio'
  WHERE tipo = 'Certificados de estudio';
UPDATE public.empleado_documentos SET tipo = 'Certificados de afiliación'
  WHERE tipo = 'Afiliaciones (EPS, AFP, ARL, Caja)';
UPDATE public.empleado_documentos SET tipo = 'Exámenes médicos'
  WHERE tipo = 'Examen médico';
