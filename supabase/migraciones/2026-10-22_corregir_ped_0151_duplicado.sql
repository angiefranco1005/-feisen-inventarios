-- 2026-10-22 — PED-0151 duplicado + pedido de Camilo Perales sin marcar recibido
--
-- Dos pedidos distintos quedaron con numero = 'PED-0151' porque generarNumero()
-- usaba count(*)+1 (se desfasa al borrar pedidos). El pedido del operario de
-- corte es b9cccc2f-8b75-4f99-84b5-0647dbd4217f (CAMILO PERALES, OC 32, entrada
-- MOV-CP-0015). El otro (773f1040-…, Mateo Giraldo, cerrado) NO se toca.
-- Se opera SIEMPRE por id, nunca por numero. Correr cada paso por separado.

-- PASO 0 (lectura): ¿qué otros números están repetidos?
SELECT numero, COUNT(*) AS veces, MIN(created_at)::date AS primero, MAX(created_at)::date AS ultimo
FROM public.pedidos GROUP BY numero HAVING COUNT(*) > 1 ORDER BY numero;

-- PASO 1 (lectura): cantidades del pedido de Camilo vs lo realmente recibido
SELECT pi.id, pi.descripcion, pi.cantidad, pi.cantidad_recibida,
       COALESCE((SELECT SUM(m.cantidad) FROM public.movimientos m
                 WHERE m.pedido_id = pi.pedido_id AND m.item_id = pi.item_id
                   AND m.tipo = 'entrada' AND m.revertido = false), 0) AS recibido_real
FROM public.pedido_items pi
WHERE pi.pedido_id = 'b9cccc2f-8b75-4f99-84b5-0647dbd4217f';

-- PASO 2: poner cantidad_recibida según las entradas reales (solo sube, nunca baja)
UPDATE public.pedido_items pi
SET cantidad_recibida = GREATEST(COALESCE(pi.cantidad_recibida, 0), x.recibido)
FROM (
  SELECT pi2.id,
         COALESCE((SELECT SUM(m.cantidad) FROM public.movimientos m
                   WHERE m.pedido_id = pi2.pedido_id AND m.item_id = pi2.item_id
                     AND m.tipo = 'entrada' AND m.revertido = false), 0) AS recibido
  FROM public.pedido_items pi2
  WHERE pi2.pedido_id = 'b9cccc2f-8b75-4f99-84b5-0647dbd4217f'
) x
WHERE pi.id = x.id;

-- PASO 3: estado del pedido según lo recibido + renumerar con el siguiente número libre
UPDATE public.pedidos p
SET estado = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM public.pedido_items i
                    WHERE i.pedido_id = p.id AND COALESCE(i.cantidad_recibida, 0) < i.cantidad)
                  THEN 'recibido' ELSE 'parcialmente_recibido' END,
    fecha_recibido = COALESCE(p.fecha_recibido, CURRENT_DATE),
    numero = 'PED-' || LPAD((SELECT MAX(SUBSTRING(numero FROM 5)::int) + 1
                             FROM public.pedidos WHERE numero ~ '^PED-[0-9]+$')::text, 4, '0')
WHERE p.id = 'b9cccc2f-8b75-4f99-84b5-0647dbd4217f'
RETURNING id, numero, estado, fecha_recibido;

-- PASO 4: candado (SOLO cuando el PASO 0 devuelva 0 filas)
-- ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_numero_key UNIQUE (numero);
