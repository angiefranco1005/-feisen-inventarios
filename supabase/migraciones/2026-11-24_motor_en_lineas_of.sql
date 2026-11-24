-- Motor de cada línea de OF (2026-11-24, pedido de Angie, alternativa 1).
-- Ventas ponía el motor como texto en el detalle y Logística no veía qué motores
-- tenía que conseguir. Ahora cada línea dice si lleva motor y cuál:
--   motor = 'sin'      → la máquina va sin motor
--   motor = 'cliente'  → el cliente pone el motor
--   motor = 'feisen'   → sale de la bodega MOTORES; motor_item_id = cuál (items)
-- NULL = línea vieja, creada antes de esta pregunta.
-- Re-ejecutable.

alter table public.items_of add column if not exists motor text;
alter table public.items_of add column if not exists motor_item_id uuid references public.items(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_of_motor_check') then
    alter table public.items_of add constraint items_of_motor_check
      check (motor is null or motor in ('sin', 'cliente', 'feisen'));
  end if;
  -- Solo una línea con motor de Feisen puede tener motor elegido
  if not exists (select 1 from pg_constraint where conname = 'items_of_motor_item_check') then
    alter table public.items_of add constraint items_of_motor_item_check
      check (motor_item_id is null or motor = 'feisen');
  end if;
end $$;

create index if not exists idx_items_of_motor_item on public.items_of (motor_item_id) where motor_item_id is not null;
