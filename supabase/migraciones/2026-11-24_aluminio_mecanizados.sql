-- ============================================================
-- Aluminio en Mecanizados: sin mecanizar y mecanizado
-- Fecha: 2026-11-24 — re-ejecutable
-- ============================================================
-- Decisión de Angie: todo lo que sale de la fundición de aluminio (las poleas de la
-- coquillada) entra a Mecanizados en ALUMINIO SIN MECANIZAR, y al registrar el
-- mecanizado pasa a ALUMINIO MECANIZADO (aparte del PRODUCTO MECANIZADO de hierro/acero).
-- La app reconoce las dos categorías por ID (src/utils/bodegasCatalogo.js).

-- 1. La categoría vacía ALUMINIO - MECANIZADOS pasa a ser la de sin mecanizar
UPDATE public.categorias
SET nombre = 'ALUMINIO SIN MECANIZAR - MECANIZADOS'
WHERE id = '120db66d-2005-4f29-b54a-271daf3fb2ec';

-- 2. Categoría nueva para el aluminio ya mecanizado (ID fijo)
INSERT INTO public.categorias (id, nombre, bodega_id)
VALUES ('447d16ee-b2b8-4526-ba88-6c9878e5d379', 'ALUMINIO MECANIZADO - MECANIZADOS', '03a709ac-0bee-457a-80a1-0a1603218d34')
ON CONFLICT (id) DO NOTHING;

-- 3. Las poleas de Fundición (POLEAS ALUMINIO - FUNDICIÓN) en Mecanizados, sin mecanizar, con el
--    MISMO nombre: así la transferencia Fundición → Mecanizados las encuentra al aprobarla.
--    Costo y peso iguales a los de Fundición.
INSERT INTO public.items (nombre, categoria_id, unidad_medida, precio_costo, bodega_id, peso_unitario, centro_costo)
SELECT f.nombre, '120db66d-2005-4f29-b54a-271daf3fb2ec', f.unidad_medida, f.precio_costo,
       '03a709ac-0bee-457a-80a1-0a1603218d34', f.peso_unitario, 'MECANIZADOS'
FROM public.items f
WHERE f.categoria_id = 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1' AND f.activo
  AND NOT EXISTS (SELECT 1 FROM public.items m
                  WHERE m.bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
                    AND upper(regexp_replace(m.nombre, '\s', '', 'g')) = upper(regexp_replace(f.nombre, '\s', '', 'g')));

-- 4. Su versión mecanizada: "<nombre> - MECANIZADO" (lo que busca el registro de mecanizado)
INSERT INTO public.items (nombre, categoria_id, unidad_medida, precio_costo, bodega_id, peso_unitario, centro_costo)
SELECT f.nombre || ' - MECANIZADO', '447d16ee-b2b8-4526-ba88-6c9878e5d379', f.unidad_medida, f.precio_costo,
       '03a709ac-0bee-457a-80a1-0a1603218d34', f.peso_unitario, 'MECANIZADOS'
FROM public.items f
WHERE f.categoria_id = 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1' AND f.activo
  AND NOT EXISTS (SELECT 1 FROM public.items m
                  WHERE m.bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
                    AND upper(regexp_replace(m.nombre, '\s', '', 'g')) = upper(regexp_replace(f.nombre || ' - MECANIZADO', '\s', '', 'g')));

-- Revisión:
-- SELECT c.nombre, count(*) FROM items i JOIN categorias c ON c.id = i.categoria_id
-- WHERE i.bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34' GROUP BY 1 ORDER BY 1;
