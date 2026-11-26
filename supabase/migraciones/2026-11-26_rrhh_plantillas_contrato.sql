-- ============================================================
-- Migración: RRHH — plantillas de contrato por cargo
-- Fecha: 2026-11-26
-- Ejecutar en Supabase Dashboard > SQL Editor (se puede correr varias veces)
-- ============================================================
-- Pedido de Angie: cada cargo tiene sus plantillas de contrato en Word, una por tipo
-- de contrato (un mismo cargo puede contratarse de varias formas). El archivo va en el
-- bucket privado 'rrhh' (plantillas-contrato/<cargo>/…). Al generar el contrato de una
-- persona se llena la plantilla con su ficha y se guarda en sus documentos ("Contrato").

CREATE TABLE IF NOT EXISTS public.cargo_plantillas_contrato (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id        UUID NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  tipo_contrato   TEXT NOT NULL,            -- uno de TIPOS_CONTRATO (catalogosRRHH.js)
  nombre          TEXT,                     -- nombre visible (opcional)
  path            TEXT NOT NULL,            -- archivo en el bucket rrhh
  archivo_nombre  TEXT NOT NULL,
  creado_por      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plantillas_contrato_cargo ON public.cargo_plantillas_contrato(cargo_id);

ALTER TABLE public.cargo_plantillas_contrato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cargo_plantillas_contrato_rrhh_admin" ON public.cargo_plantillas_contrato;
CREATE POLICY "cargo_plantillas_contrato_rrhh_admin" ON public.cargo_plantillas_contrato FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- Verificación
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cargo_plantillas_contrato';
