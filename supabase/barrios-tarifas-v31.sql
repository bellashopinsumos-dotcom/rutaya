-- RutaYa v31 — Barrios y precios, editable desde Administración.
-- Ejecutar DESPUÉS de supabase/admin-intervenciones-v30.sql.
-- Ya aplicado al proyecto Supabase RutaYa (fzawdsuksyckvynrqzpf).
-- ¡No ejecutar en la base del inventario Bella Shop!
-- Las zonas generales ya existentes y pedidos históricos conservan sus valores.
alter table public.tariff_zones add column if not exists kind text not null default 'sector';
alter table public.tariff_zones add column if not exists updated_at timestamptz not null default now();
alter table public.tariff_zones add column if not exists updated_by uuid references auth.users(id);
do $$
begin
 if not exists (select 1 from pg_constraint where conname='rutaya_tariff_kind_check'
  and conrelid='public.tariff_zones'::regclass) then
  alter table public.tariff_zones add constraint rutaya_tariff_kind_check check(kind in('sector','barrio'));
 end if;
end$$;
create unique index if not exists rutaya_tariff_name_casefold_idx on public.tariff_zones(lower(name));
create table if not exists public.rutaya_tariff_history(
 id bigint generated always as identity primary key,
 neighborhood_name text not null,
 action text not null check(action in ('created','updated','activated','deactivated')),
 previous_fee integer,new_fee integer not null,
 previous_active boolean,new_active boolean not null,
 changed_by uuid not null references auth.users(id),
 changed_at timestamptz not null default now()
);
create index if not exists rutaya_tariff_history_lookup_idx
 on public.rutaya_tariff_history(neighborhood_name,changed_at desc);
alter table public.rutaya_tariff_history enable row level security;
revoke all on public.rutaya_tariff_history from public,anon,authenticated;
grant select on public.rutaya_tariff_history to authenticated;
drop policy if exists "Only RutaYa administration reads tariff history" on public.rutaya_tariff_history;
create policy "Only RutaYa administration reads tariff history" on public.rutaya_tariff_history
 for select to authenticated using(public.rutaya_is_role('admin'));

CREATE OR REPLACE FUNCTION public.admin_list_rutaya_tariffs_v31()
 RETURNS TABLE(name text, fee integer, active boolean, is_example boolean, kind text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.rutaya_is_role('admin') then raise exception 'Acceso exclusivo de Administración';end if;
 return query select z.name,z.fee,z.active,z.is_example,z.kind,z.updated_at
 from public.tariff_zones z order by (case when z.kind='barrio' then 0 else 1 end),
 z.active desc,z.name;
end;$function$;

CREATE OR REPLACE FUNCTION public.admin_save_rutaya_barrio_v31(p_name text, p_fee integer, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=auth.uid();v_name text:=btrim(coalesce(p_name,''));v_prev public.tariff_zones;
v_action text;
begin
 if v_id is null or not public.rutaya_is_role('admin') then
  raise exception 'Solo Administración puede cambiar las tarifas de los barrios';end if;
 if length(v_name)<2 or length(v_name)>80 or p_fee is null or p_fee<0 or p_fee>100000
 or p_active is null then
  raise exception 'Revisa el nombre (2 a 80 caracteres) y el valor del domicilio (0 a 100.000 pesos)';end if;
 perform pg_advisory_xact_lock(hashtext(lower(v_name)));
 select * into v_prev from public.tariff_zones where lower(name)=lower(v_name) for update;
 if v_prev.name is not null and v_prev.kind<>'barrio' then
  raise exception 'Ya existe una zona general con este nombre. Desactívala o usa otro nombre para el barrio';end if;
 if v_prev.name is not null and v_prev.fee=p_fee and v_prev.active=p_active then return;end if;
 v_action:=case when v_prev.name is null then 'created'
     when v_prev.active and not p_active then 'deactivated'
     when not v_prev.active and p_active then 'activated' else 'updated' end;
 if v_prev.name is null then
  insert into public.tariff_zones(name,fee,active,is_example,kind,updated_by,updated_at)
  values(v_name,p_fee,p_active,false,'barrio',v_id,now());
 else
  update public.tariff_zones set fee=p_fee,active=p_active,is_example=false,
    updated_by=v_id,updated_at=now() where name=v_prev.name;
 end if;
 insert into public.rutaya_tariff_history(
 neighborhood_name,action,previous_fee,new_fee,previous_active,new_active,changed_by)
 values(coalesce(v_prev.name,v_name),v_action,v_prev.fee,p_fee,v_prev.active,p_active,v_id);
end;$function$;

CREATE OR REPLACE FUNCTION public.quote_rutaya_tariff_v31(p_zone text, p_mode text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_zone public.tariff_zones;v_mode text:=coalesce(p_mode,'normal');
begin
 if v_mode not in ('normal','urgent','routed') then raise exception 'Modalidad inválida';end if;
 if length(btrim(coalesce(p_zone,'')))<2 then raise exception 'Selecciona un barrio para calcular el domicilio';end if;
 select * into v_zone from public.tariff_zones
  where active=true and lower(name)=lower(btrim(p_zone)) limit 1;
 if v_zone.name is null then raise exception 'Este barrio no está disponible. Consulta con el negocio';end if;
 return jsonb_build_object(
 'name',v_zone.name,
 'kind',v_zone.kind,
 'base_fee',v_zone.fee,
 'fee',greatest(0,v_zone.fee+case v_mode when 'urgent' then 1500 when 'routed' then -1000 else 0 end),
 'is_example',v_zone.is_example);
end;$function$;

revoke all on function public.admin_save_rutaya_barrio_v31(text,integer,boolean) from public,anon;
revoke all on function public.admin_list_rutaya_tariffs_v31() from public,anon;
grant execute on function public.admin_save_rutaya_barrio_v31(text,integer,boolean) to authenticated;
grant execute on function public.admin_list_rutaya_tariffs_v31() to authenticated;
revoke all on function public.quote_rutaya_tariff_v31(text,text) from public;
grant execute on function public.quote_rutaya_tariff_v31(text,text) to anon,authenticated;
