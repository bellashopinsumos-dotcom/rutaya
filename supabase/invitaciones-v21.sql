-- RutaYa v21 · Enlaces de entrega que completa la clienta sin cuenta.
-- Aplicar después de supabase/operacion-v20.sql en un proyecto NUEVO.
-- En el proyecto RutaYa principal, esta migración ya fue aplicada.
-- No ejecutar en la base de inventario de Bella Shop.
create table if not exists public.delivery_invitations(
 token uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 items_description text not null,
 paid boolean not null default true,
 amount_to_collect integer not null default 0 check(amount_to_collect between 0 and 100000000),
 delivery_mode text not null default 'normal' check(delivery_mode in ('normal','routed','urgent')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '48 hours'),
 completed_at timestamptz,
 revoked_at timestamptz,
 order_id uuid unique references public.orders(id)
);
create index if not exists delivery_invitations_owner_recent_idx on public.delivery_invitations(created_by,created_at desc);
create index if not exists delivery_invitations_pending_idx on public.delivery_invitations(business_id,expires_at)
 where completed_at is null and revoked_at is null;
alter table public.delivery_invitations enable row level security;
drop policy if exists "Owners can view their delivery invitations" on public.delivery_invitations;
create policy "Owners can view their delivery invitations" on public.delivery_invitations
 for select to authenticated using(created_by=(select auth.uid()) or public.rutaya_is_role('admin'));

CREATE OR REPLACE FUNCTION public.complete_rutaya_delivery_invite(p_token uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_i public.delivery_invitations;v_store public.businesses;v_o public.orders;
 v_name text;v_phone text;v_address text;v_zone text;v_notes text;
 v_lat double precision;v_lng double precision;v_base integer;v_fee integer;
 v_now_local timestamp;v_dispatch timestamptz;
begin
 if p_token is null then raise exception 'El enlace no es válido';end if;
 select * into v_i from public.delivery_invitations where token=p_token for update;
 if v_i.token is null then raise exception 'No encontramos el enlace';end if;
 if v_i.completed_at is not null then raise exception 'Este formulario ya se envió; el pedido fue creado';end if;
 if v_i.revoked_at is not null or v_i.expires_at<=now() then
  raise exception 'Este enlace ya no está activo. Solicita uno nuevo a la tienda';
 end if;
 select * into v_store from public.businesses where id=v_i.business_id and approved=true;
 if v_store.id is null or v_store.lat is null or v_store.lng is null then
  raise exception 'El negocio no está disponible para solicitar entregas';
 end if;
 v_name:=btrim(coalesce(p_data->>'recipient_name',''));
 v_phone:=regexp_replace(coalesce(p_data->>'recipient_phone',''),'[^0-9]','','g');
 v_address:=btrim(coalesce(p_data->>'dropoff_address',''));
 v_zone:=btrim(coalesce(p_data->>'dropoff_zone',''));
 v_notes:=btrim(coalesce(p_data->>'delivery_notes',''));
 if length(v_name)<2 or length(v_name)>180 then raise exception 'Escribe tu nombre completo';end if;
 if v_phone !~ '^(3[0-9]{9}|573[0-9]{9})$' then
  raise exception 'Escribe un número celular colombiano válido';end if;
 if length(v_address)<5 or length(v_address)>400 then
  raise exception 'Escribe tu dirección completa y una referencia';end if;
 if length(v_notes)>500 then raise exception 'La referencia debe tener máximo 500 caracteres';end if;
 begin
  v_lat:=(p_data->>'dropoff_lat')::double precision;
  v_lng:=(p_data->>'dropoff_lng')::double precision;
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Confirma el punto de entrega en el mapa';
 end;
 if v_lat is null or v_lng is null or v_lat::text in ('NaN','Infinity','-Infinity') or v_lng::text in ('NaN','Infinity','-Infinity') or
    abs(v_lat)>90 or abs(v_lng)>180 then
  raise exception 'Selecciona la ubicación exacta de entrega';
 end if;
 select fee into v_base from public.tariff_zones where active=true and lower(name)=lower(v_zone) limit 1;
 if v_base is null then raise exception 'Selecciona una zona de entrega válida';end if;
 v_fee:=greatest(0,v_base+case v_i.delivery_mode when 'routed' then -1000 when 'urgent' then 1500 else 0 end);
 v_now_local:=now() at time zone 'America/Bogota';
 if v_i.delivery_mode='routed' then
  v_dispatch:=((v_now_local::date + (case when v_now_local::time<time '12:00' then 0 else 1 end))
              +time '14:00') at time zone 'America/Bogota';
 else v_dispatch:=now();end if;
 insert into public.orders(
  created_by,business_id,source,service,items_description,
  pickup_name,pickup_address,pickup_lat,pickup_lng,
  dropoff_address,dropoff_lat,dropoff_lng,dropoff_zone,
  recipient_name,recipient_phone,shopper_name,
  paid,amount_to_collect,delivery_notes,fee,delivery_mode,dispatch_after
 )values(
  v_i.created_by,v_i.business_id,'business','business',v_i.items_description,
  v_store.name,v_store.address,v_store.lat,v_store.lng,
  v_address,v_lat,v_lng,v_zone,v_name,v_phone,'',
  v_i.paid,v_i.amount_to_collect,left(v_notes,500),v_fee,v_i.delivery_mode,v_dispatch
 )returning * into v_o;
 update public.delivery_invitations
 set completed_at=now(),order_id=v_o.id where token=p_token;
 insert into public.order_events(order_id,event,actor_id)
 values(v_o.id,'created_by_recipient_link',null);
 return jsonb_build_object('status','completed','tracking_token',v_o.tracking_token,'fee',v_o.fee,'delivery_mode',v_o.delivery_mode);
end;$function$;

CREATE OR REPLACE FUNCTION public.create_rutaya_delivery_invite(p_description text, p_paid boolean, p_amount integer, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid:=auth.uid();v_store public.businesses;v_token uuid;
begin
 if v_id is null or not public.rutaya_is_role('business') then
  raise exception 'Solo un negocio autorizado puede enviar invitaciones';
 end if;
 select * into v_store from public.businesses where owner_user_id=v_id and approved=true;
 if v_store.id is null or v_store.lat is null or v_store.lng is null then
  raise exception 'Configura primero la ubicación de tu negocio';
 end if;
 if length(btrim(coalesce(p_description,'')))<3 or length(p_description)>1000 then
  raise exception 'Describe qué se va a entregar (3 a 1000 caracteres)';
 end if;
 if p_mode is null or p_mode not in('normal','routed','urgent') then
  raise exception 'Selecciona Normal, Enrutado o Urgente';
 end if;
 if p_paid is null or p_amount is null or p_amount<0 or p_amount>100000000 or
   (p_paid=false and p_amount<=0) then raise exception 'Revisa si el pedido ya está pagado y su saldo';end if;
 if (select count(*) from public.delivery_invitations where created_by=v_id and expires_at>now()
     and completed_at is null and revoked_at is null)>=30 then
  raise exception 'Tienes demasiados enlaces sin completar; cancela algunos antes de crear más';
 end if;
 insert into public.delivery_invitations(business_id,created_by,items_description,paid,amount_to_collect,delivery_mode)
 values(v_store.id,v_id,btrim(p_description),p_paid,case when p_paid then 0 else p_amount end,p_mode)
 returning token into v_token;
 return jsonb_build_object('token',v_token,'expires_in_hours',48,'status','pending');
end;$function$;

CREATE OR REPLACE FUNCTION public.get_rutaya_delivery_invite(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_i public.delivery_invitations;v_store public.businesses;v_order public.orders;v_status text;
begin
 if p_token is null then return null;end if;
 select * into v_i from public.delivery_invitations where token=p_token;
 if v_i.token is null then return null;end if;
 select * into v_store from public.businesses where id=v_i.business_id;
 v_status:=case when v_i.revoked_at is not null then 'revoked'
                 when v_i.completed_at is not null then 'completed'
                 when v_i.expires_at<=now() then 'expired' else 'pending' end;
 if v_status='completed' and v_i.order_id is not null then
  select * into v_order from public.orders where id=v_i.order_id;
 end if;
 return jsonb_build_object(
  'status',v_status,'business_name',v_store.name,
  'items_description',v_i.items_description,
  'paid',v_i.paid,'amount_to_collect',v_i.amount_to_collect,
  'delivery_mode',v_i.delivery_mode,'expires_at',v_i.expires_at,
  'tracking_token',case when v_status='completed' then v_order.tracking_token else null end
 );
end;$function$;

CREATE OR REPLACE FUNCTION public.revoke_rutaya_delivery_invite(p_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_i public.delivery_invitations;
begin
 if v_id is null or not public.rutaya_is_role('business') then
  raise exception 'Solo negocios autorizados pueden desactivar enlaces';end if;
 select * into v_i from public.delivery_invitations where token=p_token for update;
 if v_i.token is null or v_i.created_by is distinct from v_id then
  raise exception 'Este enlace no pertenece a tu negocio';end if;
 if v_i.completed_at is not null then
  raise exception 'Ya hay un pedido creado; debes gestionarlo desde pedidos';end if;
 update public.delivery_invitations set revoked_at=coalesce(revoked_at,now()) where token=p_token;
end;$function$;


revoke all on function public.create_rutaya_delivery_invite(text,boolean,integer,text) from public,anon;
revoke all on function public.get_rutaya_delivery_invite(uuid) from public;
revoke all on function public.complete_rutaya_delivery_invite(uuid,jsonb) from public;
revoke all on function public.revoke_rutaya_delivery_invite(uuid) from public,anon;
grant execute on function public.create_rutaya_delivery_invite(text,boolean,integer,text) to authenticated;
grant execute on function public.get_rutaya_delivery_invite(uuid) to anon,authenticated;
grant execute on function public.complete_rutaya_delivery_invite(uuid,jsonb) to anon,authenticated;
grant execute on function public.revoke_rutaya_delivery_invite(uuid) to authenticated;
