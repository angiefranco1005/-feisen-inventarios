-- ============================================================
-- EEFF: valores que Angie pone a mano por mes (Finanzas › EEFF)
-- Fecha: 2026-11-11 — re-ejecutable
-- ============================================================
-- Lo que no está en Odoo ni en el ERP: p. ej. la transferencia interna de Aluminio a Construequipos
-- (Aluminio todavía no registra sus salidas en el ERP). Una fila por mes + concepto + empresa. Solo ADMIN.

CREATE TABLE IF NOT EXISTS public.eeff_manual (
  mes        text NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  concepto   text NOT NULL,
  empresa    text NOT NULL DEFAULT 'total' CHECK (empresa IN ('feisen','fc','total')),
  valor      numeric NOT NULL,
  nota       text,
  actualizado_por uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, concepto, empresa)
);

ALTER TABLE public.eeff_manual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eeff_manual_admin ON public.eeff_manual;
CREATE POLICY eeff_manual_admin ON public.eeff_manual FOR ALL
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');
