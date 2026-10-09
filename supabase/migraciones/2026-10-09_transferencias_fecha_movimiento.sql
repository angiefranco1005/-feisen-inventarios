-- Asegura que transferencias_pendientes guarde la fecha real del movimiento
-- (la que elige Fundición al registrar). Es idempotente: si la columna ya existe, no hace nada.
ALTER TABLE public.transferencias_pendientes
  ADD COLUMN IF NOT EXISTS fecha_movimiento DATE;
