INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 23
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RANA GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 24
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 19
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 2B ACANALADA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 87
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 116
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'PLATO RANA SH' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'EXCENTRICA REGLA VIBRATORIA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'BOCIN' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA 1/2 BULTO LITEMIX' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 11
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA CORTADORA LADRILLO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA PLUMA LITE MIX' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 28
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON CORONA ANDAMIO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'PLATO RANA CH' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'PLATO CORTADORA PISO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 144
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 3A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 55
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 2B MACIZA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 16
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 34
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 1/2 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 20
FROM items i, bodegas b
WHERE i.nombre = 'ALMA HIERRO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 7 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 8 X 1B AUMENTO 4"' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 24
FROM items i, bodegas b
WHERE i.nombre = 'EJE DE MOLINO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'TAMBOR JGB 3 1/2' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE ORDEÑO PEQUEÑO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 8
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE ORDEÑO MEDIANO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA MECANOPARTES MEDIANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 12
FROM items i, bodegas b
WHERE i.nombre = 'EJE MOLINO GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CARCASA ORDEÑO GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CARCASA ORDEÑO MEDIANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 3
FROM items i, bodegas b
WHERE i.nombre = 'CARCASA ORDEÑO PEQUEÑA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 3
FROM items i, bodegas b
WHERE i.nombre = 'PECHERO JFS 1200' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 5
FROM items i, bodegas b
WHERE i.nombre = 'POLEA MECANOPARTES 240' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'TAPOA ORDEÑO GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 7
FROM items i, bodegas b
WHERE i.nombre = 'TAPA ORDEÑO PEQUEÑA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 10
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 1 1/2 REPUESTO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 1 1/2 REPUESTO MANZANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 450
FROM items i, bodegas b
WHERE i.nombre = 'HACHAS' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 36
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 33
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1 1/2 B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 8
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1/2 B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 18
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1 B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 11
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1 B LITEMIX' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 5
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1/2 B LITEMIX' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 143
FROM items i, bodegas b
WHERE i.nombre = 'CATALINA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 48
FROM items i, bodegas b
WHERE i.nombre = 'PLANCHA RANA GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 6
FROM items i, bodegas b
WHERE i.nombre = 'PLANCHA RANA ZANJERA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'CORONA 1 1/2 MANTENIMIENTO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 20
FROM items i, bodegas b
WHERE i.nombre = 'ZAPATA GRANDE HIERRO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 12
FROM items i, bodegas b
WHERE i.nombre = 'CARCASA RANA GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'TAMBOR JGB 4 1/2' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 148
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON VOLTEO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 22
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA MEDIANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 27
FROM items i, bodegas b
WHERE i.nombre = 'TRINQUETE 1/2' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 14
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 1/2 B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 51
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 39
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 1 1/2 B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 14
FROM items i, bodegas b
WHERE i.nombre = 'PIÑON 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'TAPON GRANDE' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 82
FROM items i, bodegas b
WHERE i.nombre = 'MANZANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 42
FROM items i, bodegas b
WHERE i.nombre = 'SOPORTE POLEA ANDAMIO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 49
FROM items i, bodegas b
WHERE i.nombre = 'SOPORTE SIN FIN ANDAMIO' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'REJILLA 20 X 20' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 24
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 1/2 X 1A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 5
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE MANZANA 4 X 3C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 13
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 3 X 2C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 3 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE MANZANA 3 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 1C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 3 1/2 X 1C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 9
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 6
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 1A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 1/2 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 1/2 X 2B MACIZA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 5
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 31
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 2 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 14
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 1 1/2 X 1A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 20 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 18 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 18 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 17 1/2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 16 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 15 X 1C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 8 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 8 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 6
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 7 1/2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE MANZANA 7 X 3C' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 12
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 9
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 3 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 5
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 7 1/2 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 6 1/2 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 17
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 6 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 6 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 6 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE MANZANA 5 1/2 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 1/2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 36
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE 5 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 11
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 5 X 1A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 7
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 1/2 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 8
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 4 1/2 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 6
FROM items i, bodegas b
WHERE i.nombre = 'LINGOTE RECTANGULAR PANADERIA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'TAPA CUADRADA JGB' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'CHUMACERA JGB' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'U DE PANADERIA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 14 1/2 X 3A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 10 X 3C MANZANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 10 X 3C EJE 2"' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 9 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA 9 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 14 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 4
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 14 X 2A' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 14 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 12 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 12 X 3B PLANA' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 12 X 3B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 3
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 10 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 10 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 9 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 9 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 8 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 8 X 1B MANZANA 2 1/2"' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 7 1/2 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 2
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 7 X 2B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;
INSERT INTO stock (item_id, bodega_id, cantidad_actual)
SELECT i.id, b.id, 1
FROM items i, bodegas b
WHERE i.nombre = 'POLEA RADIADA 7 X 1B' AND b.nombre = 'Fundición Hierro'
ON CONFLICT (item_id, bodega_id) DO UPDATE SET cantidad_actual = stock.cantidad_actual + EXCLUDED.cantidad_actual;