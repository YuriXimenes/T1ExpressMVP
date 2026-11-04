-- Desfaz 0017_routes.sql. APAGA viagens, rotas, paradas, veículos, preços de
-- combustível e fechamentos de loja. Os pedidos ficam na etapa em que estiverem.
-- Fotos de parada no bucket (pasta stops/) não são apagadas por SQL.
drop policy if exists "drivers and staff read stop photos" on storage.objects;
drop policy if exists "drivers upload stop photos" on storage.objects;

drop function if exists public.driver_finish_trip(uuid, numeric, double precision, double precision);
drop function if exists public.driver_add_stop_photo(uuid, text);
drop function if exists public.driver_deliver_by_token(text, jsonb);
drop function if exists public.driver_record_stop(uuid, jsonb);
drop function if exists public._refresh_stop(uuid);
drop function if exists public._apply_stop_result(uuid, uuid, boolean, text, text);
drop function if exists public.driver_start_trip(uuid, numeric, double precision, double precision);
drop function if exists public._driver_trip_of_stop(uuid);
drop function if exists public.driver_trips();
drop function if exists public.my_driver_access();
drop function if exists public.admin_list_drivers();
drop function if exists public.admin_set_store_closure(text, date, boolean, text);
drop function if exists public.admin_update_ops_settings(jsonb);
drop function if exists public.admin_set_fuel_price(date, numeric);
drop function if exists public.admin_upsert_vehicle(uuid, jsonb);
drop function if exists public.admin_set_trip_odometer(uuid, numeric, numeric);
drop function if exists public.admin_cancel_trip(uuid, text);
drop function if exists public.admin_send_trip(uuid);
drop function if exists public.admin_save_trip(uuid, jsonb);
drop function if exists public.admin_cancel_route(uuid);
drop function if exists public.admin_remove_route_order(uuid, uuid);
drop function if exists public.admin_reorder_stops(uuid, uuid[]);
drop function if exists public.admin_create_route(text, date, jsonb);
drop function if exists public.admin_delivery_backlog();
drop function if exists public.admin_collection_backlog();
drop function if exists public._trip_recompute(uuid);
drop function if exists public._driver_cost(uuid, numeric, boolean);
drop function if exists public._fuel_cost(numeric, numeric, numeric);
drop function if exists public._km_between(double precision, double precision, double precision, double precision);

drop table if exists stop_photos;
drop table if exists trip_positions;
drop table if exists route_stop_orders;
drop table if exists route_stops;
drop table if exists routes;
drop table if exists trips;
drop table if exists store_closures;
drop table if exists ops_settings;
drop table if exists fuel_prices;
drop table if exists vehicles;

-- pickup_lookup volta ao formato da 0015 (sem "driverCanDeliver").
create or replace function public.pickup_lookup(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select p.*, o.id as oid, o.status, o.delivery_stage, s.name as store_name,
         split_part(btrim(pr.name), ' ', 1) as first_name
    into r
    from order_pickups p
    join orders o on o.id = p.order_id
    join stores s on s.id = o.destination_store_id
    left join profiles pr on pr.id = o.user_id
    where p.package_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'orderCode', upper(left(r.oid::text, 8)),
    'storeName', r.store_name,
    'customerFirstName', r.first_name,
    'state', case
      when r.used_at is not null or r.status = 'completed' then 'done'
      when r.status = 'cancelled' then 'cancelled'
      when r.status = 'active' and r.delivery_stage = 'disponivel-para-retirada' then 'ready'
      else 'not_ready' end,
    'lockedUntil', case when r.locked_until > now() then r.locked_until end,
    'attemptsLeft', 5 - r.failed_attempts
  );
end;
$$;

drop function if exists public._my_driver_id();

delete from order_events where kind in ('route', 'stop_failed') or actor_kind = 'driver';
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened',
  'items_checked', 'custody'
));
alter table order_events drop constraint order_events_actor_kind_check;
alter table order_events add constraint order_events_actor_kind_check
  check (actor_kind in ('customer', 'admin', 'store', 'system'));

create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'store' then
    actor_id := null;
    actor_kind := 'store';
  elsif current_setting('t1.actor', true) = 'admin' then
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
