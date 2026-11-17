-- RutaYa · Fase operativa v25 (noviembre 2026).
-- Instalación NUEVA: aplicar schema.sql, courier-onboarding.sql,
-- operacion-v20.sql, invitaciones-v21.sql, admin-cancelaciones-v22.sql,
-- administracion-gps-v23.sql, y por último ESTE archivo.
-- Ya aplicado al proyecto Supabase RutaYa; no ejecutar en inventario Bella Shop.
-- No genera cobros reales ni notificaciones push fuera del navegador.
create table if not exists public.delivery_verifications(
 order_id uuid primary key references public.orders(id) on delete cascade,
 code text not null check(code ~ '^[0-9]{6}$'),
 attempts integer not null default 0,
 confirmed_at timestamptz,created_at timestamptz not null default now()
);
alter table public.delivery_verifications enable row level security;
create table if not exists public.courier_payouts(
 order_id uuid primary key references public.orders(id) on delete cascade,
 courier_id uuid not null references auth.users(id),
 amount integer not null check(amount between 0 and 1000000),
 paid_at timestamptz,updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create index if not exists courier_payouts_courier_idx on public.courier_payouts(courier_id,updated_at desc);
alter table public.courier_payouts enable row level security;
drop policy if exists "Courier sees own assigned payout" on public.courier_payouts;
create policy "Courier sees own assigned payout" on public.courier_payouts
 for select to authenticated using(courier_id=(select auth.uid()) or public.rutaya_is_role('admin'));
create table if not exists public.order_support_cases(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 opened_by uuid references auth.users(id),
 message text not null check(length(message) between 10 and 800),
 status text not null default 'open' check(status in('open','resolved')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,resolved_by uuid references auth.users(id)
);
alter table public.order_support_cases alter column opened_by drop not null;
create index if not exists order_support_cases_order_idx on public.order_support_cases(order_id);
create index if not exists order_support_cases_status_idx on public.order_support_cases(status,created_at desc);
alter table public.order_support_cases enable row level security;
drop policy if exists "Support case owner/admin can view" on public.order_support_cases;
create policy "Support case owner/admin can view" on public.order_support_cases
 for select to authenticated using(opened_by=(select auth.uid()) or public.rutaya_is_role('admin'));
create table if not exists public.order_ratings(
 order_id uuid primary key references public.orders(id) on delete cascade,
 stars integer not null check(stars between 1 and 5),
 comment text not null default '',created_at timestamptz not null default now()
);
alter table public.order_ratings enable row level security;
drop policy if exists "Admins review customer ratings" on public.order_ratings;
create policy "Admins review customer ratings" on public.order_ratings
for select to authenticated using(public.rutaya_is_role('admin'));
alter table public.courier_applications add column if not exists identity_checked boolean not null default false;
alter table public.courier_applications add column if not exists vehicle_checked boolean not null default false;
alter table public.courier_applications add column if not exists verification_notes text not null default '';
alter table public.courier_applications add column if not exists verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_assign_rutaya_route(p_order_ids uuid[], p_courier_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_ids uuid[];v_n integer;v_active integer;v_picked integer;
 v_matching integer;v_stores integer;v_pickups integer;v_zones integer;v_profile public.profiles;
begin
 if v_id is null or not public.rutaya_is_role('admin') then raise exception 'Solo Administración puede asignar rutas';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Escribe un motivo';end if;
 if p_order_ids is null then raise exception 'Selecciona pedidos';end if;
 select array_agg(distinct x) into v_ids from unnest(p_order_ids) as x;
 v_n:=cardinality(v_ids);
 if v_n is null or v_n<2 or v_n>4 or v_n<>cardinality(p_order_ids) then
  raise exception 'Selecciona de dos a cuatro pedidos diferentes';end if;
 select * into v_profile from public.profiles where user_id=p_courier_id for update;
 if v_profile.user_id is null or v_profile.role<>'courier' or not v_profile.approved then
  raise exception 'Repartidor no autorizado';end if;
 select count(*) into v_active from public.orders where courier_id=p_courier_id and status in('accepted','at_pickup','picked_up','at_dropoff');
 select count(*) into v_picked from public.orders where courier_id=p_courier_id and status in('picked_up','at_dropoff');
 if v_active+v_n>5 or v_picked>0 then raise exception 'El repartidor no tiene capacidad para esta ruta';end if;
 perform 1 from public.orders where id=any(v_ids) for update;
 select count(*) filter(where status='pending' and delivery_mode='routed' and dispatch_after<=now()),
 count(distinct business_id),count(distinct pickup_address),count(distinct dropoff_zone)
 into v_matching,v_stores,v_pickups,v_zones
 from public.orders where id=any(v_ids);
 if v_matching<>v_n or v_stores<>1 or v_pickups<>1 or v_zones<>1 then
  raise exception 'La ruta necesita pedidos Enrutados disponibles del mismo negocio, recogida y zona';end if;
 update public.orders set courier_id=p_courier_id,status='accepted',updated_at=now()
 where id=any(v_ids);
 insert into public.order_events(order_id,event,actor_id)
 select o.id,'admin_grouped_route_assignment: '||left(p_reason,200),v_id
 from public.orders o where o.id=any(v_ids);
 return jsonb_build_object('assigned',v_n,'courier_id',p_courier_id);
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_courier_rating_summary()
 RETURNS TABLE(courier_id uuid, ratings integer, average_rating numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración';end if;
 return query
 select o.courier_id,count(*)::integer,round(avg(r.stars)::numeric,2)
 from public.order_ratings r join public.orders o on o.id=r.order_id
 where o.courier_id is not null group by o.courier_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_fleet_locations()
 RETURNS TABLE(courier_id uuid, name text, lat double precision, lng double precision, accuracy double precision, seen_at timestamp with time zone, active_orders integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede ver la flota';end if;
 return query
 select p.user_id,p.display_name,l.lat,l.lng,l.accuracy,l.updated_at,
  (select count(*)::integer from public.orders o
   where o.courier_id=p.user_id and o.status in('accepted','at_pickup','picked_up','at_dropoff'))
 from public.profiles p
 left join public.courier_locations l on l.courier_id=p.user_id and l.updated_at>now()-interval '2 minutes'
 where p.role='courier' and p.approved and exists(
 select 1 from public.orders o where o.courier_id=p.user_id and o.status in('accepted','at_pickup','picked_up','at_dropoff'))
 order by p.display_name;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_rutaya_support(p_case uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_case public.order_support_cases;
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración resuelve casos';end if;
 select * into v_case from public.order_support_cases where id=p_case for update;
 if v_case.id is null then raise exception 'Caso no encontrado';end if;
 update public.order_support_cases set status='resolved',resolved_at=now(),resolved_by=v_id where id=p_case;
 insert into public.order_events(order_id,event,actor_id) values(v_case.order_id,'support_case_resolved',v_id);
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_rutaya_payout(p_order_id uuid, p_amount integer, p_mark_paid boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;v_admin uuid:=auth.uid();v_current public.courier_payouts;
begin
 if v_admin is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración maneja pagos';end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 or p_mark_paid is null then
 raise exception 'Valor de pago no válido';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null or v_o.status<>'delivered' or v_o.courier_id is null then
 raise exception 'Solo se registra pago de pedidos entregados con repartidor';end if;
 select * into v_current from public.courier_payouts where order_id=p_order_id;
 if v_current.paid_at is not null and (v_current.amount<>p_amount or not p_mark_paid) then
 raise exception 'El pago ya fue registrado; no puede alterarse sin conciliación';end if;
 insert into public.courier_payouts(order_id,courier_id,amount,paid_at,updated_by)
 values(p_order_id,v_o.courier_id,p_amount,case when p_mark_paid then now() else null end,v_admin)
 on conflict(order_id) do update set amount=excluded.amount,
 paid_at=case when excluded.paid_at is not null then coalesce(public.courier_payouts.paid_at,excluded.paid_at)
 else public.courier_payouts.paid_at end,updated_by=v_admin,updated_at=now();
 insert into public.order_events(order_id,event,actor_id)
 values(p_order_id,'admin_payout_recorded ['||p_amount::text||case when p_mark_paid then ':paid' else ':pending' end||']',v_admin);
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_rutaya_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_days integer;v_out jsonb;
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede consultar estadísticas';end if;
 v_days:=least(365,greatest(1,coalesce(p_days,30)));
 select jsonb_build_object(
 'days',v_days,'orders',count(*),
 'delivered',count(*) filter(where status='delivered'),
 'cancelled',count(*) filter(where status='cancelled'),
 'pending',count(*) filter(where status='pending'),
 'active',count(*) filter(where status in('accepted','at_pickup','picked_up','at_dropoff')),
 'fees_delivered',coalesce(sum(fee) filter(where status='delivered'),0),
 'fees_requested',coalesce(sum(fee),0),
 'product_cash_to_collect',coalesce(sum(amount_to_collect) filter(where status='delivered' and not paid),0),
 'average_delivery_minutes',round(avg(extract(epoch from (updated_at-created_at))/60)
    filter(where status='delivered')::numeric,1)
 ) into v_out
 from public.orders where created_at>=now()-make_interval(days=>v_days);
 return v_out;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_verify_rutaya_courier(p_user uuid, p_identity boolean, p_vehicle boolean, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración verifica repartidores';end if;
 if p_identity is null or p_vehicle is null then raise exception 'Confirma qué verificaciones completaste';end if;
 update public.courier_applications set identity_checked=p_identity,vehicle_checked=p_vehicle,
 verification_notes=left(coalesce(p_notes,''),400),
 verified_at=case when p_identity and p_vehicle then now() else null end,
 updated_at=now() where user_id=p_user;
 if not found then raise exception 'Solicitud no encontrada';end if;
 insert into public.courier_reviews(courier_id,reviewer_id,approved)
 values(p_user,auth.uid(),p_identity and p_vehicle);
end;$function$;

CREATE OR REPLACE FUNCTION public.confirm_rutaya_delivery(p_order uuid, p_code text, p_lat double precision, p_lng double precision, p_accuracy double precision)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_o public.orders;v_v public.delivery_verifications;v_result public.orders;
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Repartidor no autorizado';end if;
 if p_accuracy is null or p_accuracy<0 or p_accuracy>100 or p_lat is null or p_lng is null
 or p_lat::text in('NaN','Infinity','-Infinity') or p_lng::text in('NaN','Infinity','-Infinity') then
  raise exception 'Para finalizar necesitas un GPS válido con precisión máxima de 100 metros';end if;
 select * into v_o from public.orders where id=p_order for update;
 if v_o.id is null or v_o.courier_id is distinct from v_id then
  raise exception 'No tienes asignado este pedido';end if;
 if v_o.status<>'at_dropoff' then raise exception 'Primero debes confirmar llegada a la dirección';end if;
 if public.rutaya_distance_meters(p_lat,p_lng,v_o.dropoff_lat,v_o.dropoff_lng)>200 then
  raise exception 'Debes estar a menos de 200 metros del destino';end if;
 select * into v_v from public.delivery_verifications where order_id=p_order for update;
 if v_v.order_id is not null then
  if v_v.attempts>=5 then raise exception 'Código bloqueado. Contacta a administración';end if;
  if btrim(coalesce(p_code,'')) is distinct from v_v.code then
   update public.delivery_verifications set attempts=attempts+1 where order_id=p_order;
   -- No lanzar excepción: conserva incremento de intentos.
   return null;
  end if;
  update public.delivery_verifications set confirmed_at=now() where order_id=p_order;
 end if;
 update public.orders set status='delivered',updated_at=now() where id=p_order returning * into v_result;
 insert into public.order_events(order_id,event,actor_id) values(p_order,'delivery_verified_with_code_and_gps',v_id);
 insert into public.courier_locations(courier_id,lat,lng,accuracy,updated_at)
 values(v_id,p_lat,p_lng,p_accuracy,now()) on conflict(courier_id) do update
 set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,updated_at=now();
 return v_result;
end;$function$;

CREATE OR REPLACE FUNCTION public.courier_rutaya_cash_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_out jsonb;
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Solo domiciliarios autorizados';end if;
 select jsonb_build_object(
 'delivered',count(*),'gross_delivery_fees',coalesce(sum(o.fee),0),
 'cash_products_to_reconcile',coalesce(sum(o.amount_to_collect) filter(where not o.paid),0),
 'approved_payouts',coalesce(sum(p.amount),0),
 'paid_payouts',coalesce(sum(p.amount) filter(where p.paid_at is not null),0),
 'unpaid_payouts',coalesce(sum(p.amount) filter(where p.paid_at is null),0),
 'unpriced_deliveries',count(*) filter(where p.order_id is null)
 )into v_out from public.orders o left join public.courier_payouts p on p.order_id=o.id
 where o.courier_id=v_id and o.status='delivered';
 return v_out;
end;$function$;

CREATE OR REPLACE FUNCTION public.create_rutaya_order(p_data jsonb)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid(); v_source text; v_service text; v_store public.businesses; v_fee integer; v_order public.orders;
        v_pickup_lat float8;v_pickup_lng float8;v_drop_lat float8;v_drop_lng float8; v_paid boolean; v_mode text; v_base_fee integer; v_local timestamp; v_dispatch timestamptz; v_scheduled timestamptz;
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
 if nullif(btrim(coalesce(p_data->>'scheduled_at','')),'') is not null then
   begin v_scheduled:=(p_data->>'scheduled_at')::timestamptz;
   exception when others then raise exception 'La fecha programada no es válida';end;
   if v_scheduled<now()+interval '30 minutes' or v_scheduled>now()+interval '30 days' then
    raise exception 'Programa con al menos 30 minutos y máximo 30 días de anticipación';end if;
   v_dispatch:=greatest(v_dispatch,v_scheduled);
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

CREATE OR REPLACE FUNCTION public.open_rutaya_support_by_token(p_token uuid, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;v_id uuid;
begin
 if p_token is null then raise exception 'El enlace no es válido';end if;
 if length(btrim(coalesce(p_message,'')))<10 or length(p_message)>800 then
 raise exception 'Escribe entre 10 y 800 caracteres';end if;
 select * into v_o from public.orders where tracking_token=p_token;
 if v_o.id is null then raise exception 'Enlace de seguimiento no encontrado';end if;
 if (select count(*) from public.order_support_cases where order_id=v_o.id and opened_by is null)>=3 then
 raise exception 'Este pedido ya tiene tres reportes. Comunícate directamente con la tienda';end if;
 insert into public.order_support_cases(order_id,opened_by,message)
 values(v_o.id,null,btrim(p_message)) returning id into v_id;
 insert into public.order_events(order_id,event,actor_id) values(v_o.id,'recipient_support_case_opened',null);
 return v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.open_rutaya_support_case(p_order uuid, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_o public.orders;v_id_out uuid;
begin
 if v_id is null then raise exception 'Inicia sesión para reportar un problema';end if;
 if length(btrim(coalesce(p_message,'')))<10 or length(p_message)>800 then
 raise exception 'Describe el problema en 10 a 800 caracteres';end if;
 select * into v_o from public.orders where id=p_order;
 if v_o.id is null then raise exception 'Pedido no encontrado';end if;
 if not (public.rutaya_is_role('admin') or v_o.created_by=v_id or v_o.courier_id=v_id
 or exists(select 1 from public.businesses b where b.id=v_o.business_id and b.owner_user_id=v_id)) then
 raise exception 'No tienes permiso para reportar sobre este pedido';end if;
 if (select count(*) from public.order_support_cases where opened_by=v_id and created_at>now()-interval '1 hour')>=5 then
 raise exception 'Demasiados reportes recientes. Espera un poco';end if;
 insert into public.order_support_cases(order_id,opened_by,message)
 values(p_order,v_id,btrim(p_message)) returning id into v_id_out;
 insert into public.order_events(order_id,event,actor_id) values(p_order,'support_case_opened',v_id);
 return v_id_out;
end;$function$;

CREATE OR REPLACE FUNCTION public.progress_rutaya_order(p_order_id uuid, p_next text, p_lat double precision, p_lng double precision, p_accuracy double precision)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_o public.orders;v_expected text;v_lat float8;v_lng float8;
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_accuracy>100 or p_accuracy<0 then
  raise exception 'Tu GPS no tiene precisión suficiente (máximo 100 m)';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null or v_o.courier_id is distinct from v_id then raise exception 'No tienes asignado este pedido';end if;
 v_expected:=case v_o.status when 'accepted' then 'at_pickup' when 'at_pickup' then 'picked_up'
   when 'picked_up' then 'at_dropoff' when 'at_dropoff' then 'delivered' else null end;
 if p_next is distinct from v_expected then raise exception 'Debes completar el paso anterior';end if;
 if p_next='delivered' and exists(select 1 from public.delivery_verifications where order_id=p_order_id) then
  raise exception 'Introduce el código de entrega que tiene la clienta';end if;
 if p_next in('at_pickup','picked_up') then v_lat:=v_o.pickup_lat;v_lng:=v_o.pickup_lng;
 else v_lat:=v_o.dropoff_lat;v_lng:=v_o.dropoff_lng;end if;
 if public.rutaya_distance_meters(p_lat,p_lng,v_lat,v_lng)>200 then
  raise exception 'No estás dentro de los 200 m del punto indicado';end if;
 update public.orders set status=p_next,updated_at=now() where id=p_order_id returning * into v_o;
 insert into public.courier_locations(courier_id,lat,lng,accuracy,updated_at)
 values(v_id,p_lat,p_lng,p_accuracy,now()) on conflict(courier_id) do update
 set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,updated_at=now();
 insert into public.order_events(order_id,event,actor_id) values(v_o.id,p_next,v_id);
 return v_o;
end;$function$;

CREATE OR REPLACE FUNCTION public.rate_rutaya_order(p_token uuid, p_stars integer, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;
begin
 if p_token is null then raise exception 'Enlace no válido';end if;
 if p_stars is null or p_stars<1 or p_stars>5 or length(coalesce(p_comment,''))>350 then
 raise exception 'Elige de una a cinco estrellas y un comentario breve';end if;
 select * into v_o from public.orders where tracking_token=p_token for update;
 if v_o.id is null or v_o.status<>'delivered' or v_o.courier_id is null then
 raise exception 'Solo se puede calificar una entrega finalizada';end if;
 if exists(select 1 from public.order_ratings where order_id=v_o.id) then
 raise exception 'Este domicilio ya tiene una calificación';end if;
 insert into public.order_ratings(order_id,stars,comment)
 values(v_o.id,p_stars,left(btrim(coalesce(p_comment,'')),350));
 insert into public.order_events(order_id,event,actor_id) values(v_o.id,'rated_by_recipient',null);
end;$function$;

CREATE OR REPLACE FUNCTION public.review_rutaya_courier(p_user_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin uuid:=auth.uid();v_p public.profiles;v_app public.courier_applications;
begin
 if v_admin is null or not public.rutaya_is_role('admin') then raise exception 'Solo administración puede aprobar repartidores';end if;
 if p_approve is null then raise exception 'Decisión inválida';end if;
 select * into v_p from public.profiles where user_id=p_user_id for update;
 select * into v_app from public.courier_applications where user_id=p_user_id;
 if v_p.user_id is null or v_p.role<>'courier' or v_app.user_id is null then raise exception 'Solicitud no encontrada';end if;
 if v_p.is_admin then raise exception 'No se puede modificar un administrador';end if;
 if p_approve and (not v_app.identity_checked or not v_app.vehicle_checked) then
 raise exception 'Verifica identidad y vehículo antes de aprobar';end if;
 if not p_approve and exists(select 1 from public.orders where courier_id=p_user_id and status in('accepted','at_pickup','picked_up','at_dropoff')) then
 raise exception 'No puedes suspender un repartidor con pedidos activos';end if;
 update public.profiles set approved=p_approve where user_id=p_user_id;
 insert into public.courier_reviews(courier_id,reviewer_id,approved) values(p_user_id,v_admin,p_approve);
end;$function$;

CREATE OR REPLACE FUNCTION public.rutaya_create_delivery_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.delivery_verifications(order_id,code)
 values(new.id,lpad((floor(random()*900000)+100000)::integer::text,6,'0'));
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.track_rutaya_order(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_o public.orders;v_l public.courier_locations;v_code text;
begin
 select * into v_o from public.orders where tracking_token=p_token;
 if v_o.id is null then return null;end if;
 if v_o.courier_id is not null and v_o.status not in('delivered','cancelled') then
  select * into v_l from public.courier_locations where courier_id=v_o.courier_id
    and updated_at>now()-interval '2 minutes';
 end if;
 if v_o.status in('picked_up','at_dropoff') then
  select code into v_code from public.delivery_verifications where order_id=v_o.id;
 end if;
 return jsonb_build_object(
 'tracking_token',v_o.tracking_token,'service',v_o.service,'status',v_o.status,
 'delivery_mode',v_o.delivery_mode,'dispatch_after',v_o.dispatch_after,
 'items_description',v_o.items_description,'pickup_address',v_o.pickup_address,
 'dropoff_address',v_o.dropoff_address,'dropoff_lat',v_o.dropoff_lat,'dropoff_lng',v_o.dropoff_lng,
 'fee',v_o.fee,'created_at',v_o.created_at,'updated_at',v_o.updated_at,
 'delivery_code',v_code,'rated',exists(select 1 from public.order_ratings r where r.order_id=v_o.id),
 'courier_location',case when v_l.courier_id is not null then
 jsonb_build_object('lat',v_l.lat,'lng',v_l.lng,'accuracy',v_l.accuracy,'updated_at',v_l.updated_at)
 else null end);
end;$function$;

drop trigger if exists rutaya_create_delivery_code on public.orders;
create trigger rutaya_create_delivery_code after insert on public.orders
 for each row execute function public.rutaya_create_delivery_code();
insert into public.delivery_verifications(order_id,code)
 select id,lpad((floor(random()*900000)+100000)::integer::text,6,'0')
 from public.orders where status in('pending','accepted','at_pickup','picked_up','at_dropoff')
 on conflict(order_id) do nothing;
revoke all on function public.rutaya_create_delivery_code() from public,anon,authenticated;
revoke all on function public.confirm_rutaya_delivery(uuid,text,double precision,double precision,double precision) from public,anon;
grant execute on function public.confirm_rutaya_delivery(uuid,text,double precision,double precision,double precision) to authenticated;
revoke all on function public.admin_fleet_locations() from public,anon;
revoke all on function public.admin_rutaya_stats(integer) from public,anon;
revoke all on function public.admin_rutaya_payout(uuid,integer,boolean) from public,anon;
revoke all on function public.courier_rutaya_cash_summary() from public,anon;
revoke all on function public.open_rutaya_support_case(uuid,text) from public,anon;
revoke all on function public.admin_resolve_rutaya_support(uuid) from public,anon;
revoke all on function public.admin_verify_rutaya_courier(uuid,boolean,boolean,text) from public,anon;
revoke all on function public.admin_assign_rutaya_route(uuid[],uuid,text) from public,anon;
revoke all on function public.admin_courier_rating_summary() from public,anon;
grant execute on function public.admin_fleet_locations() to authenticated;
grant execute on function public.admin_rutaya_stats(integer) to authenticated;
grant execute on function public.admin_rutaya_payout(uuid,integer,boolean) to authenticated;
grant execute on function public.courier_rutaya_cash_summary() to authenticated;
grant execute on function public.open_rutaya_support_case(uuid,text) to authenticated;
grant execute on function public.admin_resolve_rutaya_support(uuid) to authenticated;
grant execute on function public.admin_verify_rutaya_courier(uuid,boolean,boolean,text) to authenticated;
grant execute on function public.admin_assign_rutaya_route(uuid[],uuid,text) to authenticated;
grant execute on function public.admin_courier_rating_summary() to authenticated;
revoke all on function public.open_rutaya_support_by_token(uuid,text) from public;
revoke all on function public.rate_rutaya_order(uuid,integer,text) from public;
grant execute on function public.open_rutaya_support_by_token(uuid,text) to anon,authenticated;
grant execute on function public.rate_rutaya_order(uuid,integer,text) to anon,authenticated;
