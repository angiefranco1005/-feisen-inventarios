-- Permite que quien creó el pedido (solicitante) lo actualice: recibirlo, cerrarlo o editarlo.
-- Contexto: la política "marcar recibido" de `pedidos` (UPDATE) solo deja a ADMIN, LOGISTICA, ALMACENISTA,
-- JEFE_AREA, JEFE_FABRICACION y JEFE_FUNDICION. OPERARIO y JEFE_MECANIZADOS (y otros) podían registrar la
-- entrada de inventario pero el cambio de estado del pedido era rechazado en silencio (0 filas, sin error).
-- Las políticas se suman (OR): esta NO quita nada a los roles actuales.
-- No permite reabrir pedidos cerrados (USING exige estado <> 'cerrado').
-- Ejecutar manualmente en el SQL Editor de Supabase.

CREATE POLICY "solicitante actualiza su pedido"
ON public.pedidos
FOR UPDATE
USING (solicitante_id = auth.uid() AND estado <> 'cerrado')
WITH CHECK (solicitante_id = auth.uid());
