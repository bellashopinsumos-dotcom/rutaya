-- RutaYa v22: el administrador puede cancelar cualquier pedido no finalizado.
-- Los usuarios normales conservan sus restricciones; ningún pedido entregado cambia a cancelado.
-- El motivo y la identidad del administrador quedan en order_events.
-- El sistema no reembolsa ni devuelve productos automáticamente.
-- Aplicar después de supabase/operacion-v20.sql y supabase/invitaciones-v21.sql.

CREATE OR REPLACE FUNCTION public.cancel_rutaya_order(p_order_id uuid, p_reason text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid:=auth.uid(); v_order public.orders;
 v_admin boolean; v_business boolean; v_owner boolean; v_reason text;
 v_after_pickup boolean;
begin
 if v_id is null then raise exception 'Debes iniciar sesión'; end if;
 v_reason:=left(btrim(coalesce(p_reason,'')),200);
 if length(v_reason)<5 then raise exception 'Escribe un motivo de al menos cinco caracteres'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then raise exception 'Pedido no encontrado'; end if;
 v_admin:=public.rutaya_is_role('admin');
 v_owner:=v_order.created_by=v_id;
 v_business:=v_order.source='business' and exists(
   select 1 from public.businesses b
   where b.id=v_order.business_id and b.owner_user_id=v_id
 );
 if not v_admin and not (v_owner or v_business) then
   raise exception 'No tienes permiso para cancelar este pedido';
 end if;
 if v_order.status in ('delivered','cancelled') then
   raise exception 'El pedido ya está finalizado; no se puede cancelar. El historial debe conservarse';
 end if;
 if v_admin then
   -- Todo estado activo: pending, accepted, at_pickup, picked_up, at_dropoff.
   if v_order.status not in('pending','accepted','at_pickup','picked_up','at_dropoff') then
    raise exception 'Estado de pedido no permitido';end if;
 elsif v_order.status='pending' then null;
 elsif v_business and v_order.status in('accepted','at_pickup') then null;
 else
   raise exception 'El pedido ya está en camino. Contacta a administración para resolverlo';
 end if;
 v_after_pickup:=v_order.status in('picked_up','at_dropoff');
 update public.orders set status='cancelled',updated_at=now()
 where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,event,actor_id) values(
  p_order_id,
  case when v_after_pickup then 'admin_cancelled_after_pickup: ' else 'cancelled: ' end||v_reason,
  v_id
 );
 -- Se conserva courier_id para auditoría; esto NO devuelve productos ni reembolsa pagos.
 return v_order;
end;$function$;

revoke execute on function public.cancel_rutaya_order(uuid,text) from public,anon;
grant execute on function public.cancel_rutaya_order(uuid,text) to authenticated;
