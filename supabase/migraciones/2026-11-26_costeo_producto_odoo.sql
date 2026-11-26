-- Costeo: vínculo de una ficha de máquina con su producto en Odoo (tabla ventas_odoo).
-- Sirve para que el inicio de Costeo muestre el precio promedio facturado y las unidades vendidas.
-- Es el nombre del producto tal como llega de Odoo de Feisen (ej. 'MEZCLADORA - 1 1/2 B').
-- Si está vacío, la app propone el producto por parecido de nombre.
alter table public.costeo_fichas add column if not exists producto_odoo text;

comment on column public.costeo_fichas.producto_odoo is
  'Nombre del producto en ventas_odoo (empresa feisen) que corresponde a esta máquina. Vacío = la app lo propone por nombre.';
