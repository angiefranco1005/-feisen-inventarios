-- Reabre el PED-0209 (pedido de Angie, 5/11/2026): quedó cerrado pero faltan 100 ARANDELA BALDE
-- (las otras 11 líneas llegaron completas con MOV-MG-0408 el 3/11). Ningún otro pedido abierto
-- tiene arandela balde. Vuelve a "Llegó una parte" y deja la nota en su historial.
-- Re-ejecutable: solo actúa si sigue cerrado y no repite la nota.
update public.pedidos
set estado = 'parcialmente_recibido', motivo_cierre = null
where id = 'f08071d3-d9de-48d7-a9d8-0fa1d733eca0' and numero = 'PED-0209' and estado = 'cerrado';

insert into public.pedido_historial (pedido_id, usuario_id, accion, detalle)
select 'f08071d3-d9de-48d7-a9d8-0fa1d733eca0', 'ef361cdc-5333-4e22-a93e-89d50d2a2e1e', 'parcialmente_recibido',
       'Reabierto: falta ARANDELA BALDE (100 und). Estaba cerrado («Ya no se necesita»)'
where not exists (select 1 from public.pedido_historial
                  where pedido_id = 'f08071d3-d9de-48d7-a9d8-0fa1d733eca0' and detalle like 'Reabierto:%');
