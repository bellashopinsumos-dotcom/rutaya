-- RutaYa: migración de inscripción y aprobación de domiciliarios.
-- Aplicada al proyecto RutaYa en Supabase el 17-11-2026.
-- En instalaciones nuevas requiere el esquema inicial y la columna is_admin en perfiles.
-- El dueño de RutaYa debe habilitarse como is_admin manualmente tras verificar su cuenta.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.rutaya_is_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and
 ( (p_role='admin' and p.is_admin) or
 (p.approved and (p.role=p_role or (p_role='customer' and p.role in ('business','courier','admin')))) ));
$$;

create table if not exists public.courier_applications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null,
 vehicle text not null check (vehicle in ('moto','bicicleta','carro')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.courier_applications enable row level security;
create policy "Courier sees own application" on public.courier_applications for select to authenticated
 using (user_id=(select auth.uid()) or public.rutaya_is_role('admin'));

create table if not exists public.courier_reviews (
 id bigint generated always as identity primary key,
 courier_id uuid not null references auth.users(id) on delete cascade,
 reviewer_id uuid not null references auth.users(id),
 approved boolean not null,
 occurred_at timestamptz not null default now()
);
create index if not exists courier_reviews_courier_idx on public.courier_reviews(courier_id);
alter table public.courier_reviews enable row level security;
create policy "Only admins view courier review history" on public.courier_reviews for select to authenticated
 using (public.rutaya_is_role('admin'));

create or replace function public.request_rutaya_courier(p_phone text,p_vehicle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid:=auth.uid();v_profile public.profiles;v_phone text;
begin
 if v_id is null then raise exception 'Inicia sesión para solicitar el ingreso';end if;
 select * into v_profile from public.profiles where user_id=v_id for update;
 if v_profile.user_id is null then raise exception 'Tu perfil aún no está listo';end if;
 if v_profile.is_admin or v_profile.role in ('business','admin') then
  raise exception 'Usa una cuenta personal distinta para inscribirte como repartidor';
 end if;
 if length(btrim(coalesce(v_profile.display_name,'')))<2 then
  raise exception 'Registra tu nombre completo al crear tu cuenta';
 end if;
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if v_phone !~ '^3[0-9]{9}$' then raise exception 'Indica un celular colombiano de 10 dígitos';end if;
 if p_vehicle is null or p_vehicle not in ('moto','bicicleta','carro') then
  raise exception 'Selecciona tu vehículo';
 end if;
 if v_profile.role='courier' and v_profile.approved then
  raise exception 'Ya estás aprobado como domiciliario';
 end if;
 update public.profiles set role='courier',approved=false where user_id=v_id;
 insert into public.courier_applications(user_id,phone,vehicle,updated_at)
 values(v_id,v_phone,p_vehicle,now())
 on conflict(user_id) do update
 set phone=excluded.phone,vehicle=excluded.vehicle,updated_at=now();
 return jsonb_build_object('requested',true,'approved',false);
end;$$;

create or replace function public.list_rutaya_couriers()
returns table(user_id uuid,display_name text,email text,phone text,vehicle text,approved boolean,applied_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Acceso exclusivo de administración';end if;
 return query
 select p.user_id,p.display_name,u.email::text,c.phone,c.vehicle,p.approved,c.created_at
 from public.courier_applications c join public.profiles p on p.user_id=c.user_id
 join auth.users u on u.id=c.user_id
 where p.role='courier' order by p.approved asc,c.created_at asc;
end;$$;

create or replace function public.review_rutaya_courier(p_user_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid:=auth.uid();v_courier public.profiles;
begin
 if v_admin is null or not public.rutaya_is_role('admin') then
  raise exception 'Solo administración puede aprobar repartidores';
 end if;
 if p_approve is null then raise exception 'Decisión inválida';end if;
 select * into v_courier from public.profiles where user_id=p_user_id for update;
 if v_courier.user_id is null or v_courier.role<>'courier' or not exists(
  select 1 from public.courier_applications where user_id=p_user_id
 ) then raise exception 'La solicitud no existe';end if;
 if v_courier.is_admin then raise exception 'No se puede modificar un administrador';end if;
 if not p_approve and exists(
  select 1 from public.orders where courier_id=p_user_id and status in ('accepted','at_pickup','picked_up','at_dropoff')
 ) then raise exception 'No puedes suspender un repartidor con domicilios activos';end if;
 update public.profiles set approved=p_approve where user_id=p_user_id;
 insert into public.courier_reviews(courier_id,reviewer_id,approved)
 values(p_user_id,v_admin,p_approve);
end;$$;

revoke execute on function public.request_rutaya_courier(text,text) from public,anon;
revoke execute on function public.list_rutaya_couriers() from public,anon;
revoke execute on function public.review_rutaya_courier(uuid,boolean) from public,anon;
grant execute on function public.request_rutaya_courier(text,text) to authenticated;
grant execute on function public.list_rutaya_couriers() to authenticated;
grant execute on function public.review_rutaya_courier(uuid,boolean) to authenticated;
