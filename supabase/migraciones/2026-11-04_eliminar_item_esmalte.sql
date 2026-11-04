-- Elimina el producto «ESMALTE» (ALMACEN · PINTURA), pedido de Angie el 4/11/2026.
-- Revisado antes: no tiene movimientos, pedidos, conteos, paquetes, BOM, costeo, nómina ni
-- seriales; solo su renglón de stock en 0. Re-ejecutable: si ya no existe, no hace nada.
-- No afecta a los otros esmaltes (ESMALTE (NEGRO), ESMALTE ROJO, etc.): va por id.
delete from public.stock
where item_id = 'ff458da6-f004-450e-bf65-f774b50c664e' and cantidad_actual = 0;

delete from public.items i
where i.id = 'ff458da6-f004-450e-bf65-f774b50c664e'
  and i.nombre = 'ESMALTE'
  and not exists (select 1 from public.movimientos m where m.item_id = i.id)
  and not exists (select 1 from public.stock s where s.item_id = i.id);
