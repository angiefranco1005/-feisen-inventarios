-- Nuevo módulo: Órdenes de compra
-- Logística (Efraín) genera una o varias órdenes de compra a partir de un pedido,
-- repartiendo los productos (y hasta la cantidad de un mismo producto) entre distintos
-- proveedores, y descarga cada orden en PDF.
--
-- Ejecutar manualmente en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.proveedores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  nit         TEXT,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  direccion   TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ordenes_compra (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero         TEXT NOT NULL UNIQUE,
  pedido_id      UUID REFERENCES public.pedidos(id),
  proveedor_id   UUID REFERENCES public.proveedores(id),
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  razon_social   TEXT NOT NULL DEFAULT 'Feisen S.A.S.',
  ciudad         TEXT NOT NULL DEFAULT 'Soacha',
  observaciones  TEXT,
  anulada        BOOLEAN NOT NULL DEFAULT false,
  usuario_id     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada línea de una orden de compra apunta (cuando aplica) a la línea del pedido de la
-- que salió, para poder calcular cuánta cantidad de ese producto ya quedó cubierta por
-- alguna orden (soporta repartir el mismo producto entre varios proveedores/órdenes).
CREATE TABLE IF NOT EXISTS public.orden_compra_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_compra_id   UUID NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  pedido_item_id    UUID REFERENCES public.pedido_items(id),
  descripcion       TEXT NOT NULL,
  unidad            TEXT,
  cantidad          NUMERIC(18, 3) NOT NULL CHECK (cantidad > 0),
  precio_unitario   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_compra_items_pedido_item ON public.orden_compra_items(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_orden_compra_items_orden       ON public.orden_compra_items(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_pedido           ON public.ordenes_compra(pedido_id);

ALTER TABLE public.proveedores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_compra_items ENABLE ROW LEVEL SECURITY;

-- PROVEEDORES: todos los autenticados leen; ADMIN y LOGISTICA administran
CREATE POLICY "proveedores_select" ON public.proveedores FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "proveedores_manage" ON public.proveedores FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'LOGISTICA'));

-- ORDENES_COMPRA: todos los autenticados leen; ADMIN y LOGISTICA administran
CREATE POLICY "ordenes_compra_select" ON public.ordenes_compra FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ordenes_compra_manage" ON public.ordenes_compra FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'LOGISTICA'));

-- ORDEN_COMPRA_ITEMS: todos los autenticados leen; ADMIN y LOGISTICA administran
CREATE POLICY "orden_compra_items_select" ON public.orden_compra_items FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "orden_compra_items_manage" ON public.orden_compra_items FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'LOGISTICA'));
