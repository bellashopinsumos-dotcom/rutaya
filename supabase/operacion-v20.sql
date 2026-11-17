-- RutaYa v20 · operaciones, tarifas y seguimiento.
-- Ejecutar DESPUÉS de supabase/schema.sql y supabase/courier-onboarding.sql.
-- En el proyecto RutaYa existente ya fueron aplicados estos cambios.
-- NO ejecutar en el Supabase de inventario de Bella Shop.
alter table public.tariff_zones add column if not exists is_example boolean not null default true;
create index if not exists courier_reviews_reviewer_idx on public.courier_reviews(reviewer_id);

CREATE OR REPLACE FUNCTION public.admin_get_rutaya_zones()
 RETURNS TABLE(name text, fee integer, active boolean, is_example boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Acceso exclusivo de administración';end if;
 return query select z.name,z.fee,z.active,z.is_example
 from public.tariff_zones z order by z.active desc,z.name;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_reassign_rutaya_order(p_order_id uuid, p_reason text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_order public.orders;v_reason text;
begin
 if v_id is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración puede reasignar pedidos';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe un motivo de al menos cinco caracteres';end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Pedido no encontrado';end if;
 if v_order.status not in('accepted','at_pickup') then
   raise exception 'No es posible reasignar un pedido recogido o finalizado. Debes coordinarlo directamente';
 end if;
 update public.orders set status='pending',courier_id=null,updated_at=now()
 where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'reassigned: '||v_reason,v_id);
 return v_order;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_set_rutaya_fee(p_order_id uuid, p_fee integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede cambiar la tarifa';end if;
 if p_fee is null or p_fee<0 or p_fee>1000000 then raise exception 'Tarifa inválida';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null then raise exception 'Pedido no encontrado';end if;
 if v_o.status<>'pending' then raise exception 'Solo puedes modificar una tarifa antes de asignar el pedido';end if;
 update public.orders set fee=p_fee,updated_at=now() where id=p_order_id;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'fee_adjusted',auth.uid());
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_rutaya_zone(p_name text, p_fee integer, p_active boolean, p_is_example boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text:=btrim(coalesce(p_name,''));
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede editar las tarifas';end if;
 if length(v_name)<2 or length(v_name)>80 or p_fee is null or p_fee<0 or p_fee>100000
 or p_active is null or p_is_example is null then
   raise exception 'Revisa el nombre, precio y estado de la zona';
 end if;
 insert into public.tariff_zones(name,fee,active,is_example)
 values(v_name,p_fee,p_active,p_is_example)
 on conflict(name) do update
 set fee=excluded.fee,active=excluded.active,is_example=excluded.is_example;
end;$function$;

CREATE OR REPLACE FUNCTION public.cancel_rutaya_order(p_order_id uuid, p_reason text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid:=auth.uid();v_order public.orders;v_admin boolean;v_business boolean;v_reason text;
begin
 if v_id is null then raise exception 'Debes iniciar sesión';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe un motivo de al menos cinco caracteres';end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Pedido no encontrado';end if;
 v_admin:=public.rutaya_is_role('admin');
 v_business:=v_order.source='business' and exists(
   select 1 from public.businesses b where b.id=v_order.business_id and b.owner_user_id=v_id
 );
 if not v_admin and not (v_order.created_by=v_id or v_business) then
   raise exception 'No tienes permiso para cancelar este pedido';
 end if;
 if v_order.status='pending' then null;
 elsif v_admin and v_order.status in('accepted','at_pickup') then null;
 elsif v_business and v_order.status in('accepted','at_pickup') then null;
 else raise exception 'El pedido ya está en camino o finalizado. Contacta a administración para resolverlo';
 end if;
 update public.orders set status='cancelled',updated_at=now()
 where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'cancelled: '||v_reason,v_id);
 return v_order;
end;$function$;

CREATE OR REPLACE FUNCTION public.create_rutaya_order(p_data jsonb)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid(); v_source text; v_service text; v_store public.businesses; v_fee integer; v_order public.orders;
        v_pickup_lat float8;v_pickup_lng float8;v_drop_lat float8;v_drop_lng float8; v_paid boolean; v_mode text; v_base_fee integer; v_local timestamp; v_dispatch timestamptz;
begin
 if v_id is null then raise exception 'Debes iniciar sesión';end if;
 v_source:=p_data->>'source'; v_service:=p_data->>'service';
 v_mode:=coalesce(p_data->>'delivery_mode','normal');
 if v_mode not in ('routed','normal','urgent') then raise exception 'Modalidad de entrega inválida'; end if;
 if v_source not in('customer','business') or v_service not in('shop','pickup','parcel','business') then raise exception 'Tipo de servicio inválido';end if;
 if v_source='business' then
   if not public.rutaya_is_role('business') then raise exception 'Negocio no autorizado';end if;
   select * into v_store from public.businesses where owner_user_id=v_id and approved=true;
   if v_store.id is null or v_store.lat is null or v_store.lng is null then raise exception 'Falta configurar la ubicación del negocio';end if;
   if v_service<>'business' then raise exception 'Servicio incorrecto para negocio';end if;
 else
   if not public.rutaya_is_role('customer') then raise exception 'Cuenta de cliente requerida';end if;
   if v_service='business' then raise exception 'Servicio incorrecto para cliente';end if;
 end if;
 if length(btrim(coalesce(p_data->>'items_description','')))<3 or length(coalesce(p_data->>'items_description',''))>1000 then raise exception 'Describe el pedido con más detalle (máximo 1000 caracteres)';end if;
 if length(btrim(coalesce(p_data->>'recipient_name','')))<2 then raise exception 'Indica el destinatario';end if;
 if regexp_replace(coalesce(p_data->>'recipient_phone',''),'[^0-9]','','g') !~ '^(3[0-9]{9}|573[0-9]{9})$' then raise exception 'Indica un celular colombiano válido (10 dígitos)';end if;
 if v_source='business' then
   v_pickup_lat:=v_store.lat;v_pickup_lng:=v_store.lng;
 else
   v_pickup_lat:=(p_data->>'pickup_lat')::float8;v_pickup_lng:=(p_data->>'pickup_lng')::float8;
 end if;
 v_drop_lat:=(p_data->>'dropoff_lat')::float8;v_drop_lng:=(p_data->>'dropoff_lng')::float8;
 if v_pickup_lat is null or v_pickup_lng is null or v_drop_lat is null or v_drop_lng is null
 or abs(v_pickup_lat)>90 or abs(v_drop_lat)>90 or abs(v_pickup_lng)>180 or abs(v_drop_lng)>180 then raise exception 'Confirma los puntos GPS de recogida y entrega';end if;
 v_paid:=coalesce((p_data->>'paid')::boolean,true);
 select fee into v_base_fee from public.tariff_zones where active=true and lower(name)=lower(coalesce(p_data->>'dropoff_zone','')) limit 1;
 if v_base_fee is null then raise exception 'Selecciona una zona de entrega válida para calcular el domicilio'; end if;
 v_fee:=greatest(0,v_base_fee+case v_mode when 'routed' then -1000 when 'urgent' then 1500 else 0 end);
 v_local:=now() at time zone 'America/Bogota';
 if v_mode='routed' then
   v_dispatch:=((v_local::date + (case when v_local::time < time '12:00' then 0 else 1 end)) + time '14:00') at time zone 'America/Bogota';
 else
   v_dispatch:=now();
 end if;
 insert into public.orders(created_by,business_id,source,service,items_description,pickup_name,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,dropoff_zone,recipient_name,recipient_phone,shopper_name,paid,amount_to_collect,delivery_notes,fee,delivery_mode,dispatch_after)
 values(v_id,v_store.id,v_source,v_service,left(p_data->>'items_description',1000),
   case when v_source='business' then v_store.name else left(coalesce(p_data->>'pickup_name',''),150) end,
   case when v_source='business' then v_store.address else left(coalesce(p_data->>'pickup_address',''),400) end,
   v_pickup_lat,v_pickup_lng,left(coalesce(p_data->>'dropoff_address',''),400),v_drop_lat,v_drop_lng,
   left(coalesce(p_data->>'dropoff_zone',''),80),left(coalesce(p_data->>'recipient_name',''),180),left(coalesce(p_data->>'recipient_phone',''),40),
   left(coalesce(p_data->>'shopper_name',''),180),v_paid,
   case when v_paid then 0 else greatest(0,least(coalesce((p_data->>'amount_to_collect')::integer,0),100000000)) end,
   left(coalesce(p_data->>'delivery_notes',''),500),v_fee,v_mode,v_dispatch)
 returning * into v_order;
 insert into public.order_events(order_id,event,actor_id) values(v_order.id,'created',v_id);
 return v_order;
end;$function$;

CREATE OR REPLACE FUNCTION public.release_rutaya_order(p_order_id uuid, p_reason text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_order public.orders;v_reason text;
begin
 if v_id is null then raise exception 'Debes iniciar sesión';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe un motivo de al menos cinco caracteres';end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null or v_order.courier_id is distinct from v_id then
   raise exception 'Este pedido no está asignado a tu cuenta';end if;
 if v_order.status not in('accepted','at_pickup') then
   raise exception 'Ya se recogió o terminó el pedido: no puedes liberarlo desde la app';end if;
 update public.orders set status='pending',courier_id=null,updated_at=now()
 where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'released: '||v_reason,v_id);
 return v_order;
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
   select * into v_l from public.courier_locations where courier_id=v_o.courier_id and updated_at>now()-interval '10 minutes';
 end if;
 return jsonb_build_object(
   'tracking_token',v_o.tracking_token,'service',v_o.service,'status',v_o.status,'delivery_mode',v_o.delivery_mode,'dispatch_after',v_o.dispatch_after,'items_description',v_o.items_description,
   'pickup_address',v_o.pickup_address,'dropoff_address',v_o.dropoff_address,'fee',v_o.fee,'created_at',v_o.created_at,'updated_at',v_o.updated_at,
   'courier_location',case when v_l.courier_id is not null then jsonb_build_object('lat',v_l.lat,'lng',v_l.lng,'accuracy',v_l.accuracy,'updated_at',v_l.updated_at) else null end);
end;$function$;


drop policy if exists "Tariffs public read" on public.tariff_zones;
create policy "Tariffs public read" on public.tariff_zones for select to anon,authenticated using(active=true);
drop policy if exists "Tariffs admin view inactive" on public.tariff_zones;
create policy "Tariffs admin view inactive" on public.tariff_zones for select to authenticated using(public.rutaya_is_role('admin'));

drop policy if exists "Stores are public when approved" on public.businesses;
drop policy if exists "Approved stores visible to guests" on public.businesses;
drop policy if exists "Approved and owned stores visible to users" on public.businesses;
create policy "Approved stores visible to guests" on public.businesses for select to anon using(approved=true);
create policy "Approved and owned stores visible to users" on public.businesses
 for select to authenticated using(approved=true or owner_user_id=(select auth.uid()) or public.rutaya_is_role('admin'));

revoke execute on function public.rutaya_is_role(text) from anon;
revoke execute on function public.cancel_rutaya_order(uuid,text) from public,anon;
revoke execute on function public.release_rutaya_order(uuid,text) from public,anon;
revoke execute on function public.admin_reassign_rutaya_order(uuid,text) from public,anon;
revoke execute on function public.admin_upsert_rutaya_zone(text,integer,boolean,boolean) from public,anon;
revoke execute on function public.admin_get_rutaya_zones() from public,anon;
grant execute on function public.cancel_rutaya_order(uuid,text) to authenticated;
grant execute on function public.release_rutaya_order(uuid,text) to authenticated;
grant execute on function public.admin_reassign_rutaya_order(uuid,text) to authenticated;
grant execute on function public.admin_upsert_rutaya_zone(text,integer,boolean,boolean) to authenticated;
grant execute on function public.admin_get_rutaya_zones() to authenticated;


-- Asignación directa a un domiciliario aprobado.
CREATE OR REPLACE FUNCTION public.admin_assign_rutaya_order(p_order_id uuid, p_courier_id uuid, p_reason text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_admin uuid:=auth.uid();v_order public.orders;v_profile public.profiles;
 v_count integer;v_picked integer;v_reason text;
begin
 if v_admin is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración puede asignar domicilios';end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe un motivo de al menos cinco caracteres';end if;
 if p_courier_id is null then raise exception 'Selecciona un domiciliario';end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Pedido no encontrado';end if;
 if v_order.status not in('pending','accepted','at_pickup') then
  raise exception 'No puedes reasignar un paquete ya recogido o finalizado';
 end if;
 if v_order.status='pending' and v_order.dispatch_after>now() then
  raise exception 'Este servicio enrutado aún no está disponible para despacho';
 end if;
 select * into v_profile from public.profiles where user_id=p_courier_id for update;
 if v_profile.user_id is null or v_profile.role<>'courier' or not v_profile.approved then
  raise exception 'Ese domiciliario no está autorizado';
 end if;
 select count(*) into v_count from public.orders where courier_id=p_courier_id and status in('accepted','at_pickup','picked_up','at_dropoff') and id<>p_order_id;
 select count(*) into v_picked from public.orders where courier_id=p_courier_id and status in('picked_up','at_dropoff') and id<>p_order_id;
 if v_count>=5 then raise exception 'El repartidor ya tiene cinco servicios activos';end if;
 if v_picked>0 then raise exception 'El repartidor debe finalizar sus entregas recogidas primero';end if;
 update public.orders set courier_id=p_courier_id,status='accepted',updated_at=now()
 where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'assigned_by_admin: '||v_reason,v_admin);
 return v_order;
end;$function$;
revoke execute on function public.admin_assign_rutaya_order(uuid,uuid,text) from public,anon;
grant execute on function public.admin_assign_rutaya_order(uuid,uuid,text) to authenticated;
