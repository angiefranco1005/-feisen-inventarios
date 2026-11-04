-- Las 60 recepciones reconstruidas el 3/11/2026 con entrada de inventario quedaron 5 horas
-- antes de la real (ej. MOV-MG-0409 salía a las 5:32 a.m. y fue a las 10:32 a.m.).
-- Causa: movimientos.created_at guarda la hora de Colombia como si fuera UTC, y el historial
-- guarda UTC real. Solo mueve la hora de esas filas; re-ejecutable (una fila ya corregida
-- deja de coincidir con la hora del movimiento y no se vuelve a mover).
update public.pedido_historial h
set created_at = h.created_at + interval '5 hours'
where h.detalle like '%(reconstruido el 3/11/2026)'
  and exists (
    select 1 from public.movimientos m
    where m.pedido_id = h.pedido_id
      and m.created_at = h.created_at
      and h.detalle like '%Movimiento ' || m.numero || ' %');
