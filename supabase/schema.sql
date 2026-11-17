-- RutaYa · esquema inicial de PILOTO. Ejecutar en un proyecto Supabase nuevo.
-- No ejecutar en la base de datos de Bella Shop. Revisar límites, políticas y auditoría antes de producción.
-- Modalidades: Enrutado (-1000 COP; corte 12:00, despacho desde 14:00 Colombia), Normal (base), Urgente (+1500 COP, prioridad).
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('customer','business','courier','admin')),
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  name text not null,
  address text not null default '',
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists businesses_owner_unique on public.businesses(owner_user_id);
create table if not exists public.tariff_zones (
  name text primary key,
  fee integer not null check (fee>=0),
  active boolean not null default true
);
-- Tarifas de muestra para desarrollo; NO son precios comerciales verificados.
insert into public.tariff_zones(name,fee) values ('Centro',4000),('Norte',5000),('Sur',5000),('Occidente',6000)
on conflict (name) do nothing;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tracking_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  business_id uuid references public.businesses(id),
  source text not null check (source in ('customer','business')),
  service text not null check (service in ('shop','pickup','parcel','business')),
  items_description text not null,
  pickup_name text not null default '',
  pickup_address text not null,
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  dropoff_address text not null,
  dropoff_lat double precision not null check (dropoff_lat between -90 and 90),
  dropoff_lng double precision not null check (dropoff_lng between -180 and 180),
  dropoff_zone text not null default '',
  recipient_name text not null default '',
  recipient_phone text not null default '',
  shopper_name text not null default '',
  paid boolean not null default true,
  amount_to_collect integer not null default 0 check (amount_to_collect>=0),
  delivery_notes text not null default '',
  fee integer check (fee>=0),
  delivery_mode text not null default 'normal' check (delivery_mode in ('routed','normal','urgent')),
  dispatch_after timestamptz not null default now(),
  courier_id uuid references auth.users(id),
  status text not null default 'pending' check(status in('pending','accepted','at_pickup','picked_up','at_dropoff','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_by_idx on public.orders(created_by,created_at desc);
create index if not exists orders_courier_idx on public.orders(courier_id,status);
create index if not exists orders_pending_idx on public.orders(status,created_at desc);
create index if not exists orders_dispatch_idx on public.orders(status,dispatch_after);
create index if not exists orders_business_idx on public.orders(business_id);
create table if not exists public.courier_locations (
  courier_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  accuracy double precision not null check(accuracy>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null,
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id);
create index if not exists order_events_actor_idx on public.order_events(actor_id);

create or replace function public.new_rutaya_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(user_id,display_name,role,approved)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),'customer',true)
 on conflict(user_id) do nothing;
 return new;
end;$$;
drop trigger if exists on_auth_user_created_rutaya on auth.users;
create trigger on_auth_user_created_rutaya after insert on auth.users
for each row execute function public.new_rutaya_profile();

create or replace function public.rutaya_is_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role=p_role and p.approved=true);
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.tariff_zones enable row level security;
alter table public.orders enable row level security;
alter table public.courier_locations enable row level security;
alter table public.order_events enable row level security;

create policy "Users view own profile or admin" on public.profiles for select to authenticated
using (user_id=(select auth.uid()) or public.rutaya_is_role('admin'));
create policy "Stores are public when approved" on public.businesses for select to anon,authenticated
using (approved=true or owner_user_id=(select auth.uid()) or public.rutaya_is_role('admin'));
create policy "Tariffs public read" on public.tariff_zones for select to anon,authenticated using (active=true);
create policy "Orders visible to participants" on public.orders for select to authenticated
using (created_by=(select auth.uid()) or courier_id=(select auth.uid()) or
  (business_id is not null and exists(select 1 from public.businesses b where b.id=orders.business_id and b.owner_user_id=(select auth.uid()))) or
  (status='pending' and dispatch_after<=now() and public.rutaya_is_role('courier')) or public.rutaya_is_role('admin'));
create policy "Courier own or order participants read latest position" on public.courier_locations for select to authenticated
using (courier_id=(select auth.uid()) or public.rutaya_is_role('admin') or exists(
 select 1 from public.orders o where o.courier_id=courier_locations.courier_id and (o.created_by=(select auth.uid()) or exists(select 1 from public.businesses b where b.id=o.business_id and b.owner_user_id=(select auth.uid()))) and o.status not in('delivered','cancelled')
));
create policy "Participants view order events" on public.order_events for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_id));
-- NO políticas INSERT/UPDATE/DELETE en tablas sensibles: las escrituras pasan por funciones RPC seguras.

create or replace function public.rutaya_distance_meters(a_lat double precision,a_lng double precision,b_lat double precision,b_lng double precision)
returns double precision language sql immutable set search_path = '' as $
 select 6371000.0 * 2.0 * asin(sqrt(least(1.0,
 pow(sin(radians((b_lat-a_lat)/2)),2)+cos(radians(a_lat))*cos(radians(b_lat))*pow(sin(radians((b_lng-a_lng)/2)),2)
 )));
$$;

create or replace function public.create_rutaya_order(p_data jsonb) returns public.orders
language plpgsql security definer set search_path = '' as $$
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
end;$$;

create or replace function public.claim_rutaya_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=auth.uid();v_order public.orders;v_count int;v_picked int;
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 -- Bloqueo individual para impedir doble aceptación del pedido.
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null or v_order.status<>'pending' then raise exception 'El pedido ya no está disponible';end if;
 if v_order.fee is null then raise exception 'La tarifa debe confirmarse antes de asignar el pedido';end if;
 if v_order.dispatch_after>now() then raise exception 'Pedido enrutado pendiente de su horario de salida';end if;
 -- Bloqueo por usuario para impedir carreras sobre límite de 5 en pedidos diferentes.
 perform 1 from public.profiles where user_id=v_id for update;
 select count(*) into v_count from public.orders where courier_id=v_id and status in('accepted','at_pickup','picked_up','at_dropoff');
 select count(*) into v_picked from public.orders where courier_id=v_id and status in('picked_up','at_dropoff');
 if v_count>=5 then raise exception 'Tienes 5 entregas activas';end if;
 if v_picked>0 then raise exception 'Termina de entregar los pedidos recogidos antes de tomar nuevos';end if;
 update public.orders set courier_id=v_id,status='accepted',updated_at=now() where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id) values(p_order_id,'accepted',v_id);
 return v_order;
end;$$;

create or replace function public.progress_rutaya_order(p_order_id uuid,p_next text,p_lat float8,p_lng float8,p_accuracy float8)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=auth.uid();v_o public.orders;v_expected text;v_lat float8;v_lng float8;
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_accuracy>100 or p_accuracy<0 then raise exception 'Tu GPS no tiene precisión suficiente (máximo 100 m)';end if;
 select * into v_o from public.orders where id=p_order_id for update;
 if v_o.id is null or v_o.courier_id is distinct from v_id then raise exception 'No tienes asignado este pedido';end if;
 v_expected:=case v_o.status when 'accepted' then 'at_pickup' when 'at_pickup' then 'picked_up' when 'picked_up' then 'at_dropoff' when 'at_dropoff' then 'delivered' else null end;
 if p_next is distinct from v_expected then raise exception 'Debes completar el paso anterior';end if;
 if p_next in('at_pickup','picked_up') then v_lat:=v_o.pickup_lat;v_lng:=v_o.pickup_lng;else v_lat:=v_o.dropoff_lat;v_lng:=v_o.dropoff_lng;end if;
 if public.rutaya_distance_meters(p_lat,p_lng,v_lat,v_lng)>200 then raise exception 'No estás dentro de los 200 m del punto indicado';end if;
 update public.orders set status=p_next,updated_at=now() where id=p_order_id returning * into v_o;
 insert into public.courier_locations(courier_id,lat,lng,accuracy,updated_at) values(v_id,p_lat,p_lng,p_accuracy,now())
 on conflict(courier_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,updated_at=excluded.updated_at;
 insert into public.order_events(order_id,event,actor_id) values(v_o.id,p_next,v_id);
 return v_o;
end;$$;

create or replace function public.update_rutaya_courier_location(p_lat float8,p_lng float8,p_accuracy float8)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=auth.uid();
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 if p_lat is null or p_lng is null or abs(p_lat)>90 or abs(p_lng)>180 or p_accuracy is null or p_accuracy>100 or p_accuracy<0 then raise exception 'GPS inválido';end if;
 if not exists(select 1 from public.orders where courier_id=v_id and status in('accepted','at_pickup','picked_up','at_dropoff')) then return;end if;
 insert into public.courier_locations(courier_id,lat,lng,accuracy,updated_at) values(v_id,p_lat,p_lng,p_accuracy,now())
 on conflict(courier_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,updated_at=excluded.updated_at;
end;$$;

create or replace function public.set_business_location(p_name text,p_address text,p_lat float8,p_lng float8)
returns public.businesses language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=auth.uid();v_business public.businesses;
begin
 if v_id is null or not public.rutaya_is_role('business') then raise exception 'Negocio no autorizado';end if;
 if p_lat is null or p_lng is null or abs(p_lat)>90 or abs(p_lng)>180 then raise exception 'Punto GPS inválido';end if;
 if length(btrim(coalesce(p_name,'')))<2 or length(btrim(coalesce(p_address,'')))<4 then raise exception 'Indica nombre y dirección';end if;
 update public.businesses set name=left(p_name,120),address=left(p_address,400),lat=p_lat,lng=p_lng where owner_user_id=v_id and approved=true returning * into v_business;
 if v_business.id is null then raise exception 'El negocio debe ser aprobado por administración';end if;
 return v_business;
end;$$;

create or replace function public.admin_set_rutaya_fee(p_order_id uuid,p_fee integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración';end if;
 if p_fee is null or p_fee<0 or p_fee>1000000 then raise exception 'Tarifa inválida';end if;
 update public.orders set fee=p_fee,updated_at=now() where id=p_order_id;
end;$$;

create or replace function public.track_rutaya_order(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_o public.orders;v_l public.courier_locations;
begin
 select * into v_o from public.orders where tracking_token=p_token;
 if v_o.id is null then return null;end if;
 if v_o.courier_id is not null and v_o.status not in('delivered','cancelled') then
   select * into v_l from public.courier_locations where courier_id=v_o.courier_id and updated_at>now()-interval '10 minutes';
 end if;
 return jsonb_build_object(
   'tracking_token',v_o.tracking_token,'service',v_o.service,'status',v_o.status,'delivery_mode',v_o.delivery_mode,'dispatch_after',v_o.dispatch_after,'items_description',v_o.items_description,
   'pickup_address',v_o.pickup_address,'dropoff_address',v_o.dropoff_address,'fee',v_o.fee,'created_at',v_o.created_at,
   'courier_location',case when v_l.courier_id is not null then jsonb_build_object('lat',v_l.lat,'lng',v_l.lng,'accuracy',v_l.accuracy,'updated_at',v_l.updated_at) else null end);
end;$$;

revoke all on function public.new_rutaya_profile() from public;
revoke all on function public.rutaya_is_role(text) from public;
revoke all on function public.create_rutaya_order(jsonb) from public;
revoke all on function public.claim_rutaya_order(uuid) from public;
revoke all on function public.progress_rutaya_order(uuid,text,float8,float8,float8) from public;
revoke all on function public.update_rutaya_courier_location(float8,float8,float8) from public;
revoke all on function public.set_business_location(text,text,float8,float8) from public;
revoke all on function public.admin_set_rutaya_fee(uuid,integer) from public;
revoke all on function public.track_rutaya_order(uuid) from public;
revoke execute on function public.new_rutaya_profile() from anon,authenticated;
revoke execute on function public.create_rutaya_order(jsonb) from anon;
revoke execute on function public.claim_rutaya_order(uuid) from anon;
revoke execute on function public.progress_rutaya_order(uuid,text,float8,float8,float8) from anon;
revoke execute on function public.update_rutaya_courier_location(float8,float8,float8) from anon;
revoke execute on function public.set_business_location(text,text,float8,float8) from anon;
revoke execute on function public.admin_set_rutaya_fee(uuid,integer) from anon;
grant execute on function public.rutaya_is_role(text) to anon,authenticated;
grant execute on function public.create_rutaya_order(jsonb) to authenticated;
grant execute on function public.claim_rutaya_order(uuid) to authenticated;
grant execute on function public.progress_rutaya_order(uuid,text,float8,float8,float8) to authenticated;
grant execute on function public.update_rutaya_courier_location(float8,float8,float8) to authenticated;
grant execute on function public.set_business_location(text,text,float8,float8) to authenticated;
grant execute on function public.admin_set_rutaya_fee(uuid,integer) to authenticated;
grant execute on function public.track_rutaya_order(uuid) to anon,authenticated;

-- Permite que Supabase Realtime escuche cambios; RLS limita los eventos visibles.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
   alter publication supabase_realtime add table public.orders;
 end if;
end $$;

-- El superadministrador debe cambiar roles desde Supabase SQL Editor una vez registrados.
-- update public.profiles set role='admin',approved=true where user_id='<uuid de tu cuenta>';
-- insert into public.businesses(owner_user_id,name,address,approved) values('<uuid Bella Shop>','Bella Shop','Pendiente',true);
-- update public.profiles set role='business',approved=true where user_id='<uuid Bella Shop>';
-- update public.profiles set role='courier',approved=true where user_id='<uuid del repartidor>';