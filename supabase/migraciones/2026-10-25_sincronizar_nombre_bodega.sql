-- 2026-10-25 — Renombrar una bodega no debe dejar textos viejos regados.
--
-- Varias tablas guardan el NOMBRE de la bodega como texto (snapshot informativo):
--   items.centro_costo, movimientos.centro_costo, movimientos.destino,
--   no_conformidades.bodega_nombre, inventario_fisico_items.bodega_nombre.
-- La lógica de la app ya NO depende de esos textos (usa bodega_id / IDs fijos en
-- src/utils/bodegasCatalogo.js), pero los reportes y el Excel los muestran, y un rename
-- dejaba "FUNDICIÓN" en unas filas y "FUNDICIÓN HIERRO" en otras.
-- Este trigger propaga el nombre nuevo a todas esas copias, automáticamente.
-- Las categorías no necesitan nada: items solo guarda categoria_id y el nombre se lee por join.

CREATE OR REPLACE FUNCTION public.fn_sincronizar_nombre_bodega()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- corre con permisos del dueño: no depende de las políticas RLS de quien renombra
SET search_path = public
AS $$
BEGIN
  IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN
    UPDATE public.items                   SET centro_costo  = NEW.nombre WHERE centro_costo = OLD.nombre;
    UPDATE public.movimientos             SET centro_costo  = NEW.nombre WHERE centro_costo = OLD.nombre;
    UPDATE public.movimientos             SET destino       = NEW.nombre WHERE destino      = OLD.nombre;
    UPDATE public.no_conformidades        SET bodega_nombre = NEW.nombre WHERE bodega_id    = NEW.id;
    UPDATE public.inventario_fisico_items SET bodega_nombre = NEW.nombre WHERE bodega_id    = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_nombre_bodega ON public.bodegas;
CREATE TRIGGER trg_sincronizar_nombre_bodega
AFTER UPDATE OF nombre ON public.bodegas
FOR EACH ROW EXECUTE FUNCTION public.fn_sincronizar_nombre_bodega();

-- PRUEBA (no deja cambios: el RAISE EXCEPTION deshace todo). Correr aparte:
-- DO $$ DECLARE n1 int; n2 int;
-- BEGIN
--   UPDATE public.bodegas SET nombre = nombre || ' PRUEBA' WHERE nombre = 'CORTE Y DOBLEZ';
--   SELECT count(*) INTO n1 FROM public.movimientos WHERE centro_costo = 'CORTE Y DOBLEZ PRUEBA';
--   SELECT count(*) INTO n2 FROM public.items       WHERE centro_costo = 'CORTE Y DOBLEZ PRUEBA';
--   RAISE EXCEPTION 'PRUEBA OK (se deshace): movimientos=%, items=%', n1, n2;
-- END $$;
