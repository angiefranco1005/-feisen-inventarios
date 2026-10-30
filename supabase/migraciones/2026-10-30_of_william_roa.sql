-- ============================================================
-- OF: Jefe Ensamble ve las OF de su área (William Roa → Construequipos)
-- Fecha: 2026-10-30 — re-ejecutable (no pisa lo editado en la matriz)
-- ============================================================
-- "Producción" = centro construequipos (no Fundición Hierro, ni Poleas/aluminio, ni Repuestos).

INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES ('JEFE_ENSAMBLE', 'of', 've')
ON CONFLICT (rol, modulo) DO NOTHING;

UPDATE public.profiles SET centro_costo_of = 'construequipos'
 WHERE nombre = 'William Roa' AND centro_costo_of IS NULL;
