-- Desfaz a 0026_driver_app.sql (posições GPS ficam; só a coluna de precisão sai).
create or replace function public._schema_version()
returns text
language sql
immutable
as $$ select '0025'::text; $$;

drop policy if exists "drivers read own payout receipts" on storage.objects;
drop function if exists admin_dashboard_ops(date, date);
drop function if exists driver_earnings();
drop function if exists driver_trip_history();
drop function if exists admin_trip_track(uuid);
drop function if exists driver_trip_track(uuid);
drop function if exists _trip_track(uuid);
drop function if exists driver_track_position(uuid, double precision, double precision, numeric);
drop function if exists admin_set_team_member_earnings(uuid, boolean);

-- driver_trips volta à versão da 0017.
create or replace function public.driver_trips()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid := _my_driver_id();
begin
  if v_driver is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'day', t.day, 'status', t.status,
      'vehicle', (select name || coalesce(' · ' || plate, '') from vehicles where id = t.vehicle_id),
      'plannedStartAt', t.planned_start_at, 'startedAt', t.started_at, 'finishedAt', t.finished_at,
      'odometerStart', t.odometer_start, 'plannedKm', t.planned_km, 'notes', t.notes,
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'kind', r.kind, 'status', r.status,
          'stops', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'position', s.position, 'status', s.status, 'plannedAt', s.planned_at,
              'doneAt', s.done_at, 'reason', s.reason, 'note', s.note, 'contactName', s.contact_name,
              'store', jsonb_build_object('name', st.name, 'address', st.address,
                'neighborhood', st.neighborhood, 'city', st.city, 'lat', st.lat, 'lng', st.lng),
              'orders', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'orderId', so.order_id,
                  'code', upper(left(so.order_id::text, 8)),
                  'customerFirstName', split_part(btrim(pr.name), ' ', 1),
                  'result', so.result
                ) order by so.order_id)
                from route_stop_orders so
                join orders o on o.id = so.order_id
                left join profiles pr on pr.id = o.user_id
                where so.stop_id = s.id
              ), '[]'::jsonb)
            ) order by s.position)
            from route_stops s join stores st on st.id = s.store_id
            where s.route_id = r.id
          ), '[]'::jsonb)
        ) order by r.position)
        from routes r where r.trip_id = t.id and r.status <> 'cancelada'
      ), '[]'::jsonb)
    ) order by t.day, t.planned_start_at nulls last)
    from trips t
    where t.driver_id = v_driver
      and (t.status in ('enviada', 'em_andamento')
           or (t.status = 'concluida' and t.day >= (now() at time zone 'America/Sao_Paulo')::date))
  ), '[]'::jsonb);
end;
$$;

drop function if exists _driver_trip_json(uuid);
alter table trip_positions drop column if exists accuracy;
alter table team_members drop column if exists show_earnings;
