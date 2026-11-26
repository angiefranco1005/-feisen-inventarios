-- ============================================================
-- Ventas › Consecutivos de equipos (reemplaza el Excel «CONSECUTIVO EQUIPOS»)
-- Fecha: 2026-11-26 — re-ejecutable
-- ============================================================
-- Cada equipo fabricado tiene un consecutivo por tipo (mezcladora 25768, rana 4682, pluma 4241…).
-- Al vender, el asesor escribe los consecutivos en las notas de la cotización / factura de Odoo:
--   «OF-0553 · REF 25753/ 4677, 4682/ 2158/ 25764» (grupos separados por «/» en el orden de los productos).
-- La función consecutivos-odoo lee las facturas de Odoo Feisen y Odoo FC y llena esta tabla.
-- El histórico se carga una vez desde el Excel (botón «Importar Excel», solo ADMIN).
--
-- origen 'excel' = vino del Excel; 'odoo' = lo leyó la función. Una fila del Excel que luego aparece en
-- Odoo (mismo tipo, consecutivo y documento) se queda como 'excel' con odoo_ref lleno (= confirmada en Odoo).

CREATE TABLE IF NOT EXISTS public.equipos_consecutivos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL,              -- mezcla, rana, pluma… (ver tiposEquipo.js)
  consecutivo    text NOT NULL,
  consecutivo_num bigint GENERATED ALWAYS AS (
                   CASE WHEN consecutivo ~ '^\d{1,15}$' THEN consecutivo::bigint END) STORED,
  fecha          date,
  numero_of      integer,
  cliente        text,
  capacidad      text,
  documento      text NOT NULL DEFAULT '',   -- CF6351 (Feisen), CF/2026/00791 (FC), COT/…, remisión vieja
  empresa        text CHECK (empresa IN ('feisen', 'fc')),
  origen         text NOT NULL CHECK (origen IN ('excel', 'odoo')),
  odoo_ref       text,                       -- 'feisen:move:9185' · 'fc:so:1408'
  producto_odoo  text,
  observacion    text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, consecutivo, documento)
);
CREATE INDEX IF NOT EXISTS equipos_consecutivos_tipo_num ON public.equipos_consecutivos (tipo, consecutivo_num DESC);
CREATE INDEX IF NOT EXISTS equipos_consecutivos_ref ON public.equipos_consecutivos (odoo_ref);

-- Quién la ve: administración y ventas (OF con Registra o Todo)
CREATE OR REPLACE FUNCTION public.consecutivos_puede_ver()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.get_my_rol() = 'ADMIN' OR public.mi_nivel('of') IN ('registra', 'todo'), false);
$$;
REVOKE EXECUTE ON FUNCTION public.consecutivos_puede_ver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consecutivos_puede_ver() TO authenticated, service_role;

ALTER TABLE public.equipos_consecutivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipos_consecutivos_select ON public.equipos_consecutivos;
CREATE POLICY equipos_consecutivos_select ON public.equipos_consecutivos FOR SELECT
  USING ((SELECT public.consecutivos_puede_ver()));   -- SELECT: se evalúa una vez por consulta, no por fila
-- Sin políticas de escritura: se escribe solo con las dos funciones de abajo.

-- Conteo por tipo para las pestañas (con la RLS de quien consulta)
CREATE OR REPLACE FUNCTION public.consecutivos_resumen()
RETURNS TABLE (tipo text, n bigint, ultimo bigint, ultima_lectura timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT tipo, count(*), max(consecutivo_num), max(actualizado_en) FILTER (WHERE odoo_ref IS NOT NULL)
  FROM public.equipos_consecutivos GROUP BY tipo;
$$;
REVOKE EXECUTE ON FUNCTION public.consecutivos_resumen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consecutivos_resumen() TO authenticated;

-- Facturas de Odoo con algo por revisar: equipos sin consecutivo, faltan consecutivos, o no se supo
-- de qué equipo es cada número. Se rehace en cada lectura.
CREATE TABLE IF NOT EXISTS public.equipos_consecutivos_avisos (
  odoo_ref   text PRIMARY KEY,
  documento  text NOT NULL,
  empresa    text NOT NULL,
  fecha      date,
  cliente    text,
  numero_of  integer,
  problema   text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.equipos_consecutivos_avisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipos_consecutivos_avisos_select ON public.equipos_consecutivos_avisos;
CREATE POLICY equipos_consecutivos_avisos_select ON public.equipos_consecutivos_avisos FOR SELECT
  USING ((SELECT public.consecutivos_puede_ver()));   -- SELECT: se evalúa una vez por consulta, no por fila

-- Carga del Excel (solo ADMIN). Reemplaza todo lo que vino del Excel; lo de Odoo no se toca.
-- p_filas: [{t, c, f, of, cl, cap, d, e, obs}]
CREATE OR REPLACE FUNCTION public.consecutivos_importar_excel(p_filas jsonb, p_reemplazar boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF coalesce(public.get_my_rol(), '') <> 'ADMIN' THEN
    RAISE EXCEPTION 'Solo administración puede importar el Excel de consecutivos.';
  END IF;
  IF p_reemplazar THEN DELETE FROM public.equipos_consecutivos WHERE origen = 'excel'; END IF;
  INSERT INTO public.equipos_consecutivos (tipo, consecutivo, fecha, numero_of, cliente, capacidad, documento, empresa, origen, observacion)
  SELECT DISTINCT ON (f->>'t', f->>'c', coalesce(f->>'d',''))
         f->>'t', f->>'c', nullif(f->>'f','')::date, nullif(f->>'of','')::integer,
         nullif(f->>'cl',''), nullif(f->>'cap',''), coalesce(f->>'d',''), nullif(f->>'e',''), 'excel', nullif(f->>'obs','')
  FROM jsonb_array_elements(p_filas) f
  WHERE coalesce(f->>'t','') <> '' AND coalesce(f->>'c','') <> ''
  ON CONFLICT (tipo, consecutivo, documento) DO UPDATE SET   -- ya estaba (leído de Odoo): Odoo manda
    fecha = coalesce(equipos_consecutivos.fecha, EXCLUDED.fecha),
    numero_of = coalesce(equipos_consecutivos.numero_of, EXCLUDED.numero_of),
    cliente = coalesce(equipos_consecutivos.cliente, EXCLUDED.cliente),
    capacidad = coalesce(equipos_consecutivos.capacidad, EXCLUDED.capacidad),
    observacion = coalesce(EXCLUDED.observacion, equipos_consecutivos.observacion),
    actualizado_en = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consecutivos_importar_excel(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consecutivos_importar_excel(jsonb, boolean) TO authenticated;

-- Lo que leyó la función de Odoo (solo la llave de servicio).
-- p_refs: documentos de Odoo revisados en esta corrida; sus filas 'odoo' se rehacen (si cambió la nota, queda lo nuevo).
-- p_prefijos: además se borran las filas 'odoo' cuyo odoo_ref coincida (ej. 'fc:so:%': las cotizaciones sin
--   factura se rehacen completas, así una que ya se facturó no queda repetida con su número de cotización).
-- p_filas: [{t, c, f, of, cl, cap, d, e, ref, p}] · p_avisos: [{ref, d, e, f, cl, of, pr}]
DROP FUNCTION IF EXISTS public.consecutivos_cargar_odoo(text[], jsonb);
CREATE OR REPLACE FUNCTION public.consecutivos_cargar_odoo(p_refs text[], p_prefijos text[], p_filas jsonb, p_avisos jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Solo la actualización automática puede cargar consecutivos de Odoo.';
  END IF;
  DELETE FROM public.equipos_consecutivos
   WHERE origen = 'odoo' AND (odoo_ref = ANY (p_refs) OR odoo_ref LIKE ANY (p_prefijos));
  UPDATE public.equipos_consecutivos SET odoo_ref = NULL
   WHERE origen = 'excel' AND (odoo_ref = ANY (p_refs) OR odoo_ref LIKE ANY (p_prefijos));
  INSERT INTO public.equipos_consecutivos (tipo, consecutivo, fecha, numero_of, cliente, capacidad, documento, empresa, origen, odoo_ref, producto_odoo)
  SELECT DISTINCT ON (f->>'t', f->>'c', coalesce(f->>'d',''))
         f->>'t', f->>'c', nullif(f->>'f','')::date, nullif(f->>'of','')::integer, nullif(f->>'cl',''),
         nullif(f->>'cap',''), coalesce(f->>'d',''), f->>'e', 'odoo', f->>'ref', nullif(f->>'p','')
  FROM jsonb_array_elements(p_filas) f
  WHERE coalesce(f->>'t','') <> '' AND coalesce(f->>'c','') <> ''
  ON CONFLICT (tipo, consecutivo, documento) DO UPDATE SET
    -- Ya estaba (del Excel): Odoo manda en fecha, cliente y OF; queda marcada como confirmada en Odoo
    fecha = coalesce(EXCLUDED.fecha, equipos_consecutivos.fecha),
    numero_of = coalesce(EXCLUDED.numero_of, equipos_consecutivos.numero_of),
    cliente = coalesce(EXCLUDED.cliente, equipos_consecutivos.cliente),
    capacidad = coalesce(EXCLUDED.capacidad, equipos_consecutivos.capacidad),   -- el producto de Odoo es más confiable
    empresa = EXCLUDED.empresa, odoo_ref = EXCLUDED.odoo_ref, producto_odoo = EXCLUDED.producto_odoo,
    actualizado_en = now();
  GET DIAGNOSTICS n = ROW_COUNT;

  DELETE FROM public.equipos_consecutivos_avisos
   WHERE odoo_ref = ANY (p_refs) OR odoo_ref LIKE ANY (p_prefijos) OR fecha < current_date - 60;
  INSERT INTO public.equipos_consecutivos_avisos (odoo_ref, documento, empresa, fecha, cliente, numero_of, problema)
  SELECT a->>'ref', a->>'d', a->>'e', nullif(a->>'f','')::date, nullif(a->>'cl',''), nullif(a->>'of','')::integer, a->>'pr'
  FROM jsonb_array_elements(p_avisos) a
  ON CONFLICT (odoo_ref) DO UPDATE SET problema = EXCLUDED.problema, actualizado_en = now();
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consecutivos_cargar_odoo(text[], text[], jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consecutivos_cargar_odoo(text[], text[], jsonb, jsonb) TO service_role;

-- Rango reciente de cada tipo (últimos 18 meses, sin los extremos raros), para que la función corrija
-- un número que la nota puso en el equipo equivocado. Solo la llave de servicio.
CREATE OR REPLACE FUNCTION public.consecutivos_rangos()
RETURNS TABLE (tipo text, desde bigint, hasta bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tipo,
         percentile_disc(0.02) WITHIN GROUP (ORDER BY consecutivo_num),
         percentile_disc(0.995) WITHIN GROUP (ORDER BY consecutivo_num)
  FROM public.equipos_consecutivos
  WHERE consecutivo_num IS NOT NULL AND tipo <> 'revisar' AND fecha >= current_date - 540
  GROUP BY tipo HAVING count(*) >= 5;
$$;
REVOKE EXECUTE ON FUNCTION public.consecutivos_rangos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consecutivos_rangos() TO service_role;

-- Cada hora, a los 7 minutos: lee las facturas de los últimos 60 días de Feisen y FC.
-- Usa el mismo token de Vault que ventas-odoo (ventas_odoo_cron).
SELECT cron.unschedule('consecutivos-odoo-auto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'consecutivos-odoo-auto');
SELECT cron.schedule('consecutivos-odoo-auto', '7 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://lgfacrhpaxzvvklztqxv.supabase.co/functions/v1/consecutivos-odoo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ventas_odoo_cron')),
    body := '{"accion":"sincronizar"}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);
