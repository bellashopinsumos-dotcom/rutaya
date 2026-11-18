-- RutaYa v26: mapa de todos los domiciliarios y ubicación por autorización expresa.
-- Ejecutar DESPUÉS de supabase/fase25-operacion-avanzada.sql en instalación nueva.
-- Esta migración ya fue aplicada al proyecto RutaYa principal.
-- Nunca ejecutar en el inventario de Bella Shop.
alter table public.profiles add column if not exists share_location_with_admin boolean not null default false;

CREATE OR REPLACE FUNCTION public.admin_fleet_status_v26()
 RETURNS TABLE(courier_id uuid, name text, lat double precision, lng double precision, accuracy double precision, seen_at timestamp with time zone, active_orders integer, sharing_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Solo administración puede ver la flota';end if;
 return query
 select p.user_id,p.display_name,l.lat,l.lng,l.accuracy,l.updated_at,
 (select count(*)::integer from public.orders o where o.courier_id=p.user_id
 and o.status in('accepted','at_pickup','picked_up','at_dropoff')),
 p.share_location_with_admin
 from public.profiles p
 left join public.courier_locations l on l.courier_id=p.user_id
 and l.updated_at>now()-interval '2 minutes'
 and (p.share_location_with_admin or exists(select 1 from public.orders o
 where o.courier_id=p.user_id and o.status in('accepted','at_pickup','picked_up','at_dropoff')))
 where p.role='courier' and p.approved
 order by p.display_name;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_rutaya_courier_admin_share()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_share boolean;
begin
 if v_id is null or not public.rutaya_is_role('courier') then return false;end if;
 select share_location_with_admin into v_share from public.profiles where user_id=v_id;
 return coalesce(v_share,false);
end;$function$;

CREATE OR REPLACE FUNCTION public.set_rutaya_courier_admin_share(p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Solo repartidores autorizados pueden compartir GPS';end if;
 if p_enabled is null then raise exception 'Selecciona activar o desactivar';end if;
 update public.profiles set share_location_with_admin=p_enabled where user_id=v_id and role='courier' and approved;
 if not found then raise exception 'Domiciliario no autorizado';end if;
 if not p_enabled and not exists(select 1 from public.orders where courier_id=v_id and status in('accepted','at_pickup','picked_up','at_dropoff')) then
  delete from public.courier_locations where courier_id=v_id;
 end if;
 return p_enabled;
end;$function$;

CREATE OR REPLACE FUNCTION public.stop_rutaya_courier_location()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 update public.profiles set share_location_with_admin=false where user_id=v_id and role='courier';
 delete from public.courier_locations where courier_id=v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.update_rutaya_courier_location(p_lat double precision, p_lng double precision, p_accuracy double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();
begin
 if v_id is null or not public.rutaya_is_role('courier') then raise exception 'Domiciliario no autorizado';end if;
 if p_lat is null or p_lng is null or p_lat::text in('NaN','Infinity','-Infinity') or p_lng::text in('NaN','Infinity','-Infinity') or
 abs(p_lat)>90 or abs(p_lng)>180 or p_accuracy is null or
 p_accuracy::text in('NaN','Infinity','-Infinity') or p_accuracy>100 or p_accuracy<0 then
 raise exception 'Se requiere GPS válido con precisión máxima de 100 metros';end if;
 if not exists(select 1 from public.orders where courier_id=v_id and status in('accepted','at_pickup','picked_up','at_dropoff'))
 and not exists(select 1 from public.profiles where user_id=v_id and share_location_with_admin) then return;end if;
 insert into public.courier_locations(courier_id,lat,lng,accuracy,updated_at)
 values(v_id,p_lat,p_lng,p_accuracy,now())
 on conflict(courier_id) do update set lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,updated_at=now();
end;$function$;

revoke execute on function public.set_rutaya_courier_admin_share(boolean) from public,anon;
revoke execute on function public.get_rutaya_courier_admin_share() from public,anon;
revoke execute on function public.admin_fleet_status_v26() from public,anon;
grant execute on function public.set_rutaya_courier_admin_share(boolean) to authenticated;
grant execute on function public.get_rutaya_courier_admin_share() to authenticated;
grant execute on function public.admin_fleet_status_v26() to authenticated;

-- Cada localización nueva requiere consentimiento activo de reparto o permiso voluntario
-- para Administración. No hay GPS en segundo plano ni localización oculta.
-- El RPC admin_fleet_status_v26 lista los aprobados incluso sin entregas activas;
-- únicamente devuelve coordenadas actualizadas hace menos de dos minutos.
