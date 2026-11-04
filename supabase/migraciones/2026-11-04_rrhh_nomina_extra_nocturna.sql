-- ============================================================
-- Migración: RRHH nómina — horas extra nocturnas
-- Fecha: 2026-11-04
-- ============================================================
-- Se puede correr varias veces.
-- Pedido de Angie: separar las horas extra en diurnas (+25 %), nocturnas
-- (+75 %, de 7:00 p. m. a 6:00 a. m.) y domingo/festivo (+100 %).
-- Diurnas y festivas ya existían (horas_extra / horas_extra_recargo).
-- Sin valor guardado, la hora nocturna se deriva de la diurna (× 1,75 / 1,25),
-- así que no hace falta llenar datos existentes.

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS valor_hora_nocturna NUMERIC(14,2);

ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS horas_extra_nocturna NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS valor_hora_nocturna  NUMERIC(14,2);
