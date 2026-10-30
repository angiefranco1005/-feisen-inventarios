-- ============================================================
-- OF: rol Despachos, Logística y jefes de área
-- Fecha: 2026-10-30 — re-ejecutable (no pisa lo editado en la matriz)
-- ============================================================
-- Nivel 've' del módulo 'of': sin área (profiles.centro_costo_of) = vista de despachos (ve lo que
-- está en producción y por despachar, sin cliente ni botones); con área = jefe de área (solo los
-- productos de su centro y registra su fabricación, regla of_producciones_insert).

INSERT INTO public.roles (nombre, label, color)
VALUES ('DESPACHOS', 'Despachos', 'bg-gray-500 text-white')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES
  ('DESPACHOS', 'of', 've'), ('DESPACHOS', 'productos', 've'),
  ('LOGISTICA', 'of', 've'),
  ('JEFE_FUNDICION', 'of', 've'),
  ('JEFE_MECANIZADOS', 'of', 've')
ON CONFLICT (rol, modulo) DO NOTHING;

-- Personas (decisión de Angie 2026-10-30)
UPDATE public.profiles SET rol = 'DESPACHOS' WHERE nombre = 'Alexander Sanchez' AND rol = 'CONSULTOR';
UPDATE public.profiles SET centro_costo_of = 'fundicionHierro' WHERE nombre = 'Julian Acuña' AND centro_costo_of IS NULL;
UPDATE public.profiles SET centro_costo_of = 'aluminio'        WHERE nombre = 'William Angulo' AND centro_costo_of IS NULL;
