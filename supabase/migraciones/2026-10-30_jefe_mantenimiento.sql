-- ============================================================
-- Rol Jefe de Mantenimiento + bodega MANTENIMIENTO (Leonardo Cardozo)
-- y crear pedidos internos según la matriz de permisos
-- Fecha: 2026-10-30 — re-ejecutable
-- ============================================================
-- Leonardo: ve todas las OF sin cliente y sin registrar fabricación (OF 've' sin área) y hace
-- pedidos internos del catálogo de su bodega MANTENIMIENTO (nueva, empieza vacía).

INSERT INTO public.bodegas (nombre, descripcion)
SELECT 'MANTENIMIENTO', 'Repuestos e insumos de mantenimiento de equipos'
WHERE NOT EXISTS (SELECT 1 FROM public.bodegas WHERE upper(nombre) = 'MANTENIMIENTO');

INSERT INTO public.roles (nombre, label, color)
VALUES ('JEFE_MANTENIMIENTO', 'Jefe de Mantenimiento', 'bg-orange-600 text-white')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES
  ('JEFE_MANTENIMIENTO', 'of', 've'), ('JEFE_MANTENIMIENTO', 'pedidos', 'registra'), ('JEFE_MANTENIMIENTO', 'manuales', 've')
ON CONFLICT (rol, modulo) DO NOTHING;

UPDATE public.profiles SET rol = 'JEFE_MANTENIMIENTO', centro_costo_of = NULL
 WHERE nombre ILIKE 'Leonardo Cardozo%' AND rol = 'CONSULTOR';

INSERT INTO public.profile_bodegas (profile_id, bodega_id)
SELECT p.id, b.id FROM public.profiles p, public.bodegas b
 WHERE p.nombre ILIKE 'Leonardo Cardozo%' AND upper(b.nombre) = 'MANTENIMIENTO'
   AND NOT EXISTS (SELECT 1 FROM public.profile_bodegas x WHERE x.profile_id = p.id AND x.bodega_id = b.id);

-- Crear pedidos: antes una lista fija de roles (dejaba por fuera a JEFE_ENSAMBLE y RRHH aunque
-- la matriz les da Pedidos). Ahora: nivel Registra o Todo en 'pedidos', a nombre propio
-- (con Todo, también a nombre de otro).
DROP POLICY IF EXISTS "crear pedidos" ON public.pedidos;
CREATE POLICY "crear pedidos" ON public.pedidos FOR INSERT WITH CHECK (
  public.mi_nivel('pedidos') = 'todo'
  OR (public.mi_nivel('pedidos') = 'registra' AND solicitante_id = auth.uid())
);
