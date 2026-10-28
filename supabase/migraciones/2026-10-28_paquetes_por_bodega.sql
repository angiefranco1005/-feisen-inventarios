-- ============================================================
-- Migración: paquetes por bodega (Mecanizados y Almacén)
-- Fecha: 2026-10-28
-- Re-ejecutable.
-- ============================================================
-- Hasta hoy todos los paquetes eran de Mecanizados (la tabla no tenía
-- bodega). Ahora Almacén también arma paquetes con su propio catálogo, así
-- que cada paquete pertenece a una bodega y la salida solo muestra los
-- paquetes de la bodega del usuario.

ALTER TABLE public.paquetes
  ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES public.bodegas(id);

-- Los paquetes existentes quedan en la bodega de sus piezas (hoy todas de MECANIZADOS)
UPDATE public.paquetes p
   SET bodega_id = (SELECT i.bodega_id
                      FROM public.paquete_items pi
                      JOIN public.items i ON i.id = pi.item_id
                     WHERE pi.paquete_id = p.id
                     LIMIT 1)
 WHERE p.bodega_id IS NULL;

-- Paquetes sin piezas: a MECANIZADOS, que era la única bodega con paquetes
UPDATE public.paquetes
   SET bodega_id = '03a709ac-0bee-457a-80a1-0a1603218d34'
 WHERE bodega_id IS NULL;

ALTER TABLE public.paquetes ALTER COLUMN bodega_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS paquetes_bodega_idx ON public.paquetes(bodega_id);
