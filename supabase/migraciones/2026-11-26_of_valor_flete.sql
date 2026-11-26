-- ============================================================
-- OF: valor del flete a facturar (opcional)
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- Angie pidió que el asesor pueda poner, al crear la OF, cuánto se le va a facturar al cliente
-- por el flete. Es opcional: vacío = no se factura flete aparte o no se sabe todavía.
-- En pesos, sin decimales. Las políticas de la tabla no cambian (son por fila).

ALTER TABLE public.ordenes_fabricacion
  ADD COLUMN IF NOT EXISTS valor_flete numeric(14,0);

ALTER TABLE public.ordenes_fabricacion DROP CONSTRAINT IF EXISTS ordenes_fabricacion_valor_flete_chk;
ALTER TABLE public.ordenes_fabricacion
  ADD CONSTRAINT ordenes_fabricacion_valor_flete_chk CHECK (valor_flete IS NULL OR valor_flete >= 0);

COMMENT ON COLUMN public.ordenes_fabricacion.valor_flete IS 'Valor del flete a facturar al cliente, en pesos (opcional).';
