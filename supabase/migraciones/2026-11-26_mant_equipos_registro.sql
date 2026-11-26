-- ============================================================
-- Mantenimiento › Ficha del equipo con todos los datos del formato FO-MAN-001 «Registro de equipo»
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- Identificación y datos técnicos quedan en mant_equipos (los jefes ven su ficha).
-- El valor del equipo (valor del activo, saldo por depreciar, vida útil, tarifa kWh, centro de costo,
-- horas al año y mantenimiento anual) sigue en costeo_equipos_planta, que tiene RLS solo ADMIN /
-- acceso_costeo: la app crea o actualiza esa fila desde la ficha y la deja vinculada (costeo_equipo_id).
-- Los kW de Costeo se calculan de la potencia de placa (HP × 0,746 · CV × 0,7355).

ALTER TABLE public.mant_equipos
  ADD COLUMN IF NOT EXISTS anio_fabricacion   integer,
  ADD COLUMN IF NOT EXISTS ubicacion          text,
  ADD COLUMN IF NOT EXISTS funcion            text,      -- qué hace / qué produce
  ADD COLUMN IF NOT EXISTS proveedor          text,
  ADD COLUMN IF NOT EXISTS proveedor_telefono text,
  ADD COLUMN IF NOT EXISTS estado_llegada     text,
  ADD COLUMN IF NOT EXISTS fuentes_energia    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voltaje            text,      -- '110 V', '220 V', '440 V' u otro
  ADD COLUMN IF NOT EXISTS fases              text,
  ADD COLUMN IF NOT EXISTS amperaje           numeric,
  ADD COLUMN IF NOT EXISTS frecuencia_hz      numeric,
  ADD COLUMN IF NOT EXISTS potencia           numeric,
  ADD COLUMN IF NOT EXISTS potencia_unidad    text,
  ADD COLUMN IF NOT EXISTS num_motores        integer,
  ADD COLUMN IF NOT EXISTS consumo_combustible text,     -- m³ o galones por hora, con la unidad
  ADD COLUMN IF NOT EXISTS capacidad          text,
  ADD COLUMN IF NOT EXISTS servicios          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activo_fijo        text;      -- n.º de activo fijo / placa contable

ALTER TABLE public.mant_equipos DROP CONSTRAINT IF EXISTS mant_equipos_estado_llegada_check;
ALTER TABLE public.mant_equipos ADD CONSTRAINT mant_equipos_estado_llegada_check
  CHECK (estado_llegada IS NULL OR estado_llegada IN ('nuevo', 'usado', 'reconstruido'));
ALTER TABLE public.mant_equipos DROP CONSTRAINT IF EXISTS mant_equipos_fases_check;
ALTER TABLE public.mant_equipos ADD CONSTRAINT mant_equipos_fases_check
  CHECK (fases IS NULL OR fases IN ('monofasico', 'trifasico'));
ALTER TABLE public.mant_equipos DROP CONSTRAINT IF EXISTS mant_equipos_potencia_unidad_check;
ALTER TABLE public.mant_equipos ADD CONSTRAINT mant_equipos_potencia_unidad_check
  CHECK (potencia_unidad IS NULL OR potencia_unidad IN ('kW', 'HP', 'CV'));

-- Un equipo de Costeo vinculado a una sola ficha de Mantenimiento
CREATE UNIQUE INDEX IF NOT EXISTS mant_equipos_costeo_unico
  ON public.mant_equipos (costeo_equipo_id) WHERE costeo_equipo_id IS NOT NULL;
