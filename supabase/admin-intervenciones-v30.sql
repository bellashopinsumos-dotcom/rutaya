-- RutaYa v30 · Correcciones manuales auditadas desde Administración.
-- Aplicar después de mapa-flota-v26.sql en instalaciones nuevas.
-- Ya instalado en la base RutaYa principal. NO ejecutar en el inventario Bella Shop.
create table if not exists public.admin_order_interventions (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id) on delete restrict,
 admin_id uuid not null references auth.users(id),
 courier_id uuid references auth.users(id),
 previous_status text not null,
 new_status text not null check (new_status in ('at_pickup','picked_up','at_dropoff','delivered')),
 verification_method text not null check (verification_method in ('recipient_phone','recipient_whatsapp','in_person','other_evidence')),
 reason text not null check (length(btrim(reason)) between 10 and 500),
 physical_or_recipient_confirmation boolean not null check (physical_or_recipient_confirmation is true),
 created_at timestamptz not null default now()
);
create index if not exists admin_order_interventions_order_idx on public.admin_order_interventions(order_id,created_at desc);
alter table public.admin_order_interventions enable row level security;
revoke all on public.admin_order_interventions from public,anon,authenticated;
grant select on public.admin_order_interventions to authenticated;
drop policy if exists "Admin sees order interventions" on public.admin_order_interventions;
create policy "Admin sees order interventions" on public.admin_order_interventions
 for select to authenticated using (public.rutaya_is_role('admin'));

CREATE OR REPLACE FUNCTION public.admin_override_rutaya_order_status(p_order_id uuid, p_new_status text, p_reason text, p_verification_method text, p_confirmed boolean)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid:=auth.uid();
 v_order public.orders;
 v_before text;
 v_reason text;
 v_event text;
begin
 if v_id is null or not public.rutaya_is_role('admin') then
  raise exception 'Solo Administración puede corregir el estado de un pedido';
 end if;
 v_reason:=btrim(coalesce(p_reason,''));
 if length(v_reason)<10 or length(v_reason)>500 then
  raise exception 'Escribe un motivo claro de 10 a 500 caracteres';
 end if;
 if p_confirmed is distinct from true then
  raise exception 'Confirma que verificaste que la etapa ocurrió realmente';
 end if;
 if p_verification_method is null or p_verification_method not in
 ('recipient_phone','recipient_whatsapp','in_person','other_evidence') then
  raise exception 'Indica cómo verificaste lo ocurrido';
 end if;
 if p_new_status is null or p_new_status not in ('at_pickup','picked_up','at_dropoff','delivered') then
  raise exception 'Solo se puede avanzar el pedido por una etapa válida';
 end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Pedido no encontrado'; end if;
 if v_order.status in ('delivered','cancelled') then
  raise exception 'Un pedido entregado o cancelado no puede modificarse desde este control';
 end if;
 if v_order.courier_id is null then
  raise exception 'Primero asigna el pedido a un domiciliario antes de cambiar su etapa';
 end if;
 if v_order.status not in ('accepted','at_pickup','picked_up','at_dropoff') then
  raise exception 'Primero debe haber un domiciliario asignado al pedido';
 end if;
 -- Avanzar, nunca retroceder o registrar la misma etapa dos veces.
 if not (
 (v_order.status='accepted' and p_new_status in ('at_pickup','picked_up','at_dropoff','delivered')) or
 (v_order.status='at_pickup' and p_new_status in ('picked_up','at_dropoff','delivered')) or
 (v_order.status='picked_up' and p_new_status in ('at_dropoff','delivered')) or
 (v_order.status='at_dropoff' and p_new_status='delivered')
 ) then
  raise exception 'El estado seleccionado no es posterior al estado actual';
 end if;
 v_before:=v_order.status;
 update public.orders set status=p_new_status,updated_at=now()
 where id=v_order.id returning * into v_order;
 insert into public.admin_order_interventions(
  order_id,admin_id,courier_id,previous_status,new_status,
  verification_method,reason,physical_or_recipient_confirmation
 ) values (
  v_order.id,v_id,v_order.courier_id,v_before,p_new_status,
  p_verification_method,v_reason,true
 );
 v_event:='ADMIN_MANUAL_STATUS ['||v_before||' -> '||p_new_status||
 '] [verification:'||p_verification_method||'] [courier:'||v_order.courier_id::text||
 '] [NO_OTP_NO_GPS]: '||left(v_reason,400);
 insert into public.order_events(order_id,event,actor_id) values(v_order.id,v_event,v_id);
 return v_order;
end;$function$;

revoke all on function public.admin_override_rutaya_order_status(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.admin_override_rutaya_order_status(uuid,text,text,text,boolean) to authenticated;

-- Los estados terminales no se alteran. Si no hay courier_id primero se debe asignar
-- un repartidor. Nunca se crea registro falso de OTP ni de ubicación GPS.
-- La intervención se audita tanto en admin_order_interventions como en order_events.
