-- ============================================================
-- Migración: RRHH organigrama — sub-áreas y puestos de Corte y embombe
-- Fecha: 2026-11-06
-- ============================================================
-- Se puede correr varias veces.
-- Pedido de Angie: las áreas se dividen en sub-áreas y cada sub-área tiene
-- puestos de trabajo. Ej.: Soldadura y Armado › Corte y embombe › Operario de
-- plasma, Operario dobladora y cizalla, Operario de embombe y rolado. Los puestos son cargos
-- (con su perfil, EPP, evaluación…) que llevan la sub-área.

ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS subarea TEXT;

-- Los 3 puestos de Corte y embombe (reportan a quien reporta el cargo genérico
-- "CORTE Y EMBOMBRE", hoy Jefe de planta). Solo se crean si no existen.
INSERT INTO public.cargos (nombre, area, subarea, cargo_padre_id, plazas)
SELECT p.nombre, 'Soldadura y Armado', 'Corte y embombe',
       (SELECT cargo_padre_id FROM public.cargos WHERE UPPER(nombre) = 'CORTE Y EMBOMBRE' LIMIT 1), 1
FROM (VALUES ('OPERARIO DE PLASMA'), ('OPERARIO DOBLADORA Y CIZALLA'), ('OPERARIO DE EMBOMBE Y ROLADO')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE UPPER(c.nombre) = p.nombre);

-- El cargo genérico queda dentro de la sub-área mientras se pasan sus personas
-- a los puestos; cuando quede vacío se puede eliminar desde el organigrama.
UPDATE public.cargos SET subarea = 'Corte y embombe'
WHERE UPPER(nombre) = 'CORTE Y EMBOMBRE' AND subarea IS NULL;
