-- ============================================================
-- OF: comerciales despachan cualquier OF + Mateo como jefe de repuestos
-- Fecha: 2026-11-03 — re-ejecutable
-- ============================================================
-- Tras el traspaso de la app vieja: Fabián registraba casi todas las entregas, también de OF
-- creadas por Leidy y Viviana, y Mateo registraba la fabricación de repuestos.

-- Entregas (y su reversión, que es otra fila con tipo 'reversion'): con nivel Registra o Todo
-- en cualquier OF. Editar y cancelar la OF sigue siendo solo de las propias con Registra.
DROP POLICY IF EXISTS of_entregas_insert ON public.of_entregas;
CREATE POLICY of_entregas_insert ON public.of_entregas FOR INSERT
  WITH CHECK (registrado_por = auth.uid() AND public.of_puede_crear());

-- Almacenista: ve las OF; con área (centro_costo_of) queda como jefe de área y fabrica lo suyo
INSERT INTO public.rol_permisos (rol, modulo, nivel) VALUES ('ALMACENISTA', 'of', 've')
  ON CONFLICT (rol, modulo) DO UPDATE SET nivel = EXCLUDED.nivel, updated_at = now();

UPDATE public.profiles SET centro_costo_of = 'repuestos'
  WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'cmgiraldo729@gmail.com');
