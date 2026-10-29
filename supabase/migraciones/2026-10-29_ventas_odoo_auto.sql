-- ============================================================
-- Ventas: actualización automática desde Odoo cada 15 minutos
-- Fecha: 2026-10-29 — re-ejecutable
-- ============================================================
-- pg_cron llama a la función ventas-odoo con un token guardado en Vault (nadie lo ve ni lo copia).
-- La función trae el mes en curso de Feisen y FC (y el anterior los primeros 5 días) y lo guarda con ventas_cargar_mes.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Token de la tarea programada (se crea una sola vez)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ventas_odoo_cron') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ventas_odoo_cron',
                                'Token con que pg_cron llama a la función ventas-odoo');
  END IF;
END $$;

-- La función ventas-odoo (con la llave de servicio) revisa que el token que llega sea el de Vault
CREATE OR REPLACE FUNCTION public.ventas_cron_token_ok(p_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'ventas_odoo_cron' AND decrypted_secret = p_token);
$$;
REVOKE EXECUTE ON FUNCTION public.ventas_cron_token_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_cron_token_ok(text) TO service_role;

-- ventas_cargar_mes: además de ADMIN, la puede usar la llave de servicio (la actualización automática)
CREATE OR REPLACE FUNCTION public.ventas_cargar_mes(p_empresa text, p_mes text, p_filas jsonb, p_archivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT (public.ventas_puede_ver() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'No tienes permiso para cargar informes de ventas.';
  END IF;
  DELETE FROM public.ventas_odoo WHERE empresa = p_empresa AND mes = p_mes;
  INSERT INTO public.ventas_odoo (empresa, mes, cliente, producto, valor, cantidad, origen, archivo, subido_por)
  SELECT p_empresa, p_mes,
         left(coalesce(nullif(f->>'c',''), 'Sin nombre'), 200),
         left(coalesce(nullif(f->>'p',''), 'Sin detalle'), 200),
         (f->>'v')::numeric, coalesce((f->>'q')::numeric, 0),
         'odoo', left(p_archivo, 120), auth.uid()
  FROM jsonb_array_elements(p_filas) f;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Tarea cada 15 minutos
SELECT cron.unschedule('ventas-odoo-auto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ventas-odoo-auto');
SELECT cron.schedule('ventas-odoo-auto', '*/15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://lgfacrhpaxzvvklztqxv.supabase.co/functions/v1/ventas-odoo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ventas_odoo_cron')),
    body := '{"auto": true}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
