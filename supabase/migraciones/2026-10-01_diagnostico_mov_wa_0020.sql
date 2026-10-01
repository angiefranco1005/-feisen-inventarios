-- ============================================================================
-- DIAGNÓSTICO (solo lectura) de MOV-WA--0020 — por qué la edición no ajustó
-- el stock. Ver OBSERVACIONES.md para la explicación completa de la causa
-- raíz (bug de centro_costo en Historial.jsx, ya corregido en el código).
-- ============================================================================

SELECT
  m.numero, m.tipo, m.cantidad, m.centro_costo,
  bo.nombre AS bodega_origen_real,
  bd.nombre AS bodega_destino_real,
  i.nombre AS producto,
  m.item_id, m.bodega_origen_id, m.bodega_destino_id,
  m.fecha_movimiento, m.created_at
FROM public.movimientos m
LEFT JOIN public.bodegas bo ON bo.id = m.bodega_origen_id
LEFT JOIN public.bodegas bd ON bd.id = m.bodega_destino_id
LEFT JOIN public.items i ON i.id = m.item_id
WHERE m.numero ILIKE 'MOV-WA--0020';

SELECT me.*, p.nombre AS editado_por
FROM public.movimientos_ediciones me
JOIN public.movimientos m ON m.id = me.movimiento_id
LEFT JOIN public.profiles p ON p.id = me.usuario_id
WHERE m.numero ILIKE 'MOV-WA--0020'
ORDER BY me.created_at;

SELECT i.nombre AS producto, b.nombre AS bodega, s.cantidad_actual
FROM public.movimientos m
JOIN public.items i ON i.id = m.item_id
JOIN public.bodegas b ON b.id = COALESCE(m.bodega_destino_id, m.bodega_origen_id)
LEFT JOIN public.stock s ON s.item_id = m.item_id AND s.bodega_id = COALESCE(m.bodega_destino_id, m.bodega_origen_id)
WHERE m.numero ILIKE 'MOV-WA--0020';
