-- ============================================================
-- Módulo Órdenes de Fabricación (traído de la app "APP OF")
-- Fecha: 2026-10-29 — re-ejecutable
-- ============================================================
-- Mismas tablas y reglas que la app de OF (proyecto qzvmnrfzcmqnbrkllbpl), con
-- prefijo of_ donde el nombre era genérico (clientes, productos, entregas,
-- producciones) para no confundirlas con las del inventario.
--   ordenes_fabricacion · items_of · of_producciones · of_entregas · of_productos · of_clientes
-- Los ids son uuid: al copiar los datos se conservan los mismos ids de la app de OF.
--
-- Roles: todavía NO se crean roles nuevos. Quién puede crear/editar OF lo decide
-- of_puede_editar(); hoy solo ADMIN. Cuando se definan COMERCIAL / JEFE_VENTAS /
-- JEFE_AREA basta cambiar esa función (y la de centro), no las políticas.

-- ---------- Funciones de permiso ----------
CREATE OR REPLACE FUNCTION public.of_puede_editar()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(public.get_my_rol() IN ('ADMIN'), false);
$$;

-- Centro de costo del usuario en OF (para jefes de área: registran lo fabricado de su centro)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS centro_costo_of text;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_centro_costo_of_check
    CHECK (centro_costo_of IN ('construequipos','aluminio','fundicionHierro','repuestos'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.get_my_centro_of()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT centro_costo_of FROM public.profiles WHERE id = auth.uid() AND activo IS NOT FALSE;
$$;

-- El centro de OF también es un permiso: solo ADMIN lo cambia
CREATE OR REPLACE FUNCTION public.proteger_campos_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.rol, NEW.activo, NEW.acceso_costeo, NEW.almacen, NEW.centro_costo_of)
     IS DISTINCT FROM (OLD.rol, OLD.activo, OLD.acceso_costeo, OLD.almacen, OLD.centro_costo_of)
     AND public.get_my_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol, el estado o los permisos de un usuario.';
  END IF;
  IF NEW.id = auth.uid() AND (NEW.activo IS FALSE OR NEW.rol IS DISTINCT FROM OLD.rol) THEN
    RAISE EXCEPTION 'No puedes desactivarte ni cambiarte el rol a ti mismo.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Catálogos ----------
CREATE TABLE IF NOT EXISTS public.of_clientes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     text NOT NULL UNIQUE,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.of_productos (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Órdenes ----------
CREATE SEQUENCE IF NOT EXISTS public.of_numero_seq;

CREATE TABLE IF NOT EXISTS public.ordenes_fabricacion (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero                integer NOT NULL UNIQUE DEFAULT nextval('public.of_numero_seq'),
  cliente               text NOT NULL,
  fecha_orden           date NOT NULL,
  fecha_promesa         date NOT NULL,
  ciudad                text NOT NULL,
  direccion             text,
  contacto              text,
  transporte            text NOT NULL CHECK (transporte IN ('propio_cliente','contratado','transportadora','directo')),
  nombre_transportadora text,
  notas                 text,
  archivo_oc_url        text,
  archivo_oc_nombre     text,
  numero_cotizacion     text,
  cancelada             boolean NOT NULL DEFAULT false,
  motivo_cancelacion    text,
  cancelada_en          timestamptz,
  creado_por            uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.of_numero_seq OWNED BY public.ordenes_fabricacion.numero;

CREATE TABLE IF NOT EXISTS public.items_of (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id     uuid NOT NULL REFERENCES public.ordenes_fabricacion(id) ON DELETE CASCADE,
  producto     text NOT NULL,
  color        text NOT NULL DEFAULT '-',
  cantidad     numeric NOT NULL CHECK (cantidad > 0),
  centro_costo text NOT NULL CHECK (centro_costo IN ('construequipos','aluminio','fundicionHierro','repuestos')),
  detalle      text,
  producido    numeric NOT NULL DEFAULT 0,
  entregado    numeric NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_of_orden_id_idx ON public.items_of(orden_id);

CREATE TABLE IF NOT EXISTS public.of_producciones (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id        uuid NOT NULL REFERENCES public.items_of(id) ON DELETE CASCADE,
  fecha          date NOT NULL,
  cantidad       numeric NOT NULL CHECK (cantidad > 0),
  tipo           text NOT NULL DEFAULT 'fabricacion' CHECK (tipo IN ('fabricacion','reversion')),
  motivo         text,
  registrado_por uuid NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS of_producciones_item_id_idx ON public.of_producciones(item_id);

CREATE TABLE IF NOT EXISTS public.of_entregas (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id        uuid NOT NULL REFERENCES public.items_of(id) ON DELETE CASCADE,
  fecha          date NOT NULL,
  cantidad       numeric NOT NULL CHECK (cantidad > 0),
  tipo           text NOT NULL DEFAULT 'entrega' CHECK (tipo IN ('entrega','reversion')),
  orden_despacho text,
  referencia     text,
  motivo         text,
  registrado_por uuid NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS of_entregas_item_id_idx ON public.of_entregas(item_id);

-- ---------- Triggers: lo fabricado y lo entregado se suman solos ----------
CREATE OR REPLACE FUNCTION public.fn_of_sumar_produccion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'reversion' THEN
    -- No se puede dejar lo fabricado por debajo de lo ya entregado
    UPDATE public.items_of SET producido = GREATEST(entregado, producido - NEW.cantidad) WHERE id = NEW.item_id;
  ELSE
    UPDATE public.items_of SET producido = LEAST(cantidad, producido + NEW.cantidad) WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_of_sumar_entrega()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'reversion' THEN
    UPDATE public.items_of SET entregado = GREATEST(0, entregado - NEW.cantidad) WHERE id = NEW.item_id;
  ELSE
    UPDATE public.items_of SET entregado = LEAST(producido, entregado + NEW.cantidad) WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_of_sumar_produccion ON public.of_producciones;
CREATE TRIGGER trg_of_sumar_produccion AFTER INSERT ON public.of_producciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_of_sumar_produccion();

DROP TRIGGER IF EXISTS trg_of_sumar_entrega ON public.of_entregas;
CREATE TRIGGER trg_of_sumar_entrega AFTER INSERT ON public.of_entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_of_sumar_entrega();

-- ---------- RLS ----------
ALTER TABLE public.of_clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_productos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_fabricacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_of            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_producciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_entregas         ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario activo (como en la app de OF; la pantalla oculta lo que no le toca)
DROP POLICY IF EXISTS of_clientes_select ON public.of_clientes;
CREATE POLICY of_clientes_select ON public.of_clientes FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS of_clientes_insert ON public.of_clientes;
CREATE POLICY of_clientes_insert ON public.of_clientes FOR INSERT WITH CHECK (public.of_puede_editar());
DROP POLICY IF EXISTS of_clientes_update ON public.of_clientes;
CREATE POLICY of_clientes_update ON public.of_clientes FOR UPDATE USING (public.of_puede_editar());
DROP POLICY IF EXISTS of_clientes_delete ON public.of_clientes;
CREATE POLICY of_clientes_delete ON public.of_clientes FOR DELETE USING (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS of_productos_select ON public.of_productos;
CREATE POLICY of_productos_select ON public.of_productos FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS of_productos_insert ON public.of_productos;
CREATE POLICY of_productos_insert ON public.of_productos FOR INSERT WITH CHECK (public.of_puede_editar());
DROP POLICY IF EXISTS of_productos_update ON public.of_productos;
CREATE POLICY of_productos_update ON public.of_productos FOR UPDATE USING (public.of_puede_editar());
DROP POLICY IF EXISTS of_productos_delete ON public.of_productos;
CREATE POLICY of_productos_delete ON public.of_productos FOR DELETE USING (public.get_my_rol() = 'ADMIN');

DROP POLICY IF EXISTS of_select ON public.ordenes_fabricacion;
CREATE POLICY of_select ON public.ordenes_fabricacion FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS of_insert ON public.ordenes_fabricacion;
CREATE POLICY of_insert ON public.ordenes_fabricacion FOR INSERT WITH CHECK (public.of_puede_editar());
DROP POLICY IF EXISTS of_update ON public.ordenes_fabricacion;
CREATE POLICY of_update ON public.ordenes_fabricacion FOR UPDATE USING (public.of_puede_editar());
-- Sin DELETE: una OF no se borra, se cancela

DROP POLICY IF EXISTS items_of_select ON public.items_of;
CREATE POLICY items_of_select ON public.items_of FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS items_of_insert ON public.items_of;
CREATE POLICY items_of_insert ON public.items_of FOR INSERT WITH CHECK (public.of_puede_editar());
DROP POLICY IF EXISTS items_of_update ON public.items_of;
CREATE POLICY items_of_update ON public.items_of FOR UPDATE USING (public.of_puede_editar());
DROP POLICY IF EXISTS items_of_delete ON public.items_of;
CREATE POLICY items_of_delete ON public.items_of FOR DELETE
  USING (public.of_puede_editar() AND producido = 0 AND entregado = 0);

DROP POLICY IF EXISTS of_producciones_select ON public.of_producciones;
CREATE POLICY of_producciones_select ON public.of_producciones FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS of_producciones_insert ON public.of_producciones;
CREATE POLICY of_producciones_insert ON public.of_producciones FOR INSERT WITH CHECK (
  registrado_por = auth.uid() AND (
    public.get_my_rol() = 'ADMIN'
    OR EXISTS (SELECT 1 FROM public.items_of i
               WHERE i.id = of_producciones.item_id AND i.centro_costo = public.get_my_centro_of())
  )
);

DROP POLICY IF EXISTS of_entregas_select ON public.of_entregas;
CREATE POLICY of_entregas_select ON public.of_entregas FOR SELECT USING (public.get_my_rol() IS NOT NULL);
DROP POLICY IF EXISTS of_entregas_insert ON public.of_entregas;
CREATE POLICY of_entregas_insert ON public.of_entregas FOR INSERT
  WITH CHECK (registrado_por = auth.uid() AND public.of_puede_editar());

-- ---------- Adjuntos (orden de compra del cliente) ----------
-- Público como en la app de OF: la OF guarda la URL pública del archivo.
INSERT INTO storage.buckets (id, name, public) VALUES ('of-adjuntos', 'of-adjuntos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS of_adjuntos_select ON storage.objects;
CREATE POLICY of_adjuntos_select ON storage.objects FOR SELECT USING (bucket_id = 'of-adjuntos');
DROP POLICY IF EXISTS of_adjuntos_insert ON storage.objects;
CREATE POLICY of_adjuntos_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'of-adjuntos' AND public.of_puede_editar());
DROP POLICY IF EXISTS of_adjuntos_delete ON storage.objects;
CREATE POLICY of_adjuntos_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'of-adjuntos' AND public.of_puede_editar());
