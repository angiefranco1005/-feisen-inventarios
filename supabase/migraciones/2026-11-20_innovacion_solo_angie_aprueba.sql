-- Innovación: solo Angie aprueba (firma) un proyecto (pedido de Angie, 2026-11-20).
-- La pantalla ya solo le muestra a ella «Aprobar proyecto»; esto lo bloquea también en la base,
-- para cualquier otro usuario aunque sea ADMIN o llame la API directo.
--
-- Bloquea, si quien escribe no es Angie:
--   · pasar un proyecto a «aprobado» o «aprobado con ajustes»
--   · cambiar la firma (decidido_por, decidido_at) o el monto aprobado
-- Además, la firma solo puede quedar a nombre de quien aprueba (decidido_por = usuario actual).
-- Las sesiones sin usuario (SQL Editor, service role) no se bloquean, para mantenimiento.
-- Se puede correr varias veces.

create or replace function public.innovacion_solo_angie_aprueba()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  angie constant uuid := 'ef361cdc-5333-4e22-a93e-89d50d2a2e1e';
  yo uuid := auth.uid();
  toca_aprobacion boolean;
begin
  if yo is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    toca_aprobacion := new.estado in ('aprobado', 'aprobado_ajustes')
      or new.decidido_por is not null or new.decidido_at is not null or new.monto_aprobado is not null;
  else
    toca_aprobacion :=
      (new.estado in ('aprobado', 'aprobado_ajustes') and old.estado is distinct from new.estado)
      or new.decidido_por   is distinct from old.decidido_por
      or new.decidido_at    is distinct from old.decidido_at
      or new.monto_aprobado is distinct from old.monto_aprobado;
  end if;

  if toca_aprobacion and yo <> angie then
    raise exception 'Solo Angie Franco puede aprobar un proyecto de innovación.'
      using errcode = '42501';
  end if;

  if toca_aprobacion and new.decidido_por is not null and new.decidido_por <> yo then
    raise exception 'La aprobación solo puede quedar firmada a nombre de quien aprueba.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists innovacion_solo_angie_aprueba on public.innovacion_proyectos;
create trigger innovacion_solo_angie_aprueba
  before insert or update on public.innovacion_proyectos
  for each row execute function public.innovacion_solo_angie_aprueba();
