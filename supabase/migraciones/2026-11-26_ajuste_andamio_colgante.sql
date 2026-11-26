-- ============================================================
-- Ajuste de existencias: piezas del andamio colgante (Mecanizados)
-- Fecha: 2026-11-26 — APLICADO como INV-FIS-0043. NO re-ejecutable (crearía otro conteo)
-- ============================================================
-- Conteo del jefe de Mecanizados en su hoja "Andamio colgante" (mecanizado / sin mecanizar).
-- Se registra igual que un inventario físico de la app (InventarioFisico.jsx):
--   inventarios_fisicos (confirmado) + inventario_fisico_items + un movimiento ENT/SAL por
--   diferencia, con referencia = número del conteo. El trigger fn_actualizar_stock mueve el stock.
-- Fuera del ajuste: TORNILLO SINFÍN mecanizado (el número de la hoja está tachado y no se lee).
-- La MANIJA se ajusta al ítem (5/8X285MM): es la única manija de andamio, aunque la hoja diga 150 mm.

DO $$
DECLARE
  v_user   uuid := 'ef361cdc-5333-4e22-a93e-89d50d2a2e1e';  -- Angie Franco (prefijo AF)
  v_bod    uuid := '03a709ac-0bee-457a-80a1-0a1603218d34';  -- MECANIZADOS
  v_fecha  date := '2026-11-26';
  v_num    text;
  v_inv    uuid;
  v_ent    int;
  v_sal    int;
  r        record;
BEGIN
  SELECT 'INV-FIS-' || lpad((coalesce(max(substring(numero from 9)::int), 0) + 1)::text, 4, '0')
    INTO v_num FROM inventarios_fisicos WHERE numero ~ '^INV-FIS-\d+$';
  SELECT coalesce(max(substring(numero from 8)::int), 0) INTO v_ent FROM movimientos WHERE numero ~ '^ENT-AF-\d+$';
  SELECT coalesce(max(substring(numero from 8)::int), 0) INTO v_sal FROM movimientos WHERE numero ~ '^SAL-AF-\d+$';

  INSERT INTO inventarios_fisicos (numero, fecha, estado, notas, usuario_id)
  VALUES (v_num, v_fecha, 'confirmado',
          'Conteo piezas andamio colgante (hoja del jefe de Mecanizados). Tornillo sinfín mecanizado sin contar: número ilegible.',
          v_user)
  RETURNING id INTO v_inv;

  FOR r IN
    SELECT i.id, i.nombre, i.precio_costo, c.fisico,
           coalesce(s.cantidad_actual, 0) AS sistema,
           c.fisico - coalesce(s.cantidad_actual, 0) AS dif
    FROM (VALUES
      ('BUJE TRINQUETE GRANDE ANDAMIO COLGANTE (1 1/2X27MM 1045)', 0),
      ('BUJE TRINQUETE GRANDE ANDAMIO COLGANTE (1 1/2X27MM 1045) - MECANIZADO', 48),
      ('EJE CENTRAL ANDAMIO COLGANTE (7/8X310MM 1045)', 0),
      ('EJE CENTRAL ANDAMIO COLGANTE (7/8X310MM 1045) - MECANIZADO', 27),
      ('EJE PORTA SINFÍN ANDAMIO COLGANTE (3/4X300MM 1045)', 20),
      ('EJE PORTA SINFÍN ANDAMIO COLGANTE (3/4X300MM 1045) - MECANIZADO', 2),
      ('MANIJA ANDAMIO COLGANTE (5/8X285MM)', 0),
      ('MANIJA ANDAMIO COLGANTE (5/8X285MM) - MECANIZADO', 48),
      ('PIÑON CORONA ANDAMIO', 3),
      ('PIÑON CORONA ANDAMIO - MECANIZADO', 2),
      ('PLATOS GRANDES ANDAMIO COLGANTE', 0),
      ('PLATOS GRANDES ANDAMIO COLGANTE - MECANIZADO', 26),
      ('SOPORTE POLEA ANDAMIO', 10),
      ('SOPORTE POLEA ANDAMIO - MECANIZADO', 0),
      ('SOPORTE SIN FIN ANDAMIO', 0),
      ('SOPORTE SIN FIN ANDAMIO - MECANIZADO', 15),
      ('TEMPLETE INFERIOR ANDAMIO COLGANTE (5/8X150MM)', 0),
      ('TEMPLETE INFERIOR ANDAMIO COLGANTE (5/8X150MM) - MECANIZADO', 41),
      ('TEMPLETE PORTA POLEA ANDAMIO COLGANTE (3/4X200MM)', 0),
      ('TEMPLETE PORTA POLEA ANDAMIO COLGANTE (3/4X200MM) - MECANIZADO', 42),
      ('TORNILLO SINFÍN ANDAMIO COLGANTE (2 1/2X71 MM 1045)', 36),
      ('TRINQUETE GRANDE ANDAMIO COLGANTE', 0),
      ('TRINQUETE GRANDE ANDAMIO COLGANTE - MECANIZADO', 24),
      ('TRINQUETE PEQUEÑO ANDAMIO COLGANTE', 1),
      ('TRINQUETE PEQUEÑO ANDAMIO COLGANTE - MECANIZADO', 0),
      ('POLEA ANDAMIO COLGANTE (2X20MM 1045)', 0),
      ('POLEA ANDAMIO COLGANTE (2X20MM 1045) - MECANIZADO', 58),
      ('TORNILLO ANDAMIO COLGANTE (1/2X1")', 0),
      ('TORNILLO ANDAMIO COLGANTE (1/2X1") - MECANIZADO', 20)
    ) AS c(nombre, fisico)
    JOIN items i ON i.nombre = c.nombre AND i.bodega_id = v_bod AND i.activo
    LEFT JOIN stock s ON s.item_id = i.id AND s.bodega_id = v_bod
  LOOP
    IF r.dif <> 0 THEN
      IF r.dif < 0 THEN v_sal := v_sal + 1; ELSE v_ent := v_ent + 1; END IF;
      INSERT INTO movimientos (numero, tipo, item_id, bodega_origen_id, bodega_destino_id, cantidad,
                               precio_costo_snapshot, usuario_id, centro_costo, referencia, motivo,
                               fecha_movimiento, revertido)
      VALUES (CASE WHEN r.dif < 0 THEN 'SAL-AF-' || lpad(v_sal::text, 4, '0') ELSE 'ENT-AF-' || lpad(v_ent::text, 4, '0') END,
              CASE WHEN r.dif < 0 THEN 'salida' ELSE 'entrada' END,
              r.id,
              CASE WHEN r.dif < 0 THEN v_bod END,
              CASE WHEN r.dif > 0 THEN v_bod END,
              abs(r.dif), coalesce(r.precio_costo, 0), v_user, 'MECANIZADOS', v_num,
              'Ajuste inv. físico. Sistema: ' || r.sistema::numeric(12,0) || ' → Físico: ' || r.fisico,
              v_fecha, false);
    END IF;
    INSERT INTO inventario_fisico_items (inventario_id, item_id, bodega_id, item_nombre, bodega_nombre,
                                         cantidad_sistema, cantidad_fisica, ajustado)
    VALUES (v_inv, r.id, v_bod, r.nombre, 'MECANIZADOS', r.sistema, r.fisico, r.dif <> 0);
  END LOOP;
END $$;
