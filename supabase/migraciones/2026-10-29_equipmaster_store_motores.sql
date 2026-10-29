-- 2026-10-29 · Crea los 12 productos de EQUIPMASTER STORE en la bodega MOTORES
-- y les carga el stock inicial con una entrada (ENT-AF-0433) que guarda los seriales.
-- Re-ejecutable: no duplica productos ni la entrada si ya existen.
-- Precio de costo en 0 (no venía en la lista); se ajusta luego desde Productos.

with datos(nombre, cantidad, serial) as (values
  ('GASOLINA DE 6.5HP MEGAPAC',         1, '2507205324'),
  ('GASOLINA 10HP GOODYEAR',            4, '21010305 - 24010375 - 21010298 - 24010372'),
  ('GASOLINA FORTE 13HP',               1, '250600535'),
  ('GASOLINA HONDA 13 HP',              1, '1061680'),
  ('GASOLINA 7 HP GOODYEAR',            1, '215326050034'),
  ('DIESEL TOYAMA 5 HP',                1, '1903325120050'),
  ('DIESEL GOODYEAR 10HP',              3, '2601121 - 2601050 - 2601081'),
  ('DIESEL DE 10HP ECOHORSE',           4, '07084738 - 07084791 - 07084675 - 07084743'),
  ('MOTOR TECHTOP 5 HP 1800 RPM',       1, '24100510957'),
  ('MOTOR WEG 4 HP 220 V EN 1700 RPM',  2, '1126072729 - 118030016'),
  ('MOTOR WEG 4 HP 220 V EN 3600 RPM',  1, '1067935165'),
  ('BASE VIBRADOR CORMAG',              4, null)
),
nuevos as (
  insert into items (nombre, categoria_id, bodega_id, centro_costo, unidad_medida, precio_costo)
  select d.nombre, '23035ac2-9a84-4b3b-8e30-dfbef44a1c07', '4d281af9-a6db-4390-a1bf-b8788f4e7dac', 'MOTORES', 'unidad', 0
  from datos d
  where not exists (select 1 from items i
                    where i.categoria_id = '23035ac2-9a84-4b3b-8e30-dfbef44a1c07' and i.nombre = d.nombre)
  returning id, nombre
)
insert into movimientos (numero, tipo, item_id, bodega_destino_id, cantidad, precio_costo_snapshot,
                         centro_costo, usuario_id, referencia, motivo, serial_motor, fecha_movimiento)
select 'ENT-AF-0433', 'entrada', n.id, '4d281af9-a6db-4390-a1bf-b8788f4e7dac', d.cantidad, 0,
       'MOTORES', 'ef361cdc-5333-4e22-a93e-89d50d2a2e1e', 'INVENTARIO EQUIPMASTER',
       'Inventario inicial EQUIPMASTER STORE', d.serial, current_date
from nuevos n join datos d on d.nombre = n.nombre;
-- El trigger trg_actualizar_stock suma las cantidades al stock de MOTORES.
