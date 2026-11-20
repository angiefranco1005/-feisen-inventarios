-- Innovación: «¿Cuánto nos sale ahora?» (pedido de Angie, 2026-11-20).
-- El costo unitario se divide en dos: lo que cuesta hoy por unidad (columna nueva costo_actual)
-- y lo que costará después del cambio (se reusa costo_unitario). Solo agrega una columna vacía.
-- Se puede correr varias veces.
alter table public.innovacion_proyectos
  add column if not exists costo_actual numeric;   -- COP por unidad, antes del cambio
