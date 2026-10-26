-- ============================================================
-- Migración: RRHH — Almacén y Logística pasan a ser una sola área
-- Fecha: 2026-10-26
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================
-- Decisión de Angie: 'Almacén' y 'Logística' se unen en 'Almacén y Logística'.
-- Además se quita 'Calidad' de la lista (por ahora no existe esa área).
-- Esto solo afecta el área de RRHH (fichas y cargos), NO las bodegas ni los
-- roles de usuario LOGISTICA / ALMACENISTA del inventario.

UPDATE public.empleados SET area = 'Almacén y Logística'
  WHERE area IN ('Almacén', 'Logística');
UPDATE public.cargos SET area = 'Almacén y Logística'
  WHERE area IN ('Almacén', 'Logística');

-- Si alguien quedó con área 'Calidad', esta consulta lo muestra para
-- reasignarlo a mano desde la app (no se cambia automáticamente):
SELECT 'empleado' AS tipo, nombres || ' ' || apellidos AS nombre, area FROM public.empleados WHERE area = 'Calidad'
UNION ALL
SELECT 'cargo', nombre, area FROM public.cargos WHERE area = 'Calidad';
