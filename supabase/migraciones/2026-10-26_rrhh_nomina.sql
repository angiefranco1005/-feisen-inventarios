-- ============================================================
-- Migración: RRHH — Nómina quincenal por persona
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Reemplaza la planilla de Excel "NOM" (hojas C/F por quincena). Tres formas
-- de pago (según el contrato en la ficha):
--   • destajo: piezas × valor de la pieza (tarifa por ítem)
--   • día:     días trabajados × valor del día + horas extra × valor hora
--   • fijo:    valor fijo por quincena (personal de planta)
-- Todos pueden tener auxilio por quincena, subsidio a la seguridad social,
-- otros devengos, descuento por tiempo o pieza dañada, y deducciones:
-- seguridad social (Feisen paga la planilla y la descuenta), anticipo,
-- dotación/herramienta y otras.
-- Decisión de Angie: NO se calculan deducciones de ley (salud/pensión 4 %) ni
-- auxilio de transporte legal; eso lo maneja el contador.

-- 1. Parámetros de pago en la ficha ----------------------------------------
ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS valor_dia            NUMERIC(14, 2),   -- contratista al día
  ADD COLUMN IF NOT EXISTS valor_quincena       NUMERIC(14, 2),   -- planta (fijo)
  ADD COLUMN IF NOT EXISTS valor_hora_extra     NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS auxilio_quincenal    NUMERIC(14, 2),   -- p. ej. 130.000
  ADD COLUMN IF NOT EXISTS subsidio_ss          NUMERIC(14, 2),   -- lo que Feisen reconoce (270.500 / 150.000)
  ADD COLUMN IF NOT EXISTS aporte_ss            NUMERIC(14, 2);   -- planilla que se le descuenta (270.500)

-- 2. Tarifas de destajo (valor por pieza) ----------------------------------
-- Ojo: cada bodega tiene su propio renglón de `items`, así que la pieza
-- moldeada (Fundición) y la mecanizada (Mecanizados) son ítems distintos y
-- cada una tiene su tarifa.
CREATE TABLE IF NOT EXISTS public.nomina_tarifas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID UNIQUE REFERENCES public.items(id) ON DELETE CASCADE,
  descripcion TEXT,                 -- para piezas/trabajos que no son un ítem
  valor       NUMERIC(14, 2) NOT NULL CHECK (valor >= 0),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_id IS NOT NULL OR descripcion IS NOT NULL)
);

-- 3. Nombres usados en producción → colaborador ----------------------------
-- En moldeo (asignado_a) y mecanizado ("Mecanizado por: …") el operario se
-- escribe a mano; aquí se enlaza ese nombre con su ficha.
CREATE TABLE IF NOT EXISTS public.nomina_alias (
  alias        TEXT PRIMARY KEY,    -- nombre normalizado (MAYÚSCULAS, sin tildes, espacios simples)
  empleado_id  UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Quincenas -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nomina_periodos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anio          SMALLINT NOT NULL,
  mes           SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  quincena      SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'cerrada')),
  creado_por    UUID REFERENCES public.profiles(id),
  cerrada_por   UUID REFERENCES public.profiles(id),
  cerrada_en    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, mes, quincena)
);

-- 5. Liquidación de cada persona en una quincena ---------------------------
CREATE TABLE IF NOT EXISTS public.nomina_liquidaciones (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periodo_id            UUID NOT NULL REFERENCES public.nomina_periodos(id) ON DELETE CASCADE,
  empleado_id           UUID NOT NULL REFERENCES public.empleados(id) ON DELETE RESTRICT,
  modalidad             TEXT NOT NULL CHECK (modalidad IN ('destajo', 'dia', 'fijo')),

  dias                  NUMERIC(6, 2),
  valor_dia             NUMERIC(14, 2),
  horas_extra           NUMERIC(6, 2),
  valor_hora_extra      NUMERIC(14, 2),
  valor_fijo            NUMERIC(14, 2),
  auxilio               NUMERIC(14, 2),
  subsidio_ss           NUMERIC(14, 2),
  otros_devengos        JSONB NOT NULL DEFAULT '[]',   -- [{concepto, valor}]
  descuento_tiempo_pieza NUMERIC(14, 2),

  seguridad             NUMERIC(14, 2),
  anticipo              NUMERIC(14, 2),
  dotacion_herramienta  NUMERIC(14, 2),
  otras_deducciones     JSONB NOT NULL DEFAULT '[]',   -- [{concepto, valor}]

  -- Totales guardados al momento de liquidar (para reportes rápidos)
  total_piezas          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_devengado       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_deducciones     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  neto                  NUMERIC(14, 2) NOT NULL DEFAULT 0,

  observaciones         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, empleado_id)
);

-- 6. Piezas de destajo de cada liquidación ---------------------------------
CREATE TABLE IF NOT EXISTS public.nomina_piezas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liquidacion_id  UUID NOT NULL REFERENCES public.nomina_liquidaciones(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES public.items(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  valor_unitario  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  origen          TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('moldeo', 'mecanizado', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_nomina_liq_periodo  ON public.nomina_liquidaciones(periodo_id);
CREATE INDEX IF NOT EXISTS idx_nomina_liq_empleado ON public.nomina_liquidaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_nomina_piezas_liq   ON public.nomina_piezas(liquidacion_id);

DROP TRIGGER IF EXISTS trg_nomina_liq_updated_at ON public.nomina_liquidaciones;
CREATE TRIGGER trg_nomina_liq_updated_at BEFORE UPDATE ON public.nomina_liquidaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();
DROP TRIGGER IF EXISTS trg_nomina_tarifas_updated_at ON public.nomina_tarifas;
CREATE TRIGGER trg_nomina_tarifas_updated_at BEFORE UPDATE ON public.nomina_tarifas
  FOR EACH ROW EXECUTE FUNCTION public.fn_empleados_updated_at();

-- 7. Seguridad: solo ADMIN y RRHH ------------------------------------------
ALTER TABLE public.nomina_tarifas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_alias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_periodos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_piezas        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nomina_tarifas_rrhh_admin" ON public.nomina_tarifas FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
CREATE POLICY "nomina_alias_rrhh_admin" ON public.nomina_alias FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
CREATE POLICY "nomina_periodos_rrhh_admin" ON public.nomina_periodos FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
CREATE POLICY "nomina_liquidaciones_rrhh_admin" ON public.nomina_liquidaciones FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));
CREATE POLICY "nomina_piezas_rrhh_admin" ON public.nomina_piezas FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'RRHH')) WITH CHECK (public.get_my_rol() IN ('ADMIN', 'RRHH'));

-- 8. RRHH puede LEER la producción para sugerir las piezas de destajo ------
-- (ítems, órdenes de moldeo, avances y movimientos de mecanizado). Solo
-- lectura: las políticas son permisivas y se suman a las que ya existen, así
-- que no le quitan acceso a ningún otro rol.
DROP POLICY IF EXISTS "rrhh_select_items" ON public.items;
CREATE POLICY "rrhh_select_items" ON public.items FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
DROP POLICY IF EXISTS "rrhh_select_ordenes_moldeo" ON public.ordenes_moldeo;
CREATE POLICY "rrhh_select_ordenes_moldeo" ON public.ordenes_moldeo FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
DROP POLICY IF EXISTS "rrhh_select_ordenes_moldeo_piezas" ON public.ordenes_moldeo_piezas;
CREATE POLICY "rrhh_select_ordenes_moldeo_piezas" ON public.ordenes_moldeo_piezas FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
DROP POLICY IF EXISTS "rrhh_select_ordenes_moldeo_avances" ON public.ordenes_moldeo_avances;
CREATE POLICY "rrhh_select_ordenes_moldeo_avances" ON public.ordenes_moldeo_avances FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
DROP POLICY IF EXISTS "rrhh_select_movimientos" ON public.movimientos;
CREATE POLICY "rrhh_select_movimientos" ON public.movimientos FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
DROP POLICY IF EXISTS "rrhh_select_bodegas" ON public.bodegas;
CREATE POLICY "rrhh_select_bodegas" ON public.bodegas FOR SELECT
  USING (public.get_my_rol() = 'RRHH');
