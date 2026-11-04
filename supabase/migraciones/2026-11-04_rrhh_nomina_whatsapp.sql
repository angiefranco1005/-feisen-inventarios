-- ============================================================
-- Migración: RRHH nómina — comprobante enviado por WhatsApp
-- Fecha: 2026-11-04
-- ============================================================
-- Se puede correr varias veces.
-- RRHH envía el comprobante desde el WhatsApp de la empresa (enlace wa.me con
-- un enlace firmado de 30 días al PDF). Aquí queda cuándo y a qué número.

ALTER TABLE public.nomina_liquidaciones
  ADD COLUMN IF NOT EXISTS whatsapp_enviado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_enviado_a  TEXT;
