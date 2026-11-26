-- ============================================================
-- Piezas del andamio colgante que faltaban en Mecanizados
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- El jefe de Mecanizados va a armar el paquete ANDAMIO COLGANTE. De su lista de 15 piezas
-- faltaban dos; se crean sin mecanizar y mecanizadas ("<nombre> - MECANIZADO"), costo 0
-- hasta que se costeen. También se corrige el nombre del buje mecanizado, al que le faltaba
-- el " - " antes de MECANIZADO (sin eso el registro de mecanizado no lo encuentra).

-- 1. Polea (acero 1045 2" x 20 mm) y tornillo (1/2" x 1"), medida en () al final del nombre
INSERT INTO public.items (nombre, categoria_id, unidad_medida, precio_costo, bodega_id, centro_costo)
SELECT v.nombre, v.cat::uuid, 'UND', 0, '03a709ac-0bee-457a-80a1-0a1603218d34', 'MECANIZADOS'
FROM (VALUES
  ('POLEA ANDAMIO COLGANTE (2X20MM 1045)',                 '549c8036-364a-433b-b18f-d4a444c9f9a2'), -- ACEROS - MECANIZADOS
  ('POLEA ANDAMIO COLGANTE (2X20MM 1045) - MECANIZADO',    'bff5d482-1647-426c-a88f-dedd72ff5b06'), -- PRODUCTO MECANIZADO
  ('TORNILLO ANDAMIO COLGANTE (1/2X1")',                  'cfa47941-3a0e-4fc8-a9c5-6a676bbb5c50'), -- FERRETERIA - MECANIZADOS
  ('TORNILLO ANDAMIO COLGANTE (1/2X1") - MECANIZADO',     'bff5d482-1647-426c-a88f-dedd72ff5b06')
) AS v(nombre, cat)
WHERE NOT EXISTS (SELECT 1 FROM public.items m
                  WHERE m.bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
                    AND upper(regexp_replace(m.nombre, '\s', '', 'g')) = upper(regexp_replace(v.nombre, '\s', '', 'g')));

-- 2. Nombre del buje: la medida va en () al final, como en las demás piezas del andamio
--    (y el mecanizado con " - MECANIZADO", que es lo que busca el registro de mecanizado)
UPDATE public.items
SET nombre = 'BUJE TRINQUETE GRANDE ANDAMIO COLGANTE (1 1/2X27MM 1045)'
WHERE bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
  AND nombre = 'BUJE TRINQUETE (ACERO 1045 1 1/2" X 27 MM) - ANDAMIO COLGANTE';

UPDATE public.items
SET nombre = 'BUJE TRINQUETE GRANDE ANDAMIO COLGANTE (1 1/2X27MM 1045) - MECANIZADO'
WHERE bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
  AND nombre = 'BUJE TRINQUETE (ACERO 1045 1 1/2" X 27 MM) - ANDAMIO COLGANTE MECANIZADO';
