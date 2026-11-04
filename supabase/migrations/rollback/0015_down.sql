-- Desfaz 0015_order_handling.sql. APAGA conferências, registros de fotos,
-- custódia e códigos de retirada. Os arquivos do bucket `order-photos` não são
-- apagados por SQL: remova pelo painel do Storage se quiser.
drop function if exists public.pickup_confirm(text, text);
drop function if exists public.pickup_lookup(text);
drop function if exists public.admin_add_custody_event(uuid, jsonb);
drop function if exists public.admin_delete_photo(uuid);
drop function if exists public.admin_add_photo(uuid, text, uuid, text);
drop function if exists public.admin_save_item_checks(uuid, jsonb);
drop trigger if exists custody_events_log on custody_events;
drop function if exists public._custody_log_event();
drop trigger if exists orders_create_pickup on orders;
drop function if exists public._orders_create_pickup();
drop function if exists public._new_pickup(uuid);

drop policy if exists "admins and owners read order photos" on storage.objects;
drop policy if exists "admins delete order photos" on storage.objects;
drop policy if exists "admins upload order photos" on storage.objects;

drop table if exists order_pickups;
drop table if exists custody_events;
drop table if exists order_photos;
drop table if exists order_item_checks;

delete from order_events where kind in ('items_checked', 'custody') or actor_kind = 'store';
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened'
));
alter table order_events drop constraint order_events_actor_kind_check;
alter table order_events add constraint order_events_actor_kind_check
  check (actor_kind in ('customer', 'admin', 'system'));

create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'admin' then
    actor_kind := 'admin';
  elsif actor_id is null then
    actor_kind := 'system';
  elsif actor_id = p_owner then
    actor_kind := 'customer';
  elsif is_admin() then
    actor_kind := 'admin';
  else
    actor_kind := 'system';
  end if;
end;
$$;
