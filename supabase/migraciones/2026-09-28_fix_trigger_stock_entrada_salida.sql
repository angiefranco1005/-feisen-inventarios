-- Fix: el trigger fn_actualizar_stock no reconocia los tipos de movimiento
-- 'entrada' / 'salida' (genericos), que son los que usan:
--   - Registro de mecanizado (RegistroMecanizado.jsx)
--   - Aplicar correcciones de Inventario Fisico (InventarioFisico.jsx)
-- Como el IF/ELSIF no los contemplaba, esos INSERT en `movimientos` se
-- guardaban bien (quedan en el historial), pero NUNCA actualizaban `stock`.
-- Este reemplazo solo AGREGA 'entrada' y 'salida' a las dos primeras ramas;
-- el resto de la funcion (traslado, ajuste_inventario) queda exactamente igual.
-- Ejecutar manualmente en el SQL Editor de Supabase (no correr por CI/migracion automatica).

CREATE OR REPLACE FUNCTION public.fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Entrada de compra, devolucion, o entrada generica (mecanizado / ajuste de inv. fisico)
  -- -> aumenta stock en bodega_destino
  IF NEW.tipo IN ('entrada_compra', 'devolucion', 'entrada') THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, NEW.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + NEW.cantidad,
                  updated_at = NOW();

  -- Salida a produccion, por venta, o salida generica (mecanizado / ajuste de inv. fisico)
  -- -> disminuye stock en bodega_origen
  ELSIF NEW.tipo IN ('salida_produccion', 'salida_venta', 'salida') THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_origen_id, 0)
    ON CONFLICT (item_id, bodega_id) DO NOTHING;
    UPDATE public.stock
    SET cantidad_actual = GREATEST(0, cantidad_actual - NEW.cantidad),
        updated_at = NOW()
    WHERE item_id = NEW.item_id AND bodega_id = NEW.bodega_origen_id;

  -- Traslado -> disminuye en origen, aumenta en destino
  ELSIF NEW.tipo = 'traslado' THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_origen_id, 0)
    ON CONFLICT (item_id, bodega_id) DO NOTHING;
    UPDATE public.stock
    SET cantidad_actual = GREATEST(0, cantidad_actual - NEW.cantidad),
        updated_at = NOW()
    WHERE item_id = NEW.item_id AND bodega_id = NEW.bodega_origen_id;

    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, NEW.cantidad)
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = public.stock.cantidad_actual + NEW.cantidad,
                  updated_at = NOW();

  -- Ajuste -> suma el delta directamente (cantidad puede ser positiva o negativa)
  ELSIF NEW.tipo = 'ajuste_inventario' THEN
    INSERT INTO public.stock (item_id, bodega_id, cantidad_actual)
    VALUES (NEW.item_id, NEW.bodega_destino_id, GREATEST(0, NEW.cantidad))
    ON CONFLICT (item_id, bodega_id)
    DO UPDATE SET cantidad_actual = GREATEST(0, public.stock.cantidad_actual + NEW.cantidad),
                  updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
