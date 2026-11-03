-- ============================================================
-- OF: número de cotización obligatorio al crear una OF
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- Solo al crear: las OF viejas sin cotización (15 al 2026-11-03) se pueden seguir editando.
-- La pantalla Nueva OF ya lo exige; esto lo asegura aunque se guarde por otro camino.

CREATE OR REPLACE FUNCTION public.of_exigir_cotizacion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(btrim(NEW.numero_cotizacion), '') = '' THEN
    RAISE EXCEPTION 'El número de cotización es obligatorio para crear la OF.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_of_exigir_cotizacion ON public.ordenes_fabricacion;
CREATE TRIGGER trg_of_exigir_cotizacion BEFORE INSERT ON public.ordenes_fabricacion
  FOR EACH ROW EXECUTE FUNCTION public.of_exigir_cotizacion();
