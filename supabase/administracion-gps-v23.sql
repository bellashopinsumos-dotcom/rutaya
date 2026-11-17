-- RutaYa v23: gestión extraordinaria para dueño administrador y GPS seguro.
-- Ejecutar después de supabase/admin-cancelaciones-v22.sql y las migraciones anteriores.
-- Ejecutado en Supabase RutaYa el 17 nov 2026.
-- Los cambios de pedidos tienen auditoría, los entregados/cancelados quedan inmutables.
-- Los paquetes recogidos requieren confirmación de custodia para liberarse o reasignarse.
-- No ejecutar en el proyecto Supabase de inventario Bella Shop.

CREATE OR REPLACE FUNCTION public.admin_force_assign_rutaya_order(p_order_id uuid, p_courier_id uuid, p_reason text, p_handover_confirmed boolean DEFAULT false)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_o public.orders;v_profile public.profiles;v_reason text;
 v_after_pickup boolean;v_count int;v_picked int;v_previous uuid;v_next text;
begin
 if v_id is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración puede reasignar servicios';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Indica por qué se cambia el repartidor';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null then raise exception 'Pedido no encontrado';end if;
 if v_o.status not in('pending','accepted','at_pickup','picked_up','at_dropoff') then
  raise exception 'Este pedido está finalizado';end if;
 if p_courier_id is null then raise exception 'Selecciona un repartidor';end if;
 select * into v_profile from public.profiles where user_id=p_courier_id for update;
 if v_profile.user_id is null or v_profile.role<>'courier' or not v_profile.approved then
  raise exception 'El repartidor debe estar autorizado';end if;
 v_after_pickup:=v_o.status in('picked_up','at_dropoff');
 if v_after_pickup and p_handover_confirmed is distinct from true then
  raise exception 'Confirma que el nuevo repartidor recibió físicamente el paquete';end if;
 if v_o.courier_id=p_courier_id then raise exception 'El servicio ya está asignado a ese repartidor';end if;
 select count(*) into v_count from public.orders where courier_id=p_courier_id
  and status in('accepted','at_pickup','picked_up','at_dropoff') and id<>p_order_id;
 select count(*) into v_picked from public.orders where courier_id=p_courier_id
  and status in('picked_up','at_dropoff') and id<>p_order_id;
 if v_count>=5 then raise exception 'El repartidor ya tiene cinco pedidos activos';end if;
 if v_picked>0 then raise exception 'El repartidor debe finalizar sus pedidos recogidos antes de recibir otro';end if;
 v_previous:=v_o.courier_id;
 v_next:=case when v_after_pickup then 'picked_up' else 'accepted' end;
 update public.orders set courier_id=p_courier_id,status=v_next,updated_at=now()
  where id=p_order_id returning * into v_o;
 insert into public.order_events(order_id,event,actor_id) values(p_order_id,
  (case when v_after_pickup then 'admin_reassign_after_handover' else 'admin_assign' end)||
  ' [old:'||coalesce(v_previous::text,'none')||';new:'||p_courier_id::text||']: '||v_reason,v_id);
 return v_o;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_release_rutaya_order(p_order_id uuid, p_reason text, p_handover_confirmed boolean DEFAULT false)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_o public.orders;v_reason text;v_after_pickup boolean;v_previous uuid;
begin
 if v_id is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración puede liberar pedidos';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe el motivo del cambio';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null then raise exception 'Pedido no encontrado';end if;
 if v_o.status not in('accepted','at_pickup','picked_up','at_dropoff') then
  raise exception 'Este pedido no tiene un repartidor activo para liberar';end if;
 v_after_pickup:=v_o.status in('picked_up','at_dropoff');
 if v_after_pickup and p_handover_confirmed is distinct from true then
  raise exception 'Debes confirmar la recuperación física del paquete antes de liberarlo';end if;
 v_previous:=v_o.courier_id;
 update public.orders set status='pending',courier_id=null,updated_at=now() where id=p_order_id returning * into v_o;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,(case when v_after_pickup then 'admin_release_after_recovery' else 'admin_release' end)
       ||' [courier:'||coalesce(v_previous::text,'none')||']: '||v_reason,v_id);
 return v_o;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_rutaya_order_history(p_order_id uuid)
 RETURNS TABLE(event text, occurred_at timestamp with time zone, actor_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede consultar el historial';end if;
 return query select e.event,e.occurred_at,e.actor_id
 from public.order_events e where e.order_id=p_order_id order by e.occurred_at desc limit 70;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_set_rutaya_fee(p_order_id uuid, p_fee integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;v_old integer;
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede cambiar la tarifa';end if;
 if p_fee is null or p_fee<0 or p_fee>1000000 then raise exception 'Tarifa inválida';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null then raise exception 'Pedido no encontrado';end if;
 if v_o.status in('delivered','cancelled') then raise exception 'El pedido finalizó: no puedes modificar el valor histórico';end if;
 v_old:=v_o.fee;
 update public.orders set fee=p_fee,updated_at=now() where id=p_order_id;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'admin_fee_adjustment ['||coalesce(v_old::text,'none')||'->'||p_fee::text||']',auth.uid());
end;$function$;

CREATE OR REPLACE FUNCTION public.stop_rutaya_courier_location()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();
begin
 if v_id is null or not public.rutaya_is_role('courier') then
  raise exception 'Domiciliario no autorizado';end if;
 delete from public.courier_locations where courier_id=v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.track_rutaya_order(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;v_l public.courier_locations;
begin
 select * into v_o from public.orders where tracking_token=p_token;
 if v_o.id is null then return null;end if;
 if v_o.courier_id is not null and v_o.status not in('delivered','cancelled') then
  select * into v_l from public.courier_locations where courier_id=v_o.courier_id
   and updated_at>now()-interval '2 minutes';
 end if;
 return jsonb_build_object(
  'tracking_token',v_o.tracking_token,'service',v_o.service,'status',v_o.status,
  'delivery_mode',v_o.delivery_mode,'dispatch_after',v_o.dispatch_after,
  'items_description',v_o.items_description,'pickup_address',v_o.pickup_address,
  'dropoff_address',v_o.dropoff_address,'dropoff_lat',v_o.dropoff_lat,'dropoff_lng',v_o.dropoff_lng,
  'fee',v_o.fee,'created_at',v_o.created_at,'updated_at',v_o.updated_at,
  'courier_location',case when v_l.courier_id is not null then
   jsonb_build_object('lat',v_l.lat,'lng',v_l.lng,'accuracy',v_l.accuracy,'updated_at',v_l.updated_at)
   else null end
 );
end;$function$;


revoke execute on function public.admin_release_rutaya_order(uuid,text,boolean) from public,anon;
revoke execute on function public.admin_force_assign_rutaya_order(uuid,uuid,text,boolean) from public,anon;
revoke execute on function public.admin_rutaya_order_history(uuid) from public,anon;
revoke execute on function public.stop_rutaya_courier_location() from public,anon;
grant execute on function public.admin_release_rutaya_order(uuid,text,boolean) to authenticated;
grant execute on function public.admin_force_assign_rutaya_order(uuid,uuid,text,boolean) to authenticated;
grant execute on function public.admin_rutaya_order_history(uuid) to authenticated;
grant execute on function public.stop_rutaya_courier_location() to authenticated;
