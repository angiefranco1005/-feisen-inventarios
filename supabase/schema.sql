-- ============================================================
-- FEISEN INVENTARIOS — Esquema Supabase
-- Construequipos Franco S.A.S.
-- ============================================================

-- Habilitar extensión uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: profiles (vinculada a auth.users de Supabase)
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('ADMIN', 'BODEGUERO', 'JEFE_AREA', 'OPERARIO')),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: bodegas
-- ============================================================
CREATE TABLE public.bodegas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bodegas iniciales
INSERT INTO public.bodegas (nombre, descripcion) VALUES
  ('Bodega Materia Prima',       'Acero, hierro crudo, aluminio, perfiles'),
  ('Fundición',                  'Piezas fundidas (hierro y aluminio), en proceso y terminadas'),
  ('Mecanizados / CNC',          'Partes mecanizadas, piezas cortadas por plasma o sierra'),
  ('Ensamble / Soldadura',       'Producto en proceso, motores, componentes eléctricos'),
  ('Bodega Producto Terminado',  'Mezcladoras, compactadores, poleas, maquinaria lista para despacho'),
  ('Bodega Repuestos y Consumibles', 'Brocas, discos, tornillería, insumos menores');

-- ============================================================
-- TABLA: categorias
-- ============================================================
CREATE TABLE public.categorias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categorías iniciales
INSERT INTO public.categorias (nombre) VALUES
  ('Materia prima'),
  ('Piezas de fundición'),
  ('Partes mecanizadas / CNC'),
  ('Piezas cortadas (plasma, sierra)'),
  ('Producto en proceso'),
  ('Producto terminado'),
  ('Motores y componentes eléctricos'),
  ('Repuestos y consumibles');

-- ============================================================
-- TABLA: items
-- ============================================================
CREATE TABLE public.items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre          TEXT NOT NULL,
  categoria_id    UUID REFERENCES public.categorias(id),
  unidad_medida   TEXT NOT NULL DEFAULT 'unidad',
  centro_costo    TEXT NOT NULL CHECK (centro_costo IN ('Construequipos', 'Fundición Hierro', 'Aluminio')),
  precio_costo    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  stock_minimo    NUMERIC(18, 3) NOT NULL DEFAULT 0,
  foto_url        TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: stock (cantidad actual por ítem y bodega)
-- ============================================================
CREATE TABLE public.stock (
  item_id         UUID NOT NULL REFERENCES public.items(id),
  bodega_id       UUID NOT NULL REFERENCES public.bodegas(id),
  cantidad_actual NUMERIC(18, 3) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, bodega_id)
);

-- ============================================================
-- TABLA: movimientos (append-only, nunca se borra)
-- ============================================================
CREATE TABLE public.movimientos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo                  TEXT NOT NULL CHECK (tipo IN (
                          'entrada_compra',
                          'salida_produccion',
                          'traslado',
                          'devolucion',
                          'salida_venta',
                          'ajuste_inventario'
                        )),
  item_id               UUID NOT NULL REFERENCES public.items(id),
  bodega_origen_id      UUID REFERENCES public.bodegas(id),
  bodega_destino_id     UUID REFERENCES public.bodegas(id),
  cantidad              NUMERIC(18, 3) NOT NULL,
  precio_costo_snapshot NUMERIC(18, 2) NOT NULL DEFAULT 0,
  centro_costo          TEXT NOT NULL CHECK (centro_costo IN ('Construequipos', 'Fundición Hierro', 'Aluminio')),
  usuario_id            UUID NOT NULL REFERENCES public.profiles(id),
  referencia            TEXT,
  motivo                TEXT,
  proveedor             TEXT,
  cliente               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')
);

-- ============================================================
-- FUNCIÓN: actualizar stock automáticamente al insertar movimiento
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Entrada de compra o devolución → aumenta stock en bodega_destino
  IF NEW.tipo IN ('entrada_compra', 'devolucion') THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, NEW.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + NEW.cantidad,
                  updated_at = NOW();

  -- Salida a producción o salida por venta → disminuye stock en bodega_origen
  ELSIF NEW.tipo IN ('salida_produccion', 'salida_venta') THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_origen_id, 0)
    ON CONFLICT (item_id, bodega_id) DO NOTHING;
    UPDATE public.stock
    SET cantidad_actual = GREATEST(0, cantidad_actual - NEW.cantidad),
        updated_at = NOW()
    WHERE item_id = NEW.item_id AND bodega_id = NEW.bodega_origen_id;

  -- Traslado → disminuye en origen, aumenta en destino
  ELSIF NEW.tipo = 'traslado' THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_origen_id, 0)
    ON CONFLICT (item_id, bodega_id) DO NOTHING;
    UPDATE public.stock
    SET cantidad_actual = GREATEST(0, cantidad_actual - NEW.cantidad),
        updated_at = NOW()
    WHERE item_id = NEW.item_id AND bodega_id = NEW.bodega_origen_id;

    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, NEW.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + NEW.cantidad,
                  updated_at = NOW();

  -- Ajuste → sobreescribe el stock directamente (cantidad puede ser positiva o negativa)
  ELSIF NEW.tipo = 'ajuste_inventario' THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, GREATEST(0, NEW.cantidad))
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = GREATEST(0, public.stock.cantidad_actual + NEW.cantidad),
                  updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que ejecuta la función después de cada inserción en movimientos
CREATE TRIGGER trg_actualizar_stock
AFTER INSERT ON public.movimientos
FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_stock();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodegas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;

-- Función auxiliar: obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS TEXT AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: cada usuario ve su propio perfil; ADMIN ve todos
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.get_my_rol() = 'ADMIN');
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT
  WITH CHECK (public.get_my_rol() = 'ADMIN');
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.get_my_rol() = 'ADMIN');

-- BODEGAS: todos los usuarios autenticados pueden leer
CREATE POLICY "bodegas_select" ON public.bodegas FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "bodegas_manage_admin" ON public.bodegas FOR ALL
  USING (public.get_my_rol() = 'ADMIN');

-- CATEGORIAS: todos leen
CREATE POLICY "categorias_select" ON public.categorias FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "categorias_manage_admin" ON public.categorias FOR ALL
  USING (public.get_my_rol() = 'ADMIN');

-- ITEMS: todos leen ítems activos; solo ADMIN crea/edita
CREATE POLICY "items_select" ON public.items FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "items_manage_admin" ON public.items FOR ALL
  USING (public.get_my_rol() = 'ADMIN');

-- STOCK: todos los autenticados pueden leer
CREATE POLICY "stock_select" ON public.stock FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "stock_upsert_trigger" ON public.stock FOR ALL
  USING (true) WITH CHECK (true);  -- El trigger usa SECURITY DEFINER

-- MOVIMIENTOS: todos pueden insertar (sus propios movimientos); ADMIN/BODEGUERO/JEFE_AREA leen todos
CREATE POLICY "movimientos_insert" ON public.movimientos FOR INSERT
  WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "movimientos_select_admin" ON public.movimientos FOR SELECT
  USING (
    usuario_id = auth.uid()
    OR public.get_my_rol() IN ('ADMIN', 'BODEGUERO', 'JEFE_AREA')
  );

-- ============================================================
-- BUCKET DE STORAGE para fotos de productos
-- ============================================================
-- Ejecutar en Supabase Dashboard > Storage > New Bucket:
-- Nombre: "productos-fotos", Public: true
-- O con SQL:
INSERT INTO storage.buckets (id, name, public) VALUES ('productos-fotos', 'productos-fotos', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "fotos_select_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'productos-fotos');
CREATE POLICY "fotos_insert_admin" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'productos-fotos' AND public.get_my_rol() = 'ADMIN');
CREATE POLICY "fotos_delete_admin" ON storage.objects FOR DELETE
  USING (bucket_id = 'productos-fotos' AND public.get_my_rol() = 'ADMIN');
