-- ============================================================
-- Coquillada de poleas de aluminio (Fundición)
-- Fecha: 2026-11-24 — re-ejecutable. Va DESPUÉS de 2026-11-24_categorias_sufijo_bodega.sql
-- ============================================================
-- Pedido de Angie: registrar la coquillada de poleas. El almacenista le pasa a Fundición el
-- aluminio del día (transferencia de LINGOTE ALUMINIO desde Almacén); al registrar la
-- coquillada se descuenta de Fundición el peso de las poleas buenas y las buenas entran al
-- inventario de Fundición. Las dañadas se anotan, pero su aluminio vuelve al horno, así que
-- no se descuenta (ej.: 10 kg de aluminio, sale bien un ARO DESPULPADORA de 1 kg → quedan 9 kg).
-- Un solo registro por coquillada (sin programar antes).

-- 1. Tablas
CREATE SEQUENCE IF NOT EXISTS public.coquilladas_numero_seq;

CREATE TABLE IF NOT EXISTS public.coquilladas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        integer NOT NULL UNIQUE DEFAULT nextval('public.coquilladas_numero_seq'),
  fecha         date NOT NULL,
  kg_aluminio   numeric NOT NULL DEFAULT 0,   -- kg descontados (solo las buenas)
  kg_retorno    numeric NOT NULL DEFAULT 0,   -- kg de las dañadas (vuelven al horno, no se descuentan)
  observaciones text,
  usuario_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.coquilladas_numero_seq OWNED BY public.coquilladas.numero;

CREATE TABLE IF NOT EXISTS public.coquillada_piezas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coquillada_id  uuid NOT NULL REFERENCES public.coquilladas(id) ON DELETE CASCADE,
  item_id        uuid NOT NULL REFERENCES public.items(id),
  buenas         numeric NOT NULL DEFAULT 0 CHECK (buenas >= 0),
  danadas        numeric NOT NULL DEFAULT 0 CHECK (danadas >= 0),
  peso_unitario  numeric NOT NULL DEFAULT 0,  -- kg por polea al momento de registrar
  CHECK (buenas + danadas > 0)
);
CREATE INDEX IF NOT EXISTS coquillada_piezas_coquillada_idx ON public.coquillada_piezas(coquillada_id);

-- 2. Permisos: igual que las fundidas (ven ADMIN, Logística, Jefe de Fundición y Consultor;
--    registran ADMIN y Jefe de Fundición; borra solo ADMIN)
ALTER TABLE public.coquilladas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coquillada_piezas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coquilladas_select ON public.coquilladas;
CREATE POLICY coquilladas_select ON public.coquilladas FOR SELECT
  USING (public.get_my_rol() = ANY (ARRAY['ADMIN','LOGISTICA','JEFE_FUNDICION','CONSULTOR']));
DROP POLICY IF EXISTS coquilladas_insert ON public.coquilladas;
CREATE POLICY coquilladas_insert ON public.coquilladas FOR INSERT
  WITH CHECK (public.get_my_rol() = ANY (ARRAY['ADMIN','JEFE_FUNDICION']));
DROP POLICY IF EXISTS coquilladas_update ON public.coquilladas;
CREATE POLICY coquilladas_update ON public.coquilladas FOR UPDATE
  USING (public.get_my_rol() = ANY (ARRAY['ADMIN','JEFE_FUNDICION']));
DROP POLICY IF EXISTS coquilladas_delete ON public.coquilladas;
CREATE POLICY coquilladas_delete ON public.coquilladas FOR DELETE
  USING (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS coquillada_piezas_select ON public.coquillada_piezas;
CREATE POLICY coquillada_piezas_select ON public.coquillada_piezas FOR SELECT
  USING (public.get_my_rol() = ANY (ARRAY['ADMIN','LOGISTICA','JEFE_FUNDICION','CONSULTOR']));
DROP POLICY IF EXISTS coquillada_piezas_insert ON public.coquillada_piezas;
CREATE POLICY coquillada_piezas_insert ON public.coquillada_piezas FOR INSERT
  WITH CHECK (public.get_my_rol() = ANY (ARRAY['ADMIN','JEFE_FUNDICION']));
DROP POLICY IF EXISTS coquillada_piezas_delete ON public.coquillada_piezas;
CREATE POLICY coquillada_piezas_delete ON public.coquillada_piezas FOR DELETE
  USING (public.get_my_rol() = 'ADMIN');

-- 3. LINGOTE ALUMINIO en Fundición (categoría ALUMINIO - FUNDICIÓN), con el mismo nombre que
--    en Almacén para que la transferencia Almacén → Fundición lo encuentre sola. Costo = el de Almacén.
INSERT INTO public.items (nombre, categoria_id, unidad_medida, precio_costo, bodega_id, peso_unitario, centro_costo)
SELECT 'LINGOTE ALUMINIO', 'e28e93da-652d-47c6-af6f-f7d8ce601022', 'kg',
       coalesce((SELECT precio_costo FROM public.items WHERE id = '952b7383-90bf-4609-83ea-754a83b7d21a'), 0),
       'a0604489-2768-445b-8e68-e450ef8520ed', 1, 'FUNDICIÓN'
WHERE NOT EXISTS (SELECT 1 FROM public.items
                  WHERE bodega_id = 'a0604489-2768-445b-8e68-e450ef8520ed' AND upper(trim(nombre)) = 'LINGOTE ALUMINIO');

-- 4. Las 49 poleas (nombres y pesos tal cual la lista de Angie), categoría POLEAS ALUMINIO - FUNDICIÓN.
--    Costo inicial = kg × costo del lingote (el aluminio que llevan); se puede ajustar en Productos.
INSERT INTO public.items (nombre, categoria_id, unidad_medida, precio_costo, bodega_id, peso_unitario, centro_costo)
SELECT v.nombre, 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1', 'unidad',
       round(v.peso * coalesce((SELECT precio_costo FROM public.items WHERE id = '952b7383-90bf-4609-83ea-754a83b7d21a'), 0)),
       'a0604489-2768-445b-8e68-e450ef8520ed', v.peso, 'FUNDICIÓN'
FROM (VALUES
  ('1 1/2X 1', 0.1),
  ('1 1/2X 2', 0.15),
  ('2X1', 0.175),
  ('2X2', 0.29),
  ('2 1/2X1', 0.3),
  ('2 1/2X2', 0.465),
  ('3X2', 0.675),
  ('3X1', 0.405),
  ('3 1/2X1', 0.435),
  ('3 1/2 X2', 0.695),
  ('4X1', 0.585),
  ('4X2', 0.975),
  ('4 1/2X1', 0.79),
  ('4 1/2X2', 1.06),
  ('5X1', 0.84),
  ('5X2', 1.44),
  ('5 1/2 X 2', 1.085),
  ('5 1/2 X 1', 0.9),
  ('6X1', 1.0),
  ('6 1/2 X 2', 1.375),
  ('6X2', 1.165),
  ('7X1', 1.04),
  ('7X2', 1.46),
  ('7 1/2 X1', 1.285),
  ('7 1/2 X 2', 1.68),
  ('8X1', 1.69),
  ('8X2', 1.97),
  ('9X1', 1.8),
  ('9X2', 2.13),
  ('10X1', 1.73),
  ('10X2', 2.27),
  ('11X2', 2.65),
  ('12 X 1', 2.21),
  ('12X2', 2.85),
  ('14X1', 1.83),
  ('14 X 2', 3.595),
  ('16X1', 3.12),
  ('16 X 2', 4.03),
  ('18X1', 3.365),
  ('18X2', 5.6),
  ('20 X 2', 5.8),
  ('20 X 1', 3.79),
  ('17x1B', 5.1),
  ('TAMBOR', 13.095),
  ('TAMBOR LITE', 6.68),
  ('VOLANTE', 0.595),
  ('ZAPATAS', 1.495),
  ('ZAPATAS ALUMINIO', 0.75),
  ('ARO DESPULPADORA', 1.0)
) AS v(nombre, peso)
WHERE NOT EXISTS (SELECT 1 FROM public.items i
                  WHERE i.bodega_id = 'a0604489-2768-445b-8e68-e450ef8520ed'
                    AND i.categoria_id = 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1'
                    AND upper(trim(i.nombre)) = upper(v.nombre));

-- Revisión:
-- SELECT nombre, peso_unitario, precio_costo FROM items WHERE categoria_id = 'd0e46316-a3a1-41dd-b7e9-39c252ae3ed1' ORDER BY nombre;
