-- ============================================================
-- Dashboard de ventas (traído del artefacto "Dashboard Ventas")
-- Fecha: 2026-10-29 — re-ejecutable
-- ============================================================
-- Una fila por cliente + producto + mes y empresa, venta neta sin IVA, de los Excel de Odoo.
--   origen 'base' = datos con los que se armó el tablero (abr – 27 oct 2026, Feisen + FC; incluye notas crédito)
--   origen 'odoo' = meses cargados desde la pestaña "Cargar informe" (solo facturas)
-- Cargar un mes reemplaza todas las filas de esa empresa y ese mes (ventas_cargar_mes).
-- Permisos: por ahora solo ADMIN (ventas_puede_ver); al definir roles se ajusta esa función.

CREATE TABLE IF NOT EXISTS public.ventas_odoo (
  id         bigserial PRIMARY KEY,
  empresa    text NOT NULL CHECK (empresa IN ('feisen','fc')),
  mes        text NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cliente    text NOT NULL,
  producto   text NOT NULL,
  valor      numeric NOT NULL,
  cantidad   numeric NOT NULL DEFAULT 0,
  origen     text NOT NULL DEFAULT 'odoo' CHECK (origen IN ('base','odoo')),
  archivo    text,
  subido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ventas_odoo_empresa_mes_idx ON public.ventas_odoo(empresa, mes);

CREATE OR REPLACE FUNCTION public.ventas_puede_ver()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(public.get_my_rol() IN ('ADMIN'), false);
$$;

ALTER TABLE public.ventas_odoo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ventas_odoo_select ON public.ventas_odoo;
CREATE POLICY ventas_odoo_select ON public.ventas_odoo FOR SELECT USING (public.ventas_puede_ver());
-- Sin políticas de escritura: solo se escribe con ventas_cargar_mes

-- Reemplaza el mes completo de una empresa (todo o nada)
CREATE OR REPLACE FUNCTION public.ventas_cargar_mes(p_empresa text, p_mes text, p_filas jsonb, p_archivo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.ventas_puede_ver() THEN
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
