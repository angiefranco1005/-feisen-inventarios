-- ============================================================
-- Migración: RRHH — tipos de contrato de Feisen
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Definición de Angie:
--   • Indefinido
--   • Término fijo  → se registra la duración en meses (y la fecha fin)
--   • Contratista   → dos tipos de vinculación:
--       - destajo: se paga según las piezas que haga
--       - dia:     se paga por días trabajados
-- El campo "salario_base" pasa a mostrarse como "Salario / honorarios".
-- El auxilio de transporte se quita de la ficha (la columna queda sin uso).

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS duracion_meses   SMALLINT CHECK (duracion_meses > 0),
  ADD COLUMN IF NOT EXISTS tipo_vinculacion TEXT CHECK (tipo_vinculacion IN ('destajo', 'dia'));

-- Pasar los valores de la fase 1 a los nuevos tipos
UPDATE public.empleados SET tipo_contrato = 'Indefinido'
  WHERE tipo_contrato = 'Término indefinido';
UPDATE public.empleados SET tipo_contrato = 'Contratista'
  WHERE tipo_contrato IN ('Prestación de servicios', 'Obra o labor');
UPDATE public.empleados SET tipo_contrato = 'Término fijo'
  WHERE tipo_contrato = 'Aprendizaje (SENA)';
-- La vinculación solo aplica a contratistas
UPDATE public.empleados SET tipo_vinculacion = NULL
  WHERE tipo_contrato IS DISTINCT FROM 'Contratista';
