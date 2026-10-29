-- Costeo: la vista costeo_resumen corría como su dueño (sin security_invoker), se saltaba la RLS
-- de las tablas costeo_* y tenía SELECT para anon: cualquiera con la llave pública podía leer
-- costos y márgenes. Ahora respeta la RLS (ADMIN o acceso_costeo). Aplicada el 2026-10-29.
alter view public.costeo_resumen set (security_invoker = true);
revoke all on public.costeo_resumen from anon;
