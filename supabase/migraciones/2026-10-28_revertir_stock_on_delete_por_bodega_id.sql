-- ============================================================
-- Migración: al eliminar un movimiento, revertir el stock usando las bodegas
-- reales del movimiento (bodega_origen_id / bodega_destino_id)
-- Fecha: 2026-10-28
-- Re-ejecutable (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ============================================================
-- Antes la función buscaba la bodega por nombre (centro_costo = bodegas.nombre):
-- si la bodega se había renombrado, o el centro_costo no era el nombre de una
-- bodega, el stock no se revertía y nadie se enteraba. Además solo reconocía
-- 'entrada' y 'salida'.
-- Ahora deshace exactamente lo que hizo fn_actualizar_stock al insertar
-- (mismos tipos, mismas bodegas). La pantalla de Historial ya no ajusta el
-- stock por su cuenta al eliminar: esta función es la única que lo hace.

CREATE OR REPLACE FUNCTION public.fn_revertir_stock_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Entradas: habían sumado en bodega_destino → restar
  IF OLD.tipo IN ('entrada_compra', 'devolucion', 'entrada') THEN
    UPDATE public.stock
       SET cantidad_actual = GREATEST(0, cantidad_actual - OLD.cantidad),
           updated_at = NOW()
     WHERE item_id = OLD.item_id AND bodega_id = OLD.bodega_destino_id;

  -- Salidas: habían restado en bodega_origen → devolver
  ELSIF OLD.tipo IN ('salida_produccion', 'salida_venta', 'salida') THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (OLD.item_id, OLD.bodega_origen_id, OLD.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + OLD.cantidad,
                  updated_at = NOW();

  -- Traslado: había restado en origen y sumado en destino
  ELSIF OLD.tipo = 'traslado' THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (OLD.item_id, OLD.bodega_origen_id, OLD.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + OLD.cantidad,
                  updated_at = NOW();
    UPDATE public.stock
       SET cantidad_actual = GREATEST(0, cantidad_actual - OLD.cantidad),
           updated_at = NOW()
     WHERE item_id = OLD.item_id AND bodega_id = OLD.bodega_destino_id;

  -- Ajuste: había sumado el delta en destino → restarlo
  ELSIF OLD.tipo = 'ajuste_inventario' THEN
    UPDATE public.stock
       SET cantidad_actual = GREATEST(0, cantidad_actual - OLD.cantidad),
           updated_at = NOW()
     WHERE item_id = OLD.item_id AND bodega_id = OLD.bodega_destino_id;
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_revertir_stock_on_delete ON public.movimientos;
CREATE TRIGGER trg_revertir_stock_on_delete
  BEFORE DELETE ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.fn_revertir_stock_on_delete();
