-- ============================================================
-- Módulo Mantenimiento de equipos de planta
-- Fecha: 2026-10-29 — re-ejecutable
-- ============================================================
-- Tablas:
--   mant_equipos            ficha de cada equipo (área = bodega; NULL = General)
--   mant_tareas             plan preventivo por fechas (cada N días)
--   mant_ordenes            órdenes de trabajo correctivas y preventivas
--   mant_orden_costos       repuestos del inventario, compras aparte y servicios externos
--                           (separado de mant_ordenes para que los jefes no vean costos)
-- Permisos:
--   ADMIN: todo.
--   Jefes y demás roles con bodega (no CONSULTOR ni RRHH): ven los equipos de sus
--   bodegas y los de área General, su plan y sus órdenes, y pueden reportar fallas.
--   No ven costos.
-- Cerrar una orden lo hace mant_cerrar_orden() (solo ADMIN): guarda costos, descuenta
-- del inventario con una salida MNT-xxxx y deja el equipo y el plan al día, todo junto.

-- ---------- Tablas ----------
CREATE TABLE IF NOT EXISTS public.mant_equipos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text NOT NULL UNIQUE,
  nombre           text NOT NULL,
  marca            text,
  modelo           text,
  serie            text,
  bodega_id        uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  importancia      text NOT NULL DEFAULT 'importante' CHECK (importancia IN ('critico','importante','secundario')),
  estado           text NOT NULL DEFAULT 'operando'   CHECK (estado IN ('operando','mantenimiento','parado')),
  fecha_compra     date,
  garantia_hasta   date,
  foto_url         text,
  notas            text,
  costeo_equipo_id uuid REFERENCES public.costeo_equipos_planta(id) ON DELETE SET NULL,
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mant_tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id       uuid NOT NULL REFERENCES public.mant_equipos(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  frecuencia_dias integer NOT NULL CHECK (frecuencia_dias > 0),
  responsable     text NOT NULL DEFAULT 'interno' CHECK (responsable IN ('interno','externo')),
  ultima_fecha    date,
  proxima_fecha   date NOT NULL,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mant_ordenes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            text UNIQUE,
  equipo_id         uuid NOT NULL REFERENCES public.mant_equipos(id) ON DELETE CASCADE,
  tipo              text NOT NULL CHECK (tipo IN ('correctiva','preventiva')),
  tarea_id          uuid REFERENCES public.mant_tareas(id) ON DELETE SET NULL,
  estado            text NOT NULL DEFAULT 'reportada' CHECK (estado IN ('programada','reportada','en_reparacion','cerrada')),
  descripcion       text,
  foto_url          text,
  equipo_parado     boolean NOT NULL DEFAULT false,
  fecha_programada  date,
  reportado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reportado_at      timestamptz NOT NULL DEFAULT now(),
  inicio_paro       timestamptz,
  fin_paro          timestamptz,
  ejecutor_tipo     text CHECK (ejecutor_tipo IN ('interno','externo')),
  ejecutor_nombre   text,
  trabajo_realizado text,
  numero_salida     text,
  cerrada_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cerrada_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mant_orden_costos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id       uuid NOT NULL REFERENCES public.mant_ordenes(id) ON DELETE CASCADE,
  origen         text NOT NULL CHECK (origen IN ('inventario','compra','servicio')),
  item_id        uuid REFERENCES public.items(id) ON DELETE SET NULL,
  bodega_id      uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  descripcion    text NOT NULL,
  cantidad       numeric NOT NULL DEFAULT 1,
  costo_unitario numeric NOT NULL DEFAULT 0,
  costo_total    numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mant_tareas_equipo_idx   ON public.mant_tareas(equipo_id);
CREATE INDEX IF NOT EXISTS mant_ordenes_equipo_idx  ON public.mant_ordenes(equipo_id);
CREATE INDEX IF NOT EXISTS mant_ordenes_estado_idx  ON public.mant_ordenes(estado);
CREATE INDEX IF NOT EXISTS mant_costos_orden_idx    ON public.mant_orden_costos(orden_id);

-- ---------- ¿Quién ve un equipo? ----------
CREATE OR REPLACE FUNCTION public.mant_puede_ver_equipo(p_equipo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.get_my_rol() = 'ADMIN' THEN true
    WHEN public.get_my_rol() IS NULL OR public.get_my_rol() IN ('CONSULTOR','RRHH') THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.mant_equipos e
      WHERE e.id = p_equipo AND e.activo
        AND (e.bodega_id IS NULL
             OR e.bodega_id IN (SELECT bodega_id FROM public.profile_bodegas WHERE profile_id = auth.uid()))
    )
  END;
$$;

-- ---------- Número OT-0001 y equipo parado al reportar ----------
CREATE OR REPLACE FUNCTION public.mant_ordenes_antes_insertar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('mant_ordenes_numero'));
    SELECT 'OT-' || lpad((coalesce(max(substring(numero FROM 4)::int), 0) + 1)::text, 4, '0')
      INTO NEW.numero FROM public.mant_ordenes WHERE numero ~ '^OT-[0-9]+$';
  END IF;
  IF NEW.equipo_parado AND NEW.inicio_paro IS NULL THEN NEW.inicio_paro := NEW.reportado_at; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.mant_ordenes_despues_insertar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.equipo_parado THEN
    UPDATE public.mant_equipos SET estado = 'parado' WHERE id = NEW.equipo_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_mant_ordenes_antes ON public.mant_ordenes;
CREATE TRIGGER trg_mant_ordenes_antes BEFORE INSERT ON public.mant_ordenes
  FOR EACH ROW EXECUTE FUNCTION public.mant_ordenes_antes_insertar();
DROP TRIGGER IF EXISTS trg_mant_ordenes_despues ON public.mant_ordenes;
CREATE TRIGGER trg_mant_ordenes_despues AFTER INSERT ON public.mant_ordenes
  FOR EACH ROW EXECUTE FUNCTION public.mant_ordenes_despues_insertar();

-- ---------- Preventivas: se crean solas 7 días antes ----------
-- La app la llama al abrir Mantenimiento. No duplica: una tarea con una orden abierta se salta.
CREATE OR REPLACE FUNCTION public.mant_generar_preventivas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; t record;
BEGIN
  IF public.get_my_rol() IS NULL THEN RETURN 0; END IF;
  FOR t IN
    SELECT ta.* FROM public.mant_tareas ta JOIN public.mant_equipos e ON e.id = ta.equipo_id
    WHERE ta.activo AND e.activo
      AND ta.proxima_fecha <= (now() AT TIME ZONE 'America/Bogota')::date + 7
      AND NOT EXISTS (SELECT 1 FROM public.mant_ordenes o WHERE o.tarea_id = ta.id AND o.estado <> 'cerrada')
  LOOP
    INSERT INTO public.mant_ordenes (equipo_id, tipo, tarea_id, estado, descripcion, fecha_programada)
    VALUES (t.equipo_id, 'preventiva', t.id, 'programada', t.nombre, t.proxima_fecha);
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- ---------- Cerrar una orden (solo ADMIN) ----------
-- p_lineas: [{"origen":"inventario","item_id":..,"bodega_id":..,"cantidad":2},
--            {"origen":"compra","descripcion":"Termocupla","costo_total":185000},
--            {"origen":"servicio","descripcion":"Inductotherm, factura 123","costo_total":1850000}]
CREATE OR REPLACE FUNCTION public.mant_cerrar_orden(
  p_orden uuid, p_ejecutor_tipo text, p_ejecutor_nombre text, p_trabajo text,
  p_fin_paro timestamptz, p_lineas jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.mant_ordenes; e public.mant_equipos; l jsonb; it public.items; b public.bodegas;
  v_salida text; v_hoy date := (now() AT TIME ZONE 'America/Bogota')::date; v_cant numeric;
BEGIN
  IF public.get_my_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador puede cerrar órdenes de mantenimiento.';
  END IF;
  SELECT * INTO o FROM public.mant_ordenes WHERE id = p_orden FOR UPDATE;
  IF NOT FOUND OR o.estado = 'cerrada' THEN RAISE EXCEPTION 'La orden no existe o ya está cerrada.'; END IF;
  SELECT * INTO e FROM public.mant_equipos WHERE id = o.equipo_id;

  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) LOOP
    IF l->>'origen' = 'inventario' THEN
      v_cant := (l->>'cantidad')::numeric;
      IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida en un repuesto.'; END IF;
      SELECT * INTO it FROM public.items WHERE id = (l->>'item_id')::uuid;
      SELECT * INTO b  FROM public.bodegas WHERE id = (l->>'bodega_id')::uuid;
      IF it.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Repuesto o bodega no encontrados.'; END IF;
      IF v_salida IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('movimientos_MNT'));
        SELECT 'MNT-' || lpad((coalesce(max(substring(numero FROM 5)::int), 0) + 1)::text, 4, '0')
          INTO v_salida FROM public.movimientos WHERE numero ~ '^MNT-[0-9]+$';
      END IF;
      INSERT INTO public.movimientos (numero, tipo, item_id, bodega_origen_id, cantidad, precio_costo_snapshot,
        centro_costo, usuario_id, motivo, destino, fecha_movimiento)
      VALUES (v_salida, 'salida', it.id, b.id, v_cant, coalesce(it.precio_costo, 0), b.nombre, auth.uid(),
        'Mantenimiento ' || o.numero || ' · ' || e.nombre, 'Mantenimiento: ' || e.nombre, v_hoy);
      INSERT INTO public.mant_orden_costos (orden_id, origen, item_id, bodega_id, descripcion, cantidad, costo_unitario, costo_total)
      VALUES (o.id, 'inventario', it.id, b.id, it.nombre, v_cant, coalesce(it.precio_costo, 0), v_cant * coalesce(it.precio_costo, 0));
    ELSIF l->>'origen' IN ('compra','servicio') THEN
      INSERT INTO public.mant_orden_costos (orden_id, origen, descripcion, cantidad, costo_unitario, costo_total)
      VALUES (o.id, l->>'origen', coalesce(nullif(trim(l->>'descripcion'), ''), 'Sin descripción'), 1,
        coalesce((l->>'costo_total')::numeric, 0), coalesce((l->>'costo_total')::numeric, 0));
    END IF;
  END LOOP;

  UPDATE public.mant_ordenes SET
    estado = 'cerrada', ejecutor_tipo = p_ejecutor_tipo, ejecutor_nombre = nullif(trim(p_ejecutor_nombre), ''),
    trabajo_realizado = nullif(trim(p_trabajo), ''), numero_salida = v_salida,
    fin_paro = CASE WHEN o.inicio_paro IS NOT NULL THEN coalesce(p_fin_paro, now()) END,
    cerrada_por = auth.uid(), cerrada_at = now()
  WHERE id = o.id;

  -- El equipo vuelve a operar si no le queda otra orden abierta que lo tenga parado
  UPDATE public.mant_equipos SET estado = CASE
      WHEN EXISTS (SELECT 1 FROM public.mant_ordenes x WHERE x.equipo_id = e.id AND x.estado <> 'cerrada' AND x.equipo_parado) THEN 'parado'
      WHEN EXISTS (SELECT 1 FROM public.mant_ordenes x WHERE x.equipo_id = e.id AND x.estado = 'en_reparacion') THEN 'mantenimiento'
      ELSE 'operando' END
  WHERE id = e.id;

  -- Preventiva: la próxima fecha se cuenta desde el día en que se hizo
  IF o.tarea_id IS NOT NULL THEN
    UPDATE public.mant_tareas SET ultima_fecha = v_hoy, proxima_fecha = v_hoy + frecuencia_dias WHERE id = o.tarea_id;
  END IF;
  RETURN o.numero;
END; $$;

-- ---------- RLS ----------
ALTER TABLE public.mant_equipos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_tareas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_ordenes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mant_orden_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mant_equipos_select ON public.mant_equipos;
CREATE POLICY mant_equipos_select ON public.mant_equipos FOR SELECT TO authenticated USING (public.mant_puede_ver_equipo(id));
DROP POLICY IF EXISTS mant_equipos_admin ON public.mant_equipos;
CREATE POLICY mant_equipos_admin ON public.mant_equipos FOR ALL TO authenticated
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS mant_tareas_select ON public.mant_tareas;
CREATE POLICY mant_tareas_select ON public.mant_tareas FOR SELECT TO authenticated USING (public.mant_puede_ver_equipo(equipo_id));
DROP POLICY IF EXISTS mant_tareas_admin ON public.mant_tareas;
CREATE POLICY mant_tareas_admin ON public.mant_tareas FOR ALL TO authenticated
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS mant_ordenes_select ON public.mant_ordenes;
CREATE POLICY mant_ordenes_select ON public.mant_ordenes FOR SELECT TO authenticated USING (public.mant_puede_ver_equipo(equipo_id));
DROP POLICY IF EXISTS mant_ordenes_reportar ON public.mant_ordenes;
CREATE POLICY mant_ordenes_reportar ON public.mant_ordenes FOR INSERT TO authenticated
  WITH CHECK (public.mant_puede_ver_equipo(equipo_id) AND tipo = 'correctiva' AND estado = 'reportada'
              AND reportado_por = auth.uid());
DROP POLICY IF EXISTS mant_ordenes_admin ON public.mant_ordenes;
CREATE POLICY mant_ordenes_admin ON public.mant_ordenes FOR ALL TO authenticated
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS mant_costos_admin ON public.mant_orden_costos;
CREATE POLICY mant_costos_admin ON public.mant_orden_costos FOR ALL TO authenticated
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');

REVOKE ALL ON FUNCTION public.mant_cerrar_orden(uuid, text, text, text, timestamptz, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.mant_generar_preventivas() FROM anon;
REVOKE ALL ON FUNCTION public.mant_puede_ver_equipo(uuid) FROM anon;

-- ---------- Fotos (fallas y equipos) ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('mantenimiento', 'mantenimiento', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS mantenimiento_insert ON storage.objects;
CREATE POLICY mantenimiento_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mantenimiento' AND public.get_my_rol() IS NOT NULL AND public.get_my_rol() NOT IN ('CONSULTOR','RRHH'));
DROP POLICY IF EXISTS mantenimiento_select ON storage.objects;
CREATE POLICY mantenimiento_select ON storage.objects FOR SELECT USING (bucket_id = 'mantenimiento');
DROP POLICY IF EXISTS mantenimiento_delete ON storage.objects;
CREATE POLICY mantenimiento_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mantenimiento' AND public.get_my_rol() = 'ADMIN');
