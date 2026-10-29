-- ============================================================
-- Permisos por rol editables desde Configuración (etapa 1)
-- Fecha: 2026-10-29 — re-ejecutable (la carga inicial no pisa lo que ya se haya editado)
-- ============================================================
-- Una fila por rol y módulo con su nivel: 'no' | 've' | 'registra' | 'todo'.
-- Si no hay fila, el rol no tiene el módulo. ADMIN no se guarda aquí: siempre tiene todo.
-- La app arma el menú y las pantallas de cada persona con esta tabla
-- (catálogo de módulos en src/permisos/modulos.js).
-- Etapa 1: la tabla manda en la app. Las políticas RLS de cada tabla siguen siendo por rol
-- fijo; pasarlas a esta tabla es la etapa 2.

CREATE TABLE IF NOT EXISTS public.rol_permisos (
  rol            text NOT NULL,
  modulo         text NOT NULL,
  nivel          text NOT NULL CHECK (nivel IN ('no','ve','registra','todo')),
  actualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rol, modulo)
);

ALTER TABLE public.rol_permisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rol_permisos_select ON public.rol_permisos;
CREATE POLICY rol_permisos_select ON public.rol_permisos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rol_permisos_admin ON public.rol_permisos;
CREATE POLICY rol_permisos_admin ON public.rol_permisos FOR ALL TO authenticated
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN' AND rol <> 'ADMIN');

-- Carga inicial = lo que cada rol ve hoy (App.jsx / Layout.jsx al 2026-10-29)
INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES
  ('LOGISTICA','productos','registra'), ('LOGISTICA','movimientos','registra'), ('LOGISTICA','historial','ve'),
  ('LOGISTICA','pedidos','todo'), ('LOGISTICA','ordenes_compra','todo'), ('LOGISTICA','calidad','registra'),

  ('ALMACENISTA','productos','registra'), ('ALMACENISTA','movimientos','registra'), ('ALMACENISTA','historial','ve'),
  ('ALMACENISTA','pedidos','registra'), ('ALMACENISTA','calidad','registra'),

  ('OPERARIO','productos','registra'), ('OPERARIO','movimientos','registra'), ('OPERARIO','historial','ve'),
  ('OPERARIO','pedidos','registra'), ('OPERARIO','calidad','registra'),

  ('JEFE_FUNDICION','productos','registra'), ('JEFE_FUNDICION','movimientos','registra'), ('JEFE_FUNDICION','historial','ve'),
  ('JEFE_FUNDICION','pedidos','registra'), ('JEFE_FUNDICION','transferencias','registra'), ('JEFE_FUNDICION','calidad','registra'),
  ('JEFE_FUNDICION','mantenimiento','registra'), ('JEFE_FUNDICION','fundicion','todo'),

  ('JEFE_MECANIZADOS','productos','registra'), ('JEFE_MECANIZADOS','movimientos','registra'), ('JEFE_MECANIZADOS','historial','ve'),
  ('JEFE_MECANIZADOS','pedidos','registra'), ('JEFE_MECANIZADOS','transferencias','registra'), ('JEFE_MECANIZADOS','calidad','registra'),
  ('JEFE_MECANIZADOS','mantenimiento','registra'), ('JEFE_MECANIZADOS','mecanizados','todo'),

  ('JEFE_ENSAMBLE','productos','registra'), ('JEFE_ENSAMBLE','movimientos','registra'), ('JEFE_ENSAMBLE','historial','ve'),
  ('JEFE_ENSAMBLE','pedidos','registra'), ('JEFE_ENSAMBLE','calidad','registra'), ('JEFE_ENSAMBLE','mantenimiento','registra'),
  ('JEFE_ENSAMBLE','ensamble','todo'),

  ('CONSULTOR','historial','ve'),

  ('RRHH','rrhh','todo'), ('RRHH','productos','registra'), ('RRHH','movimientos','registra'), ('RRHH','historial','ve'),
  ('RRHH','pedidos','registra')
ON CONFLICT (rol, modulo) DO NOTHING;
