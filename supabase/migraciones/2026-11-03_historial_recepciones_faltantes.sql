-- Reconstruye en pedido_historial las recepciones que no se anotaron entre el 15/10/2026 y el
-- 3/11/2026 (bug del finally en confirmarRecibido, ver OBSERVACIONES.md). Solo INSERTA en el
-- historial; no toca pedidos, cantidades ni movimientos. Re-ejecutable: no repite filas.

-- 1) Recepciones con entrada: una por N° de movimiento, con su fecha y su usuario
with rec as (
  select m.pedido_id, m.numero, min(m.created_at) t, (array_agg(m.usuario_id order by m.created_at))[1] usuario_id
  from public.movimientos m
  where m.tipo = 'entrada' and m.pedido_id is not null and m.created_at >= '2026-10-15 17:00+00'
  group by m.pedido_id, m.numero
), marcadas as (
  select r.*, p.estado,
         r.t = max(r.t) over (partition by r.pedido_id) as ultima
  from rec r join public.pedidos p on p.id = r.pedido_id
)
insert into public.pedido_historial (pedido_id, usuario_id, accion, detalle, created_at)
select x.pedido_id, x.usuario_id,
       case when x.ultima and x.estado = 'recibido' then 'recibido' else 'parcialmente_recibido' end,
       case when x.ultima and x.estado = 'recibido' then 'Recibido completo con entrada de inventario'
            else 'Llegó una parte con entrada de inventario' end
         || ' · Movimiento ' || x.numero || ' (reconstruido el 3/11/2026)',
       x.t
from marcadas x
where not exists (
  select 1 from public.pedido_historial h
  where h.pedido_id = x.pedido_id and h.accion in ('recibido', 'parcialmente_recibido')
    and (h.detalle like '%Movimiento ' || x.numero || '%' or abs(extract(epoch from h.created_at - x.t)) < 600));

-- 2) Recibidos completos sin entrada de inventario (no se sabe quién; fecha = fecha_recibido)
insert into public.pedido_historial (pedido_id, usuario_id, accion, detalle, created_at)
select p.id, null, 'recibido', 'Recibido completo sin entrada de inventario (reconstruido el 3/11/2026)', p.fecha_recibido
from public.pedidos p
where p.estado = 'recibido' and p.fecha_recibido >= '2026-10-15 17:00+00'
  and not exists (select 1 from public.movimientos m where m.pedido_id = p.id and m.tipo = 'entrada' and m.created_at >= '2026-10-15 17:00+00')
  and not exists (select 1 from public.pedido_historial h where h.pedido_id = p.id and h.accion = 'recibido');
