-- ============================================================
-- Ventas: en Inventarios solo ven el stock de su bodega (MOTORES)
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- Fabián, Viviana (COMERCIAL) y Leidy (JEFE_VENTAS) ya tienen asignada la bodega MOTORES en
-- profile_bodegas; con 'productos' en 've' ven las existencias de esa bodega y nada más.

INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES ('COMERCIAL', 'productos', 've')
  ON CONFLICT (rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel, updated_at = now();

-- "Solo el almacén de motores, no más": la gerente de ventas deja de ver el Historial de movimientos
UPDATE public.rol_permisos SET nivel = 'no', updated_at = now()
  WHERE rol = 'JEFE_VENTAS' AND modulo = 'historial';
