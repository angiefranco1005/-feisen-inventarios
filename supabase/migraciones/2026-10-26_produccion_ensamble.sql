-- ============================================================
-- Módulo Producción y Ensamble
-- Fecha: 2026-10-26 — Ejecutar en Supabase Dashboard > SQL Editor
-- Es idempotente: se puede correr más de una vez.
-- ============================================================
-- Flujo (ver OBSERVACIONES.md, "Módulo: Producción y Ensamble"):
--   1. Receta (BOM) de cada máquina terminada: qué piezas/insumos lleva y cuántos.
--      La máquina es un renglón de `items` (en la bodega donde vive el producto
--      terminado); cada componente es un renglón de `items` de la bodega de donde
--      se consume (normalmente "Producción y Ensamble").
--   2. Orden de ensamble (OE-0001): receta + cantidad planeada. Se cierra a mano.
--   3. Avance diario: N máquinas terminadas en una fecha. La app registra la
--      salida de los componentes (N × cantidad de la receta) y la entrada de las
--      N máquinas, y guarda los números de movimiento en el avance.

-- 1. Rol nuevo ---------------------------------------------------------------
INSERT INTO public.roles (nombre, label, color)
VALUES ('JEFE_ENSAMBLE', 'Jefe Ensamble', 'bg-teal-600 text-white')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Recetas -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recetas_ensamble (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID NOT NULL UNIQUE REFERENCES public.items(id),  -- máquina terminada
  notas       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receta_ensamble_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receta_id   UUID NOT NULL REFERENCES public.recetas_ensamble(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES public.items(id),          -- componente
  cantidad    NUMERIC(18, 3) NOT NULL CHECK (cantidad > 0),       -- por 1 máquina
  UNIQUE (receta_id, item_id)
);

-- 3. Órdenes de ensamble -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordenes_ensamble (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero             TEXT NOT NULL UNIQUE,                         -- OE-0001
  receta_id          UUID NOT NULL REFERENCES public.recetas_ensamble(id),
  item_id            UUID NOT NULL REFERENCES public.items(id),    -- máquina (copia de la receta)
  cantidad_planeada  NUMERIC(18, 3) NOT NULL CHECK (cantidad_planeada > 0),
  estado             TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada', 'anulada')),
  fecha_inicio       DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')::date,
  fecha_cierre       DATE,
  notas              TEXT,
  creado_por         UUID REFERENCES public.profiles(id),
  cerrado_por        UUID REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Avances diarios ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordenes_ensamble_avances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id        UUID NOT NULL REFERENCES public.ordenes_ensamble(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  cantidad        NUMERIC(18, 3) NOT NULL CHECK (cantidad > 0),
  numero_salida   TEXT,      -- movimientos.numero de la salida de componentes
  numero_entrada  TEXT,      -- movimientos.numero de la entrada de las máquinas
  notas           TEXT,
  usuario_id      UUID NOT NULL REFERENCES public.profiles(id),
  usuario_nombre  TEXT,      -- copia: profiles solo deja leer el propio perfil a no-admin
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ordenes_ensamble_avances_orden_idx ON public.ordenes_ensamble_avances(orden_id);

-- 5. RLS ---------------------------------------------------------------------
ALTER TABLE public.recetas_ensamble         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_ensamble_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_ensamble         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_ensamble_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recetas_ensamble_select"       ON public.recetas_ensamble;
DROP POLICY IF EXISTS "recetas_ensamble_manage"       ON public.recetas_ensamble;
DROP POLICY IF EXISTS "receta_ensamble_items_select"  ON public.receta_ensamble_items;
DROP POLICY IF EXISTS "receta_ensamble_items_manage"  ON public.receta_ensamble_items;
DROP POLICY IF EXISTS "ordenes_ensamble_select"       ON public.ordenes_ensamble;
DROP POLICY IF EXISTS "ordenes_ensamble_manage"       ON public.ordenes_ensamble;
DROP POLICY IF EXISTS "ordenes_ensamble_avances_select" ON public.ordenes_ensamble_avances;
DROP POLICY IF EXISTS "ordenes_ensamble_avances_insert" ON public.ordenes_ensamble_avances;

-- Todos los autenticados leen (analítica, consultas)
CREATE POLICY "recetas_ensamble_select" ON public.recetas_ensamble FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "receta_ensamble_items_select" ON public.receta_ensamble_items FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ordenes_ensamble_select" ON public.ordenes_ensamble FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "ordenes_ensamble_avances_select" ON public.ordenes_ensamble_avances FOR SELECT
  USING (auth.role() = 'authenticated');

-- ADMIN y JEFE_ENSAMBLE administran recetas y órdenes
CREATE POLICY "recetas_ensamble_manage" ON public.recetas_ensamble FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'));
CREATE POLICY "receta_ensamble_items_manage" ON public.receta_ensamble_items FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'));
CREATE POLICY "ordenes_ensamble_manage" ON public.ordenes_ensamble FOR ALL
  USING (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'))
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE'));

-- Los avances no se editan ni se borran (ya movieron inventario): solo insertar
CREATE POLICY "ordenes_ensamble_avances_insert" ON public.ordenes_ensamble_avances FOR INSERT
  WITH CHECK (public.get_my_rol() IN ('ADMIN', 'JEFE_ENSAMBLE') AND usuario_id = auth.uid());

-- 6. Jefe Ensamble puede crear/editar productos de SU bodega -----------------
-- Mismas políticas de 2026-10-14_items_permisos_por_bodega.sql + JEFE_ENSAMBLE.
DROP POLICY IF EXISTS "items_insert_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_update_roles_bodega" ON public.items;
DROP POLICY IF EXISTS "items_delete_roles_bodega" ON public.items;

CREATE POLICY "items_insert_roles_bodega" ON public.items FOR INSERT
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_update_roles_bodega" ON public.items FOR UPDATE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

CREATE POLICY "items_delete_roles_bodega" ON public.items FOR DELETE
  USING (
    public.get_my_rol() = 'LOGISTICA'
    OR (
      public.get_my_rol() IN ('ALMACENISTA','OPERARIO','JEFE_FUNDICION','JEFE_MECANIZADOS','JEFE_ENSAMBLE')
      AND bodega_id IN (SELECT pb.bodega_id FROM public.profile_bodegas pb WHERE pb.profile_id = auth.uid())
    )
  );

-- 7. Verificación ------------------------------------------------------------
-- La bodega de Ensamble que usa la app (bodegasCatalogo.js → BODEGA_ENSAMBLE_ID):
SELECT id, nombre, activo FROM public.bodegas WHERE id = '7f0e4d7e-8c85-40d3-84c5-7857e26f624a';
-- Esperado: 1 fila ("Producción y Ensamble"). Si sale vacío, avisar: hay que corregir el ID en la app.
--
-- Después: Configuración → Usuarios → crear (o cambiar) el usuario del jefe de Soldadura y Armado
-- con rol JEFE_ENSAMBLE y asignarle la bodega "Producción y Ensamble".
