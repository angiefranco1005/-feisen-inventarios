-- ============================================================
-- Proveedores: copia de los proveedores de los dos Odoo (Feisen y FC) para unificarlos
-- Fecha: 2026-11-17 — re-ejecutable
-- ============================================================
-- La función `proveedores-odoo` (solo lectura en Odoo) guarda aquí, por empresa, cada contacto
-- que Odoo marca como proveedor o al que se le han registrado facturas de compra, con cuántas
-- facturas tiene y cuánto se le ha comprado. Es una tabla de trabajo: de aquí sale la propuesta
-- de base unificada que se revisa antes de cargarla en `proveedores`. Solo ADMIN la lee.

CREATE TABLE IF NOT EXISTS public.proveedores_odoo (
  empresa         text NOT NULL CHECK (empresa IN ('feisen','fc')),
  odoo_id         int  NOT NULL,
  nombre          text NOT NULL,
  nit             text,
  email           text,
  telefono        text,
  direccion       text,
  ciudad          text,
  es_empresa      boolean,
  activo          boolean,
  facturas        int NOT NULL DEFAULT 0,      -- facturas de proveedor publicadas
  ultima_factura  date,
  total_compras   numeric NOT NULL DEFAULT 0,  -- sin IVA, en COP
  cargado_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, odoo_id)
);
ALTER TABLE public.proveedores_odoo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proveedores_odoo_admin ON public.proveedores_odoo;
CREATE POLICY proveedores_odoo_admin ON public.proveedores_odoo FOR SELECT USING (public.get_my_rol() = 'ADMIN');
