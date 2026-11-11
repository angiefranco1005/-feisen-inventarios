-- ============================================================
-- Bloquear transferencias de materia prima desde Fundición a otra bodega
-- Fecha: 2026-11-11 — re-ejecutable
-- ============================================================
-- Decisión de Angie: la materia prima de Fundición (hierro colado, carbón coke, arenas…) no es transferencia
-- interna; se descuenta sola al registrar la fundida (esas salidas no llevan bodega destino, así que no se tocan).
-- En octubre 2026 se registraron como "salida a Armado y Soldadura" (SAL-JA-0055/0056/0057): no se revierten
-- para no mover el inventario de Fundición; EEFF las excluye. ADMIN puede seguir haciéndolo para correcciones.

CREATE OR REPLACE FUNCTION public.bloquear_mp_fundicion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'salida'
     AND NEW.bodega_destino_id IS NOT NULL AND NEW.bodega_destino_id <> NEW.bodega_origen_id
     AND coalesce(public.get_my_rol(), '') <> 'ADMIN'
     AND EXISTS (SELECT 1 FROM public.bodegas b WHERE b.id = NEW.bodega_origen_id AND b.nombre ILIKE '%fundic%')
     AND EXISTS (SELECT 1 FROM public.items i JOIN public.categorias c ON c.id = i.categoria_id
                 WHERE i.id = NEW.item_id AND c.nombre = 'MATERIA PRIMA')
  THEN
    RAISE EXCEPTION 'La materia prima de Fundición no se transfiere a otra bodega: se descuenta sola al registrar la fundida.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mp_fundicion ON public.movimientos;
CREATE TRIGGER trg_bloquear_mp_fundicion
  BEFORE INSERT ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_mp_fundicion();
