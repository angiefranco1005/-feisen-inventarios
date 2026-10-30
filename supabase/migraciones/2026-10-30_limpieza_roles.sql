-- ============================================================
-- Limpieza de la tabla roles
-- Fecha: 2026-10-30 — re-ejecutable
-- ============================================================
-- 1) RECURSOS_HUMANOS ("Coordinador de RRHH") quedó duplicado de RRHH: 0 usuarios,
--    ninguna política RLS ni fila en rol_permisos lo usa. Se borra.
-- 2) JEFE_ENSAMBLE existe en el código, las RLS y rol_permisos pero faltaba en la tabla
--    roles, así que no se podía elegir al crear/editar un usuario. Se agrega.

DELETE FROM public.roles r
 WHERE r.nombre = 'RECURSOS_HUMANOS'
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.rol = r.nombre);

INSERT INTO public.roles (nombre, label, color)
VALUES ('JEFE_ENSAMBLE', 'Jefe Ensamble', 'bg-yellow-500 text-white')
ON CONFLICT (nombre) DO NOTHING;
