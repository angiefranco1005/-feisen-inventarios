-- ============================================================
-- Migración: RRHH organigrama — puestos de trabajo por área (datos)
-- Fecha: 2026-11-06 · Correr DESPUÉS de 2026-11-06_rrhh_cargos_subarea.sql
-- ============================================================
-- Se puede correr varias veces. Definido por Angie el 2026-11-06.
-- Los puestos nuevos se crean con 1 plaza; las plazas y las personas de
-- Mecanizados y Pintura se ajustan cuando se sepa quién está en cada puesto.

-- 1. Corte y embombe: cada persona a su puesto
--    (Jhon Betancur ya está retirado; el cargo genérico queda solo con él)
UPDATE public.empleados e SET cargo_id = c.id
FROM public.cargos c
WHERE e.estado <> 'retirado' AND (
     (c.nombre = 'OPERARIO DE PLASMA'            AND UPPER(e.nombres || ' ' || e.apellidos) = 'CAMILO ANDRES PERALES LEON')
  OR (c.nombre = 'OPERARIO DOBLADORA Y CIZALLA'  AND UPPER(e.nombres || ' ' || e.apellidos) = 'FRANCISCO JAVIER SARMIENTO')
  OR (c.nombre = 'OPERARIO DE EMBOMBE Y ROLADO'  AND UPPER(e.nombres || ' ' || e.apellidos) = 'JOSE DANIEL HENAO RESTREPO'))
  AND e.cargo_id IS DISTINCT FROM c.id;

-- 2. Soldadura y Armado: sub-áreas Soldadura (Soldador) y Armado y ensamble (Armador)
UPDATE public.cargos SET subarea = 'Soldadura'
WHERE nombre = 'SOLDADOR' AND area = 'Soldadura y Armado' AND subarea IS NULL;
UPDATE public.cargos SET nombre = 'ARMADOR', subarea = 'Armado y ensamble'
WHERE nombre = 'ARMADO Y ENSAMBLE' AND area = 'Soldadura y Armado';

-- 3. Fundición: sub-área Moldeo (Moldeador y Auxiliar de fundición)
UPDATE public.cargos SET subarea = 'Moldeo'
WHERE area = 'Fundición' AND nombre IN ('MOLDEDADOR', 'MOLDEADOR', 'AUXILIAR FUNDICIÓN') AND subarea IS NULL;

-- 4. Mecanizados: 4 puestos (reportan al Jefe de mecanizados)
INSERT INTO public.cargos (nombre, area, cargo_padre_id, plazas)
SELECT p.nombre, 'Mecanizados', (SELECT id FROM public.cargos WHERE nombre = 'JEFE MECANIZADOS' LIMIT 1), 1
FROM (VALUES ('OPERADOR TORNO CNC'), ('OPERADOR CENTRO DE MECANIZADO'), ('OPERADOR TORNO CONVENCIONAL'), ('OPERADOR TALADRO Y CEPILLO')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE UPPER(c.nombre) = p.nombre);

-- 5. Pintura: Pulidor y Pintor (reportan a quien reporta el cargo PINTURA)
INSERT INTO public.cargos (nombre, area, cargo_padre_id, plazas)
SELECT p.nombre, 'Pintura', (SELECT cargo_padre_id FROM public.cargos WHERE nombre = 'PINTURA' LIMIT 1), 1
FROM (VALUES ('PULIDOR'), ('PINTOR')) AS p(nombre)
WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE UPPER(c.nombre) = p.nombre);

-- 6. Jefes de producción a su área (el cargo y la persona)
UPDATE public.cargos SET area = 'Fundición'          WHERE nombre = 'JEFE DE FUNDICIÓN';
UPDATE public.cargos SET area = 'Mecanizados'        WHERE nombre = 'JEFE MECANIZADOS';
UPDATE public.cargos SET area = 'Soldadura y Armado' WHERE nombre = 'JEFE DE PLANTA DE PRODUCCIÓN';
UPDATE public.empleados e SET area = c.area
FROM public.cargos c
WHERE e.cargo_id = c.id AND c.nombre IN ('JEFE DE FUNDICIÓN', 'JEFE MECANIZADOS', 'JEFE DE PLANTA DE PRODUCCIÓN')
  AND e.area IS DISTINCT FROM c.area;

-- 7. El Ejecutivo de marketing y comercial reporta al Gerente comercial
UPDATE public.cargos SET cargo_padre_id = (SELECT id FROM public.cargos WHERE nombre = 'GERENTE COMERCIAL' LIMIT 1)
WHERE nombre = 'EJECUTIVO DE MARKETING Y COMERCIAL';

-- 8. Nombre del cargo copiado en la ficha (empleados.cargo) al día
UPDATE public.empleados e SET cargo = c.nombre
FROM public.cargos c
WHERE e.cargo_id = c.id AND e.cargo IS DISTINCT FROM c.nombre;

-- Verificación
SELECT c.area, c.subarea, c.nombre, c.plazas,
       (SELECT string_agg(e.nombres || ' ' || e.apellidos, ', ') FROM public.empleados e WHERE e.cargo_id = c.id AND e.estado <> 'retirado') AS personas
FROM public.cargos c
WHERE c.area IN ('Soldadura y Armado', 'Fundición', 'Mecanizados', 'Pintura')
ORDER BY c.area, c.subarea NULLS FIRST, c.nombre;
