-- ============================================================
-- Acceso de Zaray Ariza al módulo de Recursos Humanos
-- Fecha: 2026-10-26 — Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Síntoma: entra a la app pero el módulo de RRHH le sale vacío.
-- Las tablas de RRHH (empleados, cargos, novedades, bucket rrhh) solo dejan ver
-- filas a quien tenga rol 'ADMIN' o 'RRHH' (RLS con get_my_rol()). Si su perfil
-- tiene otro rol, Supabase no da error: simplemente devuelve 0 filas.

-- PASO 1 — Diagnóstico (solo lee). Correr y revisar el resultado.
SELECT p.id, p.nombre, p.rol, p.activo, u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.nombre ILIKE '%zaray%' OR u.email ILIKE '%zaray%';
-- Esperado: UNA fila con rol = 'RRHH' y activo = true.
-- · 0 filas → su usuario no existe o no tiene perfil: crearlo en Configuración → Usuarios con rol RRHH.
-- · rol distinto de 'RRHH' → correr el PASO 2.

SELECT nombre FROM public.roles WHERE nombre = 'RRHH';   -- debe existir (lo crea 2026-10-26_rrhh_empleados.sql)
SELECT count(*) AS empleados_registrados FROM public.empleados;  -- si es 0, la lista sale vacía para todos

-- PASO 2 — Corrección: darle el rol RRHH (solo si el PASO 1 mostró UNA fila con otro rol).
UPDATE public.profiles p
SET rol = 'RRHH', activo = true
FROM auth.users u
WHERE u.id = p.id
  AND (p.nombre ILIKE '%zaray%' OR u.email ILIKE '%zaray%')
RETURNING p.nombre, p.rol, u.email;
-- Debe devolver exactamente 1 fila. Después Zaray debe cerrar sesión y volver a entrar.
