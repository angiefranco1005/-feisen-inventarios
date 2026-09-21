-- ============================================================
-- Migración: paquetes (kits) de piezas de Mecanizados para ensamble
-- Fecha: 2026-09-21
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Mismo patrón ya usado en fundicion (maquinas_fundicion / bom_maquina_piezas
-- — ver GestionBOM.jsx): una tabla cabecera "paquetes" y una tabla hija
-- "paquete_items" con las piezas y cantidades por paquete.
-- Permite a Mecanizados armar el "paquete" de piezas de una máquina y hacer
-- la salida completa de una sola vez en vez de pieza por pieza.
-- Solo ADMIN puede crear/editar/eliminar paquetes; cualquier usuario
-- autenticado puede leerlos (para poder seleccionarlos en la salida).

CREATE TABLE IF NOT EXISTS public.paquetes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.paquete_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paquete_id  UUID NOT NULL REFERENCES public.paquetes(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES public.items(id),
  cantidad    NUMERIC(18, 3) NOT NULL CHECK (cantidad > 0)
);

ALTER TABLE public.paquetes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paquete_items ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden ver los paquetes (para seleccionarlos al hacer la salida)
CREATE POLICY "paquetes_select" ON public.paquetes FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "paquete_items_select" ON public.paquete_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- Solo ADMIN puede crear, editar o eliminar paquetes y sus piezas
CREATE POLICY "paquetes_manage_admin" ON public.paquetes FOR ALL
  USING (public.get_my_rol() = 'ADMIN')
  WITH CHECK (public.get_my_rol() = 'ADMIN');
CREATE POLICY "paquete_items_manage_admin" ON public.paquete_items FOR ALL
  USING (public.get_my_rol() = 'ADMIN')
  WITH CHECK (public.get_my_rol() = 'ADMIN');
