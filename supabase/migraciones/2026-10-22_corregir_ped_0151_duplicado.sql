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

-- PASO 3: estado del pedido de Camilo según lo recibido (SIN renumerar aquí)
UPDATE public.pedidos p
SET estado = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM public.pedido_items i
                    WHERE i.pedido_id = p.id AND COALESCE(i.cantidad_recibida, 0) < i.cantidad)
                  THEN 'recibido' ELSE 'parcialmente_recibido' END,
    fecha_recibido = COALESCE(p.fecha_recibido, CURRENT_DATE)
WHERE p.id = 'b9cccc2f-8b75-4f99-84b5-0647dbd4217f'
RETURNING id, numero, estado, fecha_recibido;

-- PASO 3A (lectura): TODOS los pedidos con número repetido, para revisar antes de renumerar
SELECT p.numero, p.id, p.created_at::date AS creado, p.estado, p.solicitante_nombre,
       (SELECT COUNT(*) FROM public.pedido_items i WHERE i.pedido_id = p.id) AS lineas,
       (SELECT string_agg(o.numero, ',') FROM public.ordenes_compra o WHERE o.pedido_id = p.id) AS ocs
FROM public.pedidos p
WHERE p.numero IN (SELECT numero FROM public.pedidos GROUP BY numero HAVING COUNT(*) > 1)
ORDER BY p.numero, p.created_at;

-- PASO 3B: renumerar. En cada grupo repetido el pedido MÁS ANTIGUO conserva su número;
-- los demás reciben números nuevos consecutivos a partir del máximo actual + 1.
WITH ranked AS (
  SELECT id, numero, created_at,
         ROW_NUMBER() OVER (PARTITION BY numero ORDER BY created_at, id) AS rn
  FROM public.pedidos
),
a_renumerar AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS orden
  FROM ranked WHERE rn > 1
),
base AS (
  SELECT COALESCE(MAX(SUBSTRING(numero FROM 5)::int), 0) AS maximo
  FROM public.pedidos WHERE numero ~ '^PED-[0-9]+$'
)
UPDATE public.pedidos p
SET numero = 'PED-' || LPAD((base.maximo + r.orden)::text, 4, '0')
FROM a_renumerar r, base
WHERE p.id = r.id
RETURNING p.id, p.numero, p.created_at::date AS creado, p.solicitante_nombre;

-- PASO 4: candado (SOLO cuando el PASO 0 vuelva a devolver 0 filas después del 3B)
-- ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_numero_key UNIQUE (numero);
