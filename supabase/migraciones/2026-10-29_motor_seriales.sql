-- 2026-10-29 · Seguimiento de motores por serial (bodega MOTORES)
-- Una fila por motor físico: su serial, si está disponible o ya salió, y a qué OF salió.
-- Re-ejecutable.

-- 1. Tabla ---------------------------------------------------------------------
create table if not exists public.motor_seriales (
  id             uuid primary key default uuid_generate_v4(),
  item_id        uuid not null references public.items(id) on delete cascade,
  bodega_id      uuid not null references public.bodegas(id),
  serial         text not null check (btrim(serial) <> ''),
  estado         text not null default 'disponible' check (estado in ('disponible', 'despachado')),
  entrada_mov_id uuid references public.movimientos(id) on delete set null,
  salida_mov_id  uuid references public.movimientos(id) on delete set null,
  numero_of      text,
  despachado_en  timestamptz,
  created_at     timestamptz not null default now()
);
-- Un mismo serial no puede estar dos veces en el mismo producto
create unique index if not exists motor_seriales_item_serial on public.motor_seriales (item_id, upper(btrim(serial)));
create index if not exists motor_seriales_disponibles on public.motor_seriales (item_id) where estado = 'disponible';

alter table public.motor_seriales enable row level security;
drop policy if exists motor_seriales_select on public.motor_seriales;
drop policy if exists motor_seriales_insert on public.motor_seriales;
drop policy if exists motor_seriales_update on public.motor_seriales;
drop policy if exists motor_seriales_delete on public.motor_seriales;
create policy motor_seriales_select on public.motor_seriales for select
  using (get_my_rol() = any (array['ADMIN','LOGISTICA','ALMACENISTA','CONSULTOR','JEFE_FUNDICION','JEFE_MECANIZADOS']));
create policy motor_seriales_insert on public.motor_seriales for insert
  with check (get_my_rol() = any (array['ADMIN','LOGISTICA','ALMACENISTA']));
create policy motor_seriales_update on public.motor_seriales for update
  using (get_my_rol() = any (array['ADMIN','LOGISTICA','ALMACENISTA']));
create policy motor_seriales_delete on public.motor_seriales for delete
  using (get_my_rol() = 'ADMIN');

-- 2. Mantenerla al día cuando se elimina, revierte o corrige un movimiento ---------
--    · Salida eliminada/revertida → el motor vuelve a estar disponible.
--    · Entrada eliminada/revertida → el serial se quita (si el motor no ha salido).
--    · Se corrige el serial de una entrada en el Historial → se corrige aquí también.
create or replace function public.fn_motor_seriales_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.movimientos;
begin
  if tg_op = 'DELETE' then
    m := old;
  elsif new.revertido and not old.revertido then
    m := new;
  else
    if new.tipo = 'entrada' and new.serial_motor is distinct from old.serial_motor and coalesce(btrim(new.serial_motor), '') <> '' then
      update motor_seriales set serial = btrim(new.serial_motor) where entrada_mov_id = new.id;
    end if;
    return new;
  end if;

  if m.tipo = 'salida' then
    update motor_seriales
       set estado = 'disponible', salida_mov_id = null, numero_of = null, despachado_en = null
     where salida_mov_id = m.id;
  elsif m.tipo = 'entrada' then
    delete from motor_seriales where entrada_mov_id = m.id and estado = 'disponible';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_motor_seriales_sync on public.movimientos;
create trigger trg_motor_seriales_sync
  before delete or update of revertido, serial_motor on public.movimientos
  for each row execute function public.fn_motor_seriales_sync();

-- 3. Pasar la carga de EQUIPMASTER (ENT-AF-0433) a una línea por motor ------------
--    Cada línea con varios seriales ("a - b - c") se borra (el trigger de stock la
--    descuenta) y se vuelve a crear como N líneas de 1 unidad, cada una con su serial
--    (el trigger de stock las suma). El stock final queda igual.
do $$
declare
  r record;
  s text;
  nuevo uuid;
begin
  for r in
    select * from movimientos
     where numero = 'ENT-AF-0433' and serial_motor like '% - %'
  loop
    delete from movimientos where id = r.id;
    foreach s in array string_to_array(r.serial_motor, ' - ') loop
      insert into movimientos (numero, tipo, item_id, bodega_destino_id, cantidad, precio_costo_snapshot,
                               centro_costo, usuario_id, referencia, motivo, serial_motor, fecha_movimiento, created_at)
      values (r.numero, r.tipo, r.item_id, r.bodega_destino_id, 1, r.precio_costo_snapshot,
              r.centro_costo, r.usuario_id, r.referencia, r.motivo, btrim(s), r.fecha_movimiento, r.created_at);
    end loop;
  end loop;
end $$;

-- 4. Registrar en la tabla los seriales de esa carga ----------------------------
insert into motor_seriales (item_id, bodega_id, serial, entrada_mov_id, created_at)
select m.item_id, m.bodega_destino_id, btrim(m.serial_motor), m.id, m.created_at
  from movimientos m
 where m.numero = 'ENT-AF-0433' and coalesce(btrim(m.serial_motor), '') <> ''
   and not exists (select 1 from motor_seriales ms where ms.entrada_mov_id = m.id);
