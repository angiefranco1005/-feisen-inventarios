-- ============================================================
-- Evaluación de proveedores (ISO 9001 §8.4.1) y datos para unificar con Odoo
-- Fecha: 2026-11-17 — re-ejecutable
-- ============================================================
-- Cuando un pedido queda recibido o cerrado, Logística califica cada orden de compra (una OC =
-- un proveedor; un pedido puede tener varias). Tres preguntas de 1 a 5 estrellas y si hubo
-- algún problema. El promedio y el historial se ven en la ficha del proveedor.
-- Permiso: nivel 'todo' del módulo 'ordenes_compra' (Logística) o ADMIN.

CREATE TABLE IF NOT EXISTS public.proveedor_evaluaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id     uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  orden_compra_id  uuid NOT NULL UNIQUE REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  pedido_id        uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  calidad          smallint NOT NULL CHECK (calidad BETWEEN 1 AND 5),       -- calidad del material
  cumplimiento     smallint NOT NULL CHECK (cumplimiento BETWEEN 1 AND 5),  -- cumplió la fecha prometida
  precio           smallint NOT NULL CHECK (precio BETWEEN 1 AND 5),        -- precio acordado y competitivo
  hubo_problema    boolean NOT NULL DEFAULT false,
  problema         text,
  evaluado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT hubo_problema OR coalesce(trim(problema), '') <> '')
);
CREATE INDEX IF NOT EXISTS proveedor_evaluaciones_proveedor_idx ON public.proveedor_evaluaciones (proveedor_id);

ALTER TABLE public.proveedor_evaluaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proveedor_evaluaciones_select ON public.proveedor_evaluaciones;
CREATE POLICY proveedor_evaluaciones_select ON public.proveedor_evaluaciones FOR SELECT
  USING (public.mi_nivel('ordenes_compra') = 'todo');
DROP POLICY IF EXISTS proveedor_evaluaciones_insert ON public.proveedor_evaluaciones;
CREATE POLICY proveedor_evaluaciones_insert ON public.proveedor_evaluaciones FOR INSERT
  WITH CHECK (public.mi_nivel('ordenes_compra') = 'todo' AND evaluado_por = auth.uid());
DROP POLICY IF EXISTS proveedor_evaluaciones_update ON public.proveedor_evaluaciones;
CREATE POLICY proveedor_evaluaciones_update ON public.proveedor_evaluaciones FOR UPDATE
  USING (public.mi_nivel('ordenes_compra') = 'todo') WITH CHECK (public.mi_nivel('ordenes_compra') = 'todo');

-- Para unificar con Odoo: de qué contacto de cada Odoo sale el proveedor, y la ciudad
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS odoo_feisen_id int;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS odoo_fc_id int;
