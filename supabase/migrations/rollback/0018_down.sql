-- Desfaz 0018_points_occurrences.sql. APAGA ocorrências, tipos, atualizações,
-- anexos (registro) e resoluções, e os horários, capacidade e prazo de guarda
-- dos pontos. Cupons criados por ocorrências continuam na tabela coupons.
-- Arquivos no bucket (pasta occurrences/) não são apagados por SQL.
drop policy if exists "involved read occurrence files" on storage.objects;
drop policy if exists "involved upload occurrence files" on storage.objects;
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'order-photos';

drop function if exists public.admin_extend_guard(uuid, date, text);
drop function if exists public.admin_update_pickup_point(text, jsonb);
drop function if exists public.admin_point_pickups(text, date, date);
drop function if exists public.admin_point_packages(text);
drop function if exists public.admin_pickup_points();
drop function if exists public.occurrence_add_attachment(uuid, text, text, text);
drop function if exists public.occurrence_comment(uuid, text);
drop function if exists public.driver_open_occurrence(jsonb);
drop function if exists public.driver_my_occurrences();
drop function if exists public.customer_open_occurrence(uuid, uuid, text);
drop function if exists public.my_order_occurrences(uuid);
drop function if exists public.admin_upsert_occurrence_type(uuid, jsonb);
drop function if exists public.admin_add_resolution(uuid, jsonb);
drop function if exists public.admin_reopen_occurrence(uuid, text);
drop function if exists public.admin_update_occurrence(uuid, jsonb);
drop function if exists public.admin_open_occurrence(jsonb);
drop function if exists public.admin_occurrence_assignees();
drop function if exists public.admin_occurrence_summary();
drop function if exists public.admin_occurrence(uuid);
drop function if exists public.admin_occurrences(uuid);

drop trigger if exists route_stops_closed_occurrence on route_stops;
drop trigger if exists order_events_items_checked_occurrence on order_events;
drop trigger if exists orders_mark_available on orders;

drop function if exists public._occ_json(uuid, text, boolean);
drop function if exists public._occ_on_stop_closed();
drop function if exists public._occ_on_items_checked();
drop function if exists public._occ_maintain();
drop function if exists public._occ_sync_guard();
drop function if exists public._occ_autoclose();
drop function if exists public._occ_system_type(text);
drop function if exists public._occ_create(uuid, text, uuid, uuid, uuid, uuid, text, double precision, double precision, text);
drop function if exists public._occ_order_event(uuid, text, text);
drop function if exists public._occ_log(uuid, text, text, text, text, boolean, text);
drop function if exists public._can_see_occurrence_path(text);
drop function if exists public._occ_role(uuid);
drop function if exists public._orders_mark_available();

drop table if exists occurrence_resolutions;
drop table if exists occurrence_attachments;
drop table if exists occurrence_updates;
drop table if exists occurrences;
drop table if exists occurrence_types;

alter table order_pickups drop column if exists guard_until;
alter table order_pickups drop column if exists available_at;
alter table stores drop column if exists guard_days;
alter table stores drop column if exists pickup_capacity;
alter table stores drop column if exists pickup_hours;

drop function if exists public._add_business_days(timestamptz, int);
drop function if exists public._is_holiday(date);
drop function if exists public._easter(int);

-- Linha do tempo: volta ao que a 0017 deixou.
delete from order_events where kind in ('occurrence', 'pickup_deadline');
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened',
  'items_checked', 'custody',
  'route', 'stop_failed'
));

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
  elsif current_setting('t1.actor', true) = 'driver' then
    actor_kind := 'driver';
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
