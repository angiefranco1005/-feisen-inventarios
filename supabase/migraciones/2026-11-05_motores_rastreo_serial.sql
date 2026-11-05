-- 2026-11-05 · Motores por serial: la base lleva sola la lista de seriales y se carga el historial.
-- Pedido de Angie: saber de cada motor cuándo entró, cuándo salió, en qué OF y a qué cliente.
-- Antes la app escribía en motor_seriales solo cuando el serial se escogía de la lista; los
-- escritos a mano (casi todas las salidas, porque 56 de los 77 motores en bodega no tienen serial
-- cargado) quedaban solo como texto en movimientos.serial_motor.
-- Ahora:
--   · Toda entrada o salida de la bodega MOTORES con serial actualiza motor_seriales (trigger), la
--     registre quien la registre. La app ya no escribe en la tabla (evita el doble registro).
--   · Un motor que sale y vuelve a entrar se reactiva (antes chocaba con el índice único).
--   · Corregir el serial de una salida en el Historial corrige también la tabla.
--   · Se cargan las entradas y salidas viejas que tienen serial escrito.
-- El cliente no se guarda aquí: la pantalla lo saca de ordenes_fabricacion con numero_of.
-- Re-ejecutable.

-- 1. Texto libre → lista de seriales ---------------------------------------------------------
--    "a - b - c", "a, b", "a/b" → {A,B,C}. Un pedazo de menos de 6 caracteres se pega al anterior
--    con guion, porque hay seriales con guion propio (EX260421-3338, 260411-2333).
create or replace function public.motor_seriales_de_texto(t text) returns text[]
language plpgsql immutable as $$
declare
  p text;
  sal text[] := '{}';
  n int;
begin
  if t is null then return sal; end if;
  foreach p in array regexp_split_to_array(t, '\s*[,;/]\s*|\s*-\s*') loop
    p := upper(regexp_replace(btrim(p), '\s+', ' ', 'g'));
    if p = '' then continue; end if;
    n := coalesce(array_length(sal, 1), 0);
    if length(p) < 6 and n > 0 then
      sal[n] := sal[n] || '-' || p;
    else
      sal := sal || p;
    end if;
  end loop;
  return sal;
end $$;

-- 2. Registrar una entrada o salida de MOTORES en motor_seriales --------------------------------
--    Devuelve los seriales que no se pudieron registrar (para el informe de la carga).
create or replace function public.fn_motor_serial_registrar(m public.movimientos, cuando timestamptz)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  s text;
  fila public.motor_seriales;
  bodega uuid := case when m.tipo = 'entrada' then m.bodega_destino_id else m.bodega_origen_id end;
  problemas text[] := '{}';
begin
  if m.tipo not in ('entrada', 'salida') or coalesce(btrim(m.serial_motor), '') = '' then return problemas; end if;
  if not exists (select 1 from bodegas b where b.id = bodega and upper(btrim(b.nombre)) = 'MOTORES') then return problemas; end if;

  foreach s in array motor_seriales_de_texto(m.serial_motor) loop
    select * into fila from motor_seriales
     where item_id = m.item_id and upper(btrim(serial)) = s
     for update;

    if m.tipo = 'entrada' then
      if not found then
        insert into motor_seriales (item_id, bodega_id, serial, entrada_mov_id, created_at)
        values (m.item_id, bodega, s, m.id, cuando);
      elsif fila.estado = 'despachado' then
        -- Volvió a entrar (devolución): queda disponible con su nueva entrada
        update motor_seriales
           set estado = 'disponible', entrada_mov_id = m.id, salida_mov_id = null, numero_of = null, despachado_en = null
         where id = fila.id;
      elsif fila.entrada_mov_id is null then
        update motor_seriales set entrada_mov_id = m.id where id = fila.id;
      elsif fila.entrada_mov_id <> m.id then
        problemas := problemas || (s || ' ya estaba en bodega');
      end if;
    else
      if not found then
        -- Salió sin haber entrado con serial (lo normal en el historial): queda despachado sin entrada
        insert into motor_seriales (item_id, bodega_id, serial, estado, salida_mov_id, numero_of, despachado_en, created_at)
        values (m.item_id, bodega, s, 'despachado', m.id, nullif(btrim(m.numero_of), ''), cuando, cuando);
      elsif fila.estado = 'disponible' then
        update motor_seriales
           set estado = 'despachado', salida_mov_id = m.id, numero_of = nullif(btrim(m.numero_of), ''), despachado_en = cuando
         where id = fila.id;
      elsif fila.salida_mov_id is distinct from m.id then
        problemas := problemas || (s || ' ya había salido');
      end if;
    end if;
  end loop;
  return problemas;
end $$;

-- 3. Al registrar un movimiento ------------------------------------------------------------------
create or replace function public.fn_motor_seriales_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fn_motor_serial_registrar(new, now());
  return new;
end $$;

drop trigger if exists trg_motor_seriales_insert on public.movimientos;
create trigger trg_motor_seriales_insert
  after insert on public.movimientos
  for each row when (new.tipo in ('entrada', 'salida') and new.serial_motor is not null)
  execute function public.fn_motor_seriales_insert();

-- 4. Al eliminar, revertir o corregir (amplía la del 29/10) ----------------------------------------
create or replace function public.fn_motor_seriales_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.movimientos;
  cuando timestamptz;
begin
  if tg_op = 'DELETE' then
    m := old;
  elsif new.revertido and not old.revertido then
    m := new;
  else
    if new.serial_motor is distinct from old.serial_motor then
      if new.tipo = 'entrada' and coalesce(btrim(new.serial_motor), '') <> '' and cardinality(motor_seriales_de_texto(new.serial_motor)) = 1 then
        update motor_seriales set serial = (motor_seriales_de_texto(new.serial_motor))[1] where entrada_mov_id = new.id;
      elsif new.tipo = 'salida' then
        -- Se deshace lo que hizo la salida y se vuelve a registrar con el serial corregido
        cuando := coalesce((select despachado_en from motor_seriales where salida_mov_id = new.id limit 1), now());
        delete from motor_seriales where salida_mov_id = new.id and entrada_mov_id is null;
        update motor_seriales
           set estado = 'disponible', salida_mov_id = null, numero_of = null, despachado_en = null
         where salida_mov_id = new.id;
        perform fn_motor_serial_registrar(new, cuando);
      end if;
    end if;
    if new.tipo = 'salida' and new.numero_of is distinct from old.numero_of then
      update motor_seriales set numero_of = nullif(btrim(new.numero_of), '') where salida_mov_id = new.id;
    end if;
    return new;
  end if;

  if m.tipo = 'salida' then
    update motor_seriales
       set estado = 'disponible', salida_mov_id = null, numero_of = null, despachado_en = null
     where salida_mov_id = m.id;
  elsif m.tipo = 'entrada' then
    delete from motor_seriales where entrada_mov_id = m.id and estado = 'disponible';
    update motor_seriales set entrada_mov_id = null where entrada_mov_id = m.id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_motor_seriales_sync on public.movimientos;
create trigger trg_motor_seriales_sync
  before delete or update of revertido, serial_motor, numero_of on public.movimientos
  for each row execute function public.fn_motor_seriales_sync();

-- 5. Cargar el historial -------------------------------------------------------------------------
--    En orden de fecha, cada entrada/salida vigente de MOTORES con serial que la tabla no tenga.
--    movimientos.created_at es hora Colombia marcada como UTC: +5 h para guardarla bien.
do $$
declare
  r public.movimientos;
begin
  for r in
    select m.* from movimientos m
     where m.tipo in ('entrada', 'salida') and not m.revertido
       and coalesce(btrim(m.serial_motor), '') <> ''
       and not exists (select 1 from motor_seriales ms where ms.entrada_mov_id = m.id or ms.salida_mov_id = m.id)
     order by m.created_at, m.tipo   -- a igual hora, la entrada antes que la salida
  loop
    perform fn_motor_serial_registrar(r, r.created_at + interval '5 hours');
  end loop;
end $$;
