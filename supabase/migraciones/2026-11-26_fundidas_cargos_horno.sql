-- ============================================================
-- Fundidas: nuevos cargos del horno y hora de la primera carga al caldero
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- Pedido de Angie (26/11/2026): en la fundida registrar quién pisa el horno, quién lo arregla /
-- ladrilla y quién pica, y la hora en que sale la primera carga al caldero. "Hora inicio" pasa a
-- ser la hora de encendido del horno (solo cambia el texto en la app, la columna sigue igual).
-- Los nombres son texto libre (como horneros/vaceadores/auxiliares) porque a veces se contrata
-- gente externa solo por ese día que no está en Colaboradores. La app los exige en fundidas
-- nuevas; en la base quedan opcionales para no romper las fundidas ya registradas.
-- Solo agrega columnas: no cambia datos ni permisos (las políticas de fundidas siguen igual).

ALTER TABLE public.fundidas
  ADD COLUMN IF NOT EXISTS pisadores           text[],
  ADD COLUMN IF NOT EXISTS reparadores_horno   text[],
  ADD COLUMN IF NOT EXISTS picadores           text[],
  ADD COLUMN IF NOT EXISTS hora_primera_carga  time;

COMMENT ON COLUMN public.fundidas.pisadores          IS 'Quién pisa el horno (texto libre, puede ser externo)';
COMMENT ON COLUMN public.fundidas.reparadores_horno  IS 'Quién arregla o ladrilla el horno (texto libre, puede ser externo)';
COMMENT ON COLUMN public.fundidas.picadores          IS 'Quién pica (texto libre, puede ser externo)';
COMMENT ON COLUMN public.fundidas.hora_primera_carga IS 'Hora en que sale la primera carga al caldero';

-- Prueba:
-- SELECT numero, hora_inicio, hora_primera_carga, pisadores, reparadores_horno, picadores FROM public.fundidas ORDER BY numero DESC LIMIT 5;
