-- Melhorias: app do entregador (mapa, GPS contínuo, histórico e ganhos) e os 4
-- indicadores operacionais do Dashboard.
--   1. team_members.show_earnings: o admin escolhe, por entregador, se ele vê os ganhos.
--   2. GPS contínuo em trip_positions (source 'gps'), só da própria viagem em andamento.
--   3. Entregador: viagens de hoje, histórico de 30 dias, caminho da viagem e ganhos
--      (mesma conta de _team_statement, usada na Equipe e em Despesas).
--   4. Admin: rastreio da viagem (mapa ao vivo) e indicadores operacionais.
-- Precisa da 0025. Ver rollback/0026_down.sql.

create or replace function public._schema_version()
returns text
language sql
immutable
as $$ select '0026'::text; $$;

-- ---------------------------------------------------------------------------
-- 1. Ganhos visíveis por entregador (padrão: não)
-- ---------------------------------------------------------------------------
alter table team_members add column show_earnings boolean not null default false;

create or replace function public.admin_set_team_member_earnings(p_member uuid, p_show boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pessoas', 'editar');
  update team_members set show_earnings = coalesce(p_show, false), updated_at = now() where id = p_member;
  if not found then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. GPS contínuo
-- ---------------------------------------------------------------------------
alter table trip_positions add column accuracy numeric(8,1) check (accuracy >= 0);

-- Grava a posição do celular. Devolve false quando descarta (rápido demais ou impreciso).
create or replace function public.driver_track_position(p_trip uuid, p_lat double precision,
                                                        p_lng double precision, p_accuracy numeric default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid := _my_driver_id();
begin
  if v_driver is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from trips where id = p_trip and driver_id = v_driver and status = 'em_andamento') then
    raise exception 'Viagem não está em andamento.' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return false;
  end if;
  if p_accuracy is not null and p_accuracy > 200 then
    return false;
  end if;
  if exists (select 1 from trip_positions where trip_id = p_trip and source = 'gps'
             and at > clock_timestamp() - interval '15 seconds') then
    return false;
  end if;
  insert into trip_positions (trip_id, lat, lng, source, accuracy)
  values (p_trip, p_lat, p_lng, 'gps', round(p_accuracy, 1));
  return true;
end;
$$;

-- Caminho de uma viagem (pontos em ordem) e as paradas com coordenadas e situação.
create or replace function public._trip_track(p_trip uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tripId', t.id, 'status', t.status, 'day', t.day, 'driverName', tm.name,
    'startedAt', t.started_at, 'finishedAt', t.finished_at,
    'path', coalesce((select jsonb_agg(jsonb_build_array(round(p.lat::numeric, 6), round(p.lng::numeric, 6)) order by p.at)
      from (select lat, lng, at from trip_positions where trip_id = t.id order by at desc limit 3000) p), '[]'::jsonb),
    'last', (select jsonb_build_object('lat', lat, 'lng', lng, 'at', at, 'source', source, 'accuracy', accuracy)
             from trip_positions where trip_id = t.id order by at desc limit 1),
    'stops', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', s.id, 'routeKind', r.kind, 'position', s.position, 'status', s.status, 'doneAt', s.done_at,
        'name', st.name, 'address', st.address, 'lat', st.lat, 'lng', st.lng))
        order by r.position, s.position)
      from routes r join route_stops s on s.route_id = r.id join stores st on st.id = s.store_id
      where r.trip_id = t.id and r.status <> 'cancelada'), '[]'::jsonb))
  from trips t join team_members tm on tm.id = t.driver_id
  where t.id = p_trip;
$$;

create or replace function public.driver_trip_track(p_trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from trips where id = p_trip and driver_id = _my_driver_id()) then
    raise exception 'Viagem não encontrada.' using errcode = 'P0001';
  end if;
  return _trip_track(p_trip);
end;
$$;

create or replace function public.admin_trip_track(p_trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'ver');
  if not exists (select 1 from trips where id = p_trip) then
    raise exception 'Viagem não encontrada.' using errcode = 'P0001';
  end if;
  return _trip_track(p_trip);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Entregador: viagens de hoje e histórico
-- ---------------------------------------------------------------------------
-- Viagem no formato do app (mesmo da 0017), com a última posição.
create or replace function public._driver_trip_json(p_trip uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id, 'day', t.day, 'status', t.status,
    'vehicle', (select name || coalesce(' · ' || plate, '') from vehicles where id = t.vehicle_id),
    'plannedStartAt', t.planned_start_at, 'startedAt', t.started_at, 'finishedAt', t.finished_at,
    'odometerStart', t.odometer_start, 'plannedKm', t.planned_km, 'actualKm', t.actual_km, 'notes', t.notes,
    'lastPosition', (select jsonb_build_object('lat', lat, 'lng', lng, 'at', at)
                     from trip_positions where trip_id = t.id order by at desc limit 1),
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
    ), '[]'::jsonb))
  from trips t where t.id = p_trip;
$$;

-- Hoje: viagens do dia (enviadas, em andamento e concluídas) + abertas de outros dias.
create or replace function public.driver_trips()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid := _my_driver_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_driver is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(_driver_trip_json(t.id) order by t.day, t.planned_start_at nulls last)
    from trips t
    where t.driver_id = v_driver
      and (t.status in ('enviada', 'em_andamento')
           or (t.status = 'concluida'
               and (t.day = v_today or (t.finished_at at time zone 'America/Sao_Paulo')::date = v_today)))
  ), '[]'::jsonb);
end;
$$;

-- Histórico: concluídas nos últimos 30 dias (mais recentes primeiro).
create or replace function public.driver_trip_history()
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
    select jsonb_agg(_driver_trip_json(t.id) || jsonb_build_object(
      'stopsDone', (select count(*) from routes r join route_stops s on s.route_id = r.id
                    where r.trip_id = t.id and r.status <> 'cancelada' and s.status in ('atendida', 'parcial')),
      'stopsFailed', (select count(*) from routes r join route_stops s on s.route_id = r.id
                      where r.trip_id = t.id and r.status <> 'cancelada' and s.status = 'nao_realizada'))
      order by t.finished_at desc nulls last)
    from trips t
    where t.driver_id = v_driver and t.status = 'concluida'
      and coalesce((t.finished_at at time zone 'America/Sao_Paulo')::date, t.day)
          >= (now() at time zone 'America/Sao_Paulo')::date - 30
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ganhos do entregador (só se o admin liberou)
-- ---------------------------------------------------------------------------
create or replace function public.driver_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid := _my_driver_id();
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_months jsonb := '[]'::jsonb;
  m date;
begin
  if v_driver is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  if not (select show_earnings from team_members where id = v_driver) then
    return jsonb_build_object('enabled', false);
  end if;
  for i in 0..5 loop
    m := (v_month - make_interval(months => i))::date;
    v_months := v_months || jsonb_build_array(_team_statement(v_driver, m) || jsonb_build_object(
      'current', i = 0,
      'dueDate', _nth_business_day((m + interval '1 month')::date, 5),
      'tripList', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', t.id, 'day', t.day,
          'km', t.actual_km, 'cost', t.actual_driver_cost, 'finishedAt', t.finished_at)) order by t.finished_at)
        from trips t where t.driver_id = v_driver and t.status = 'concluida'
          and t.finished_at >= _month_start(m) and t.finished_at < _month_start((m + interval '1 month')::date)),
        '[]'::jsonb)));
  end loop;
  return jsonb_build_object('enabled', true, 'months', v_months);
end;
$$;

-- O entregador com ganhos liberados abre o comprovante dos próprios pagamentos.
create policy "drivers read own payout receipts" on storage.objects
  for select to authenticated using (
    bucket_id = 'finance-docs' and exists (
      select 1 from public.team_payouts p join public.team_members tm on tm.id = p.member_id
      where tm.user_id = auth.uid() and tm.show_earnings and p.receipt_path = storage.objects.name)
  );

-- ---------------------------------------------------------------------------
-- 5. Indicadores operacionais do Dashboard (período por dia de Brasília)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_ops(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_collect_total int; v_collect_on_time int;
  v_failed int; v_failed_reason text; v_stops_ended int;
  v_trips int; v_cost numeric; v_km numeric;
  v_checked int; v_divergent int;
begin
  if not has_any_perm(array['dashboard', 'coletas'], 'ver') then
    perform _require_perm('dashboard', 'ver');
  end if;

  -- Coletas no prazo: atendidas até 1 h depois do horário previsto (ou no dia da viagem).
  select count(*),
         count(*) filter (where s.status in ('atendida', 'parcial') and s.done_at is not null
           and case when s.planned_at is not null then s.done_at <= s.planned_at + interval '1 hour'
                    else (s.done_at at time zone 'America/Sao_Paulo')::date <= t.day end)
    into v_collect_total, v_collect_on_time
  from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
  where r.kind = 'coleta' and r.status <> 'cancelada' and t.status <> 'cancelada'
    and s.status in ('atendida', 'parcial', 'nao_realizada')
    and (p_from is null or t.day >= p_from) and (p_to is null or t.day <= p_to);

  -- Paradas não realizadas (coleta e entrega) e o motivo mais comum.
  select count(*) filter (where s.status = 'nao_realizada'),
         count(*) filter (where s.status in ('atendida', 'parcial', 'nao_realizada'))
    into v_failed, v_stops_ended
  from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
  where r.status <> 'cancelada' and t.status <> 'cancelada'
    and (p_from is null or t.day >= p_from) and (p_to is null or t.day <= p_to);
  select s.reason into v_failed_reason
  from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
  where s.status = 'nao_realizada' and s.reason is not null and r.status <> 'cancelada'
    and (p_from is null or t.day >= p_from) and (p_to is null or t.day <= p_to)
  group by s.reason order by count(*) desc, s.reason limit 1;

  -- Custo por rota: viagens concluídas no período.
  select count(*), coalesce(sum(coalesce(actual_driver_cost, 0) + coalesce(actual_fuel_cost, 0)), 0),
         coalesce(sum(actual_km), 0)
    into v_trips, v_cost, v_km
  from trips where status = 'concluida' and _in_days(finished_at, p_from, p_to);

  -- Divergências: pedidos conferidos no período com algum item recebido ≠ esperado.
  select count(distinct order_id), count(distinct order_id) filter (where received_qty <> expected_qty)
    into v_checked, v_divergent
  from order_item_checks where _in_days(checked_at, p_from, p_to);

  return jsonb_build_object(
    'collectTotal', v_collect_total, 'collectOnTime', v_collect_on_time,
    'stopsEnded', v_stops_ended, 'stopsFailed', v_failed, 'failedTopReason', v_failed_reason,
    'tripsDone', v_trips, 'tripCostAvg', case when v_trips > 0 then round(v_cost / v_trips, 2) end,
    'costPerKm', case when v_km > 0 then round(v_cost / v_km, 2) end,
    'ordersChecked', v_checked, 'ordersDivergent', v_divergent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _schema_version(),
  admin_set_team_member_earnings(uuid, boolean),
  driver_track_position(uuid, double precision, double precision, numeric),
  _trip_track(uuid),
  driver_trip_track(uuid),
  admin_trip_track(uuid),
  _driver_trip_json(uuid),
  driver_trips(),
  driver_trip_history(),
  driver_earnings(),
  admin_dashboard_ops(date, date)
from public, anon, authenticated;

grant execute on function
  admin_set_team_member_earnings(uuid, boolean),
  driver_track_position(uuid, double precision, double precision, numeric),
  driver_trip_track(uuid),
  admin_trip_track(uuid),
  driver_trips(),
  driver_trip_history(),
  driver_earnings(),
  admin_dashboard_ops(date, date)
to authenticated;
