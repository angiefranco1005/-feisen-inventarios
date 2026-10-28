-- ============================================================
-- Corrección de datos: pedidos que ya tenían OC y quedaron en 'pendiente'
-- Fecha: 2026-10-28 · Aplicada con el conector (OK de Angie). Re-ejecutable.
-- ============================================================
-- Antes del cambio "al generar la OC el pedido pasa solo a En camino", PED-0215 (OC-0085)
-- y PED-0216 (OC-0083) quedaron en 'pendiente'. Se pasan a 'en_transito' con el número real
-- de su OC y queda una nota en pedido_historial. Sin fecha estimada de llegada (no se conocía).
WITH a_mover AS (
  SELECT p.id, string_agg(o.numero, ', ' ORDER BY o.numero) AS ocs
    FROM public.pedidos p
    JOIN public.ordenes_compra o ON o.pedido_id = p.id AND NOT COALESCE(o.anulada, false)
   WHERE p.estado = 'pendiente'
     AND p.numero IN ('PED-0215', 'PED-0216')
   GROUP BY p.id
), movidos AS (
  UPDATE public.pedidos p
     SET estado = 'en_transito',
         numero_oc = a.ocs
    FROM a_mover a
   WHERE p.id = a.id
  RETURNING p.id, p.numero, a.ocs
)
INSERT INTO public.pedido_historial (pedido_id, usuario_id, accion, detalle)
SELECT m.id, NULL, 'en_transito', m.ocs || ' ya estaba generada: pasó a En camino (corrección del 28/10/2026)'
  FROM movidos m;
