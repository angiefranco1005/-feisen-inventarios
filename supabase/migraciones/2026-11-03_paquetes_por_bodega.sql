-- Paquetes por bodega (2026-11-03): Almacén (Mateo Giraldo) arma y edita los paquetes de su
-- bodega. Hasta ahora solo ADMIN podía. Re-ejecutable; no toca paquetes ni piezas existentes.

-- 1) El rol ALMACENISTA ve el módulo Paquetes (se puede quitar en Configuración › Permisos)
insert into public.rol_permisos (rol, modulo, nivel)
values ('ALMACENISTA', 'paquetes', 'todo')
on conflict (rol, modulo) do update set nivel = excluded.nivel;

-- 2) Quien tenga el módulo en 'todo' modifica solo los paquetes de sus bodegas asignadas
--    (ADMIN sigue con su política de siempre).
drop policy if exists paquetes_manage_bodega on public.paquetes;
create policy paquetes_manage_bodega on public.paquetes for all to authenticated
  using (public.mi_nivel('paquetes') = 'todo'
         and bodega_id in (select bodega_id from public.profile_bodegas where profile_id = auth.uid()))
  with check (public.mi_nivel('paquetes') = 'todo'
         and bodega_id in (select bodega_id from public.profile_bodegas where profile_id = auth.uid()));

drop policy if exists paquete_items_manage_bodega on public.paquete_items;
create policy paquete_items_manage_bodega on public.paquete_items for all to authenticated
  using (public.mi_nivel('paquetes') = 'todo' and exists (
    select 1 from public.paquetes p join public.profile_bodegas pb on pb.bodega_id = p.bodega_id
    where p.id = paquete_items.paquete_id and pb.profile_id = auth.uid()))
  with check (public.mi_nivel('paquetes') = 'todo' and exists (
    select 1 from public.paquetes p join public.profile_bodegas pb on pb.bodega_id = p.bodega_id
    where p.id = paquete_items.paquete_id and pb.profile_id = auth.uid()));
