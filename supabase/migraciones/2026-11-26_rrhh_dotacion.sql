-- ============================================================
-- Migración: RRHH — entregas de dotación y productos con tallas
-- Fecha: 2026-11-26
-- Ejecutar en Supabase Dashboard > SQL Editor (se puede correr varias veces)
-- ============================================================
-- Pedido de Angie: RRHH entrega la dotación desde la bodega de Administración y
-- deja registro de a quién, cuándo y si el trabajador asume el costo (se descuenta
-- en la nómina de la quincena de la entrega, en "Dotación / herramienta").
-- La salida de inventario es un movimiento 'salida' normal (el trigger de stock
-- descuenta); aquí queda el registro de la entrega con su número de salida.
-- Los productos de dotación pueden tener tallas: un producto por talla
-- ("Camisa - Talla M"), con `talla` y `producto_base` para agruparlos.

-- 1. Tallas en productos
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS talla         TEXT,
  ADD COLUMN IF NOT EXISTS producto_base TEXT;

-- 2. Entregas de dotación
CREATE TABLE IF NOT EXISTS public.dotacion_entregas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id    UUID NOT NULL REFERENCES public.empleados(id) ON DELETE RESTRICT,
  fecha_entrega  DATE NOT NULL DEFAULT CURRENT_DATE,
  asume_costo    BOOLEAN NOT NULL DEFAULT FALSE,
  numero_salida  TEXT,                       -- número del movimiento de salida (SAL-…)
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  observaciones  TEXT,
  creado_por     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dotacion_entregas_empleado ON public.dotacion_entregas(empleado_id);
CREATE INDEX IF NOT EXISTS idx_dotacion_entregas_fecha    ON public.dotacion_entregas(fecha_entrega);

CREATE TABLE IF NOT EXISTS public.dotacion_entrega_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id      UUID NOT NULL REFERENCES public.dotacion_entregas(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES public.items(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,             -- nombre del producto al entregarlo
  talla           TEXT,
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  valor_unitario  NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dotacion_items_entrega ON public.dotacion_entrega_items(entrega_id);

-- 3. Permisos: RRHH y gerencia
ALTER TABLE public.dotacion_entregas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dotacion_entrega_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dotacion_entregas_rrhh_admin" ON public.dotacion_entregas;
CREATE POLICY "dotacion_entregas_rrhh_admin" ON public.dotacion_entregas FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
DROP POLICY IF EXISTS "dotacion_entrega_items_rrhh_admin" ON public.dotacion_entrega_items;
CREATE POLICY "dotacion_entrega_items_rrhh_admin" ON public.dotacion_entrega_items FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- Verificación
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('dotacion_entregas', 'dotacion_entrega_items');
