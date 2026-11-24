-- ============================================================
-- Categorías con el nombre de su bodega al final ("DOTACIÓN - ALMACEN")
-- Fecha: 2026-11-24 — re-ejecutable
-- ============================================================
-- Decisión de Angie: varias bodegas tienen categorías con el mismo nombre (DOTACIÓN en
-- Administración y en Almacén…). Para saber de qué bodega es cada una se le agrega
-- " - BODEGA" al final, como ya tenían "FUNDICIÓN - MECANIZADOS" o "ALUMINIO - FUNDICIÓN".
-- No se tocan: las que ya terminan en " - <su bodega>" ni las que se llaman igual que su
-- bodega (FERRETERIA en FERRETERIA, MANTENIMIENTO en MANTENIMIENTO).
-- Antes de esto, la app y el trigger de materia prima reconocían categorías por NOMBRE;
-- ahora lo hacen por ID (src/utils/bodegasCatalogo.js), así que renombrar no rompe nada.

-- 1. Quitar espacios de más ('ALUMINIO - FUNDICIÓN ', 'MOTORES CONSTRU ', 'EQUIPMASTER STORE ')
UPDATE public.categorias SET nombre = trim(nombre) WHERE nombre <> trim(nombre);

-- 2. Agregar " - BODEGA"
UPDATE public.categorias c
SET nombre = c.nombre || ' - ' || b.nombre
FROM public.bodegas b
WHERE b.id = c.bodega_id
  AND upper(c.nombre) <> upper(b.nombre)
  AND upper(c.nombre) NOT LIKE '% - ' || upper(b.nombre);

-- 3. Categoría nueva para las poleas de aluminio terminadas (coquillada), aparte del aluminio
--    en bruto (ALUMINIO - FUNDICIÓN): así el balance las cuenta como producto terminado.
--    ID fijo: la app la reconoce por ID (CAT_POLEAS_ALUMINIO_ID en src/utils/bodegasCatalogo.js).
INSERT INTO public.categorias (id, nombre, bodega_id)
VALUES ('d0e46316-a3a1-41dd-b7e9-39c252ae3ed1', 'POLEAS ALUMINIO - FUNDICIÓN', 'a0604489-2768-445b-8e68-e450ef8520ed')
ON CONFLICT (id) DO NOTHING;

-- 4. El bloqueo de transferir materia prima de Fundición (2026-11-11) buscaba la categoría por
--    nombre 'MATERIA PRIMA': ahora por su ID (24537e0a… = MATERIA PRIMA - FUNDICIÓN).
CREATE OR REPLACE FUNCTION public.bloquear_mp_fundicion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'salida'
     AND NEW.bodega_destino_id IS NOT NULL AND NEW.bodega_destino_id <> NEW.bodega_origen_id
     AND coalesce(public.get_my_rol(), '') <> 'ADMIN'
     AND NEW.bodega_origen_id = 'a0604489-2768-445b-8e68-e450ef8520ed'
     AND EXISTS (SELECT 1 FROM public.items i
                 WHERE i.id = NEW.item_id AND i.categoria_id = '24537e0a-88b5-4714-a7b1-0e8814e1c43c')
  THEN
    RAISE EXCEPTION 'La materia prima de Fundición no se transfiere a otra bodega: se descuenta sola al registrar la fundida.';
  END IF;
  RETURN NEW;
END;
$$;

-- Revisión: SELECT b.nombre, c.nombre FROM categorias c JOIN bodegas b ON b.id = c.bodega_id ORDER BY 1, 2;
