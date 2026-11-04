-- ============================================================
-- Planillas de producción (destajo) y seriales de máquina
-- Fecha: 2026-11-04 — se aplica con el conector de Supabase (o SQL Editor).
-- Es idempotente: se puede correr más de una vez.
-- ============================================================
-- Proceso real (Angie, 04/11/2026): el jefe de planta reparte el trabajo; cada
-- contratista llena una planilla de papel con lo que hizo (tarea + cantidad; en
-- las máquinas completas, el número de cada máquina) y el jefe la recibe y firma.
--   · William (JEFE_ENSAMBLE) pasa la planilla a la app. Nunca va contra una OF.
--   · RRHH carga esas piezas a la quincena del contratista (al valor de la tarifa).
--   · Cada máquina completa queda con su serial (consecutivo único de la empresa);
--     ventas lo asigna al registrar la entrega de la OF → trazabilidad
--     quién la hizo → a qué OF/cliente se despachó.
-- Las piezas sueltas (cabina, pedal…) no llevan número. Por ahora no mueve inventario.

-- 1. Permisos por módulo (rol_permisos vía mi_nivel; ADMIN siempre 'todo') -----
CREATE OR REPLACE FUNCTION public.ensamble_puede()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mi_nivel('ensamble') IN ('registra', 'todo')
$$;

CREATE OR REPLACE FUNCTION public.rrhh_puede()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mi_nivel('rrhh') IN ('registra', 'todo')
$$;

-- 2. Tablas -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planillas_produccion (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero         TEXT NOT NULL UNIQUE,                               -- PP-0001
  empleado_id    UUID NOT NULL REFERENCES public.empleados(id),      -- contratista
  fecha          DATE NOT NULL,                                      -- define la quincena
  notas          TEXT,
  registrado_por UUID NOT NULL REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planillas_produccion_empleado_fecha_idx ON public.planillas_produccion(empleado_id, fecha);

CREATE TABLE IF NOT EXISTS public.planilla_lineas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planilla_id     UUID NOT NULL REFERENCES public.planillas_produccion(id) ON DELETE CASCADE,
  tarifa_id       UUID REFERENCES public.nomina_tarifas(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,                                     -- copia del nombre de la tarea
  cantidad        NUMERIC(18, 3) NOT NULL CHECK (cantidad > 0),
  modelo          TEXT,                                              -- solo máquina completa (of_productos.nombre)
  liquidacion_id  UUID REFERENCES public.nomina_liquidaciones(id) ON DELETE SET NULL, -- ya cargada a nómina
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planilla_lineas_planilla_idx ON public.planilla_lineas(planilla_id);

CREATE TABLE IF NOT EXISTS public.seriales_maquina (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial             TEXT NOT NULL,
  modelo             TEXT NOT NULL,
  planilla_linea_id  UUID REFERENCES public.planilla_lineas(id) ON DELETE CASCADE,
  empleado_id        UUID REFERENCES public.empleados(id),           -- quién la armó
  hecha_por          TEXT,                                            -- copia del nombre: ventas no lee empleados
  fecha_fabricacion  DATE,
  estado             TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'despachada')),
  item_of_id         UUID REFERENCES public.items_of(id) ON DELETE SET NULL,
  of_entrega_id      UUID REFERENCES public.of_entregas(id) ON DELETE SET NULL,
  despachado_en      TIMESTAMPTZ,
  despachado_por     UUID REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS seriales_maquina_serial_uidx ON public.seriales_maquina (upper(btrim(serial)));
CREATE INDEX IF NOT EXISTS seriales_maquina_item_of_idx ON public.seriales_maquina(item_of_id);

-- 3. RLS ----------------------------------------------------------------------
ALTER TABLE public.planillas_produccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilla_lineas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seriales_maquina     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planillas_select ON public.planillas_produccion;
DROP POLICY IF EXISTS planillas_insert ON public.planillas_produccion;
DROP POLICY IF EXISTS planillas_update ON public.planillas_produccion;
DROP POLICY IF EXISTS planillas_delete ON public.planillas_produccion;
DROP POLICY IF EXISTS planilla_lineas_select ON public.planilla_lineas;
DROP POLICY IF EXISTS planilla_lineas_insert ON public.planilla_lineas;
DROP POLICY IF EXISTS planilla_lineas_update ON public.planilla_lineas;
DROP POLICY IF EXISTS planilla_lineas_delete ON public.planilla_lineas;
DROP POLICY IF EXISTS seriales_maquina_select ON public.seriales_maquina;
DROP POLICY IF EXISTS seriales_maquina_insert ON public.seriales_maquina;
DROP POLICY IF EXISTS seriales_maquina_update ON public.seriales_maquina;
DROP POLICY IF EXISTS seriales_maquina_delete ON public.seriales_maquina;

-- Planillas: Ensamble las maneja; RRHH las lee para la nómina.
CREATE POLICY planillas_select ON public.planillas_produccion FOR SELECT
  USING (public.ensamble_puede() OR public.rrhh_puede());
CREATE POLICY planillas_insert ON public.planillas_produccion FOR INSERT
  WITH CHECK (public.ensamble_puede() AND registrado_por = auth.uid());
CREATE POLICY planillas_update ON public.planillas_produccion FOR UPDATE
  USING (public.ensamble_puede()) WITH CHECK (public.ensamble_puede());
-- No se borra si ya se cargó algo a nómina o se despachó alguna de sus máquinas
-- (el borrado en cascada de líneas/seriales no pasa por RLS, por eso se revisa aquí).
CREATE POLICY planillas_delete ON public.planillas_produccion FOR DELETE
  USING (public.ensamble_puede()
    AND NOT EXISTS (SELECT 1 FROM public.planilla_lineas l WHERE l.planilla_id = planillas_produccion.id AND l.liquidacion_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.seriales_maquina s JOIN public.planilla_lineas l ON l.id = s.planilla_linea_id
                    WHERE l.planilla_id = planillas_produccion.id AND s.estado = 'despachada'));

CREATE POLICY planilla_lineas_select ON public.planilla_lineas FOR SELECT
  USING (public.ensamble_puede() OR public.rrhh_puede());
CREATE POLICY planilla_lineas_insert ON public.planilla_lineas FOR INSERT
  WITH CHECK (public.ensamble_puede() AND liquidacion_id IS NULL);
CREATE POLICY planilla_lineas_update ON public.planilla_lineas FOR UPDATE
  USING (public.ensamble_puede() AND liquidacion_id IS NULL)
  WITH CHECK (public.ensamble_puede() AND liquidacion_id IS NULL);
CREATE POLICY planilla_lineas_delete ON public.planilla_lineas FOR DELETE
  USING (public.ensamble_puede() AND liquidacion_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.seriales_maquina s WHERE s.planilla_linea_id = planilla_lineas.id AND s.estado = 'despachada'));

-- Seriales: todos los ven (trazabilidad); Ensamble crea/corrige los que no se han despachado.
-- Despachar/liberar va por las funciones de abajo (permiso de OF), no por UPDATE directo.
CREATE POLICY seriales_maquina_select ON public.seriales_maquina FOR SELECT
  USING (public.get_my_rol() IS NOT NULL);
CREATE POLICY seriales_maquina_insert ON public.seriales_maquina FOR INSERT
  WITH CHECK (public.ensamble_puede() AND estado = 'disponible');
CREATE POLICY seriales_maquina_update ON public.seriales_maquina FOR UPDATE
  USING (public.ensamble_puede() AND estado = 'disponible')
  WITH CHECK (public.ensamble_puede() AND estado = 'disponible');
CREATE POLICY seriales_maquina_delete ON public.seriales_maquina FOR DELETE
  USING (public.ensamble_puede() AND estado = 'disponible');

-- 4. Listas para William (empleados y tarifas son solo de RRHH/Admin) ---------
-- Solo nombres; los valores de las tarifas no salen de RRHH.
CREATE OR REPLACE FUNCTION public.ensamble_contratistas()
RETURNS TABLE (id uuid, nombre text, area text, tipo_vinculacion text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.ensamble_puede() OR public.rrhh_puede()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  RETURN QUERY
    SELECT e.id, btrim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')), e.area, e.tipo_vinculacion
    FROM public.empleados e
    WHERE e.estado IS DISTINCT FROM 'retirado'
    ORDER BY 2;
END $$;

CREATE OR REPLACE FUNCTION public.ensamble_tareas()
RETURNS TABLE (id uuid, descripcion text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.ensamble_puede() OR public.rrhh_puede()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  RETURN QUERY SELECT t.id, t.descripcion FROM public.nomina_tarifas t WHERE t.activo ORDER BY t.descripcion;
END $$;

-- 5. Nómina: RRHH marca las líneas que ya cargó a una liquidación -------------
CREATE OR REPLACE FUNCTION public.marcar_lineas_planilla(p_lineas uuid[], p_liquidacion uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.rrhh_puede() THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  UPDATE public.planilla_lineas SET liquidacion_id = p_liquidacion
  WHERE id = ANY(p_lineas) AND liquidacion_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Las piezas traídas de una planilla quedan con origen 'planilla' en nomina_piezas
ALTER TABLE public.nomina_piezas DROP CONSTRAINT IF EXISTS nomina_piezas_origen_check;
ALTER TABLE public.nomina_piezas ADD CONSTRAINT nomina_piezas_origen_check
  CHECK (origen = ANY (ARRAY['moldeo', 'mecanizado', 'manual', 'planilla']));

-- 6. Ventas: seriales en la entrega de una OF ---------------------------------
CREATE OR REPLACE FUNCTION public.asignar_seriales_entrega(p_entrega uuid, p_seriales uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item uuid; v_cant numeric; n integer;
BEGIN
  IF NOT public.of_puede_crear() THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT item_id, cantidad INTO v_item, v_cant FROM public.of_entregas WHERE id = p_entrega AND tipo IS DISTINCT FROM 'reversion';
  IF v_item IS NULL THEN RAISE EXCEPTION 'Entrega no encontrada'; END IF;
  IF coalesce(array_length(p_seriales, 1), 0) > v_cant THEN
    RAISE EXCEPTION 'Hay más máquinas seleccionadas (%) que unidades entregadas (%)', array_length(p_seriales, 1), v_cant;
  END IF;
  UPDATE public.seriales_maquina
  SET estado = 'despachada', of_entrega_id = p_entrega, item_of_id = v_item,
      despachado_en = NOW(), despachado_por = auth.uid()
  WHERE id = ANY(p_seriales) AND estado = 'disponible';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> coalesce(array_length(p_seriales, 1), 0) THEN
    RAISE EXCEPTION 'Alguna de las máquinas ya fue despachada. Actualiza e intenta de nuevo.';
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.liberar_seriales(p_seriales uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.of_puede_crear() THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  UPDATE public.seriales_maquina
  SET estado = 'disponible', of_entrega_id = NULL, item_of_id = NULL, despachado_en = NULL, despachado_por = NULL
  WHERE id = ANY(p_seriales) AND estado = 'despachada';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.ensamble_contratistas(), public.ensamble_tareas(),
  public.marcar_lineas_planilla(uuid[], uuid), public.asignar_seriales_entrega(uuid, uuid[]),
  public.liberar_seriales(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ensamble_puede(), public.rrhh_puede(), public.ensamble_contratistas(), public.ensamble_tareas(),
  public.marcar_lineas_planilla(uuid[], uuid), public.asignar_seriales_entrega(uuid, uuid[]),
  public.liberar_seriales(uuid[]) TO authenticated;
