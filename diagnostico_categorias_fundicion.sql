-- ============================================================================
-- Solo lectura: ¿los productos de la bodega FUNDICIÓN ya están categorizados
-- de forma que se pueda distinguir hierro de aluminio? Si las categorías ya
-- lo separan, se puede armar el costeo de "Fundición Hierro" vs "Fundición
-- de Aluminio" por esa vía, sin depender del texto libre de centro_costo
-- (que hoy junta todo en un solo valor "FUNDICIÓN").
-- ============================================================================

SELECT
  c.nombre AS categoria,
  COUNT(*) AS num_productos,
  COALESCE(SUM(s.cantidad_actual), 0) AS stock_total,
  COALESCE(SUM(s.cantidad_actual * i.precio_costo), 0) AS valor_stock_total
FROM public.items i
JOIN public.bodegas b ON b.id = i.bodega_id
LEFT JOIN public.categorias c ON c.id = i.categoria_id
LEFT JOIN public.stock s ON s.item_id = i.id AND s.bodega_id = i.bodega_id
WHERE b.nombre ILIKE '%FUNDICI%'
  AND i.activo = true
GROUP BY c.nombre
ORDER BY valor_stock_total DESC;
