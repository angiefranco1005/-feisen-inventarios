-- Pedidos con varias OC + compra directa por línea (2026-11-03)
-- Cuánto de cada línea del pedido se compró sin OC (compra directa). Con esto y lo que
-- cubren las OC, la app sabe qué falta por comprar. Re-ejecutable; no toca datos.
alter table public.pedido_items
  add column if not exists cantidad_compra_directa numeric not null default 0;
