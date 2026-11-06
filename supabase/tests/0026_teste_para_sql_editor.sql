-- TESTE da 0026 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. A 0025 precisa estar aplicada.
-- Gerado de migrations/0026_driver_app.sql + tests/0026_driver_app_test.sql.

begin;

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

-- Teste da 0026_driver_app.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0025 já aplicada.

create table public._t_results (n serial primary key, ok boolean not null, name text not null, info text);
grant all on public._t_results to anon, authenticated;
grant usage on sequence public._t_results_n_seq to anon, authenticated;

create function public._t_check(p_name text, p_ok boolean, p_info text default null)
returns void language sql security definer set search_path = public as $$
  insert into _t_results (ok, name, info) values (coalesce(p_ok, false), p_name, p_info);
$$;

create function public._t_as(p_user uuid, p_anon boolean default false)
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('t1.actor', '', true);
  perform set_config('t1.reason', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', case when p_anon then 'anon' else 'authenticated' end)::text, true);
  if p_anon then
    perform set_config('role', 'anon', true);
  elsif p_user is not null then
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;

create function public._t_err(p_name text, p_sql text, p_expect text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform _t_check(p_name, false, 'não deu erro');
  exception when others then
    perform _t_check(p_name, position(lower(p_expect) in lower(sqlerrm)) > 0, sqlerrm);
  end;
end;
$$;

create function public._t_order(p_origins text[], p_dest text)
returns uuid language plpgsql as $$
begin
  return create_order(jsonb_build_object(
    'originStoreCodes', to_jsonb(p_origins), 'destinationStoreCode', p_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', p_origins[1], 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta 26', 'game', 'magic', 'price', 30,
        'priceMode', 'unit', 'quantity', 2))))));
end;
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_c uuid := gen_random_uuid();    -- só vê Coletas
  v_x uuid := gen_random_uuid();    -- só vê Despesas
  v_d uuid := gen_random_uuid();    -- entregador
  v_d2 uuid := gen_random_uuid();   -- outro entregador
  v_u uuid := gen_random_uuid();    -- cliente
  r_c uuid; r_x uuid;
  m_d uuid; m_d2 uuid;
  v_s1 uuid; v_s2 uuid; v_dest text; v_s1code text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_old date := (now() at time zone 'America/Sao_Paulo')::date - 200;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; rt uuid; v_order uuid;
  r jsonb; e jsonb;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_c, v_x, v_d, v_d2, v_u]) u;
  insert into staff_roles (name) values ('Só Coletas') returning id into r_c;
  insert into staff_roles (name) values ('Só Despesas 26') returning id into r_x;
  insert into staff_role_permissions (role_id, area, can_view) values (r_c, 'coletas', true), (r_x, 'despesas', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_c, r_c), (v_x, r_x);
  insert into team_members (name, kind, user_id) values ('Entregador 26', 'entregador', v_d) returning id into m_d;
  insert into team_members (name, kind, user_id) values ('Outro Entregador 26', 'entregador', v_d2) returning id into m_d2;
  insert into team_pay_rules (member_id, kind, amount_brl) values (m_d, 'fixo_mensal', 800);
  select id, code into v_s1, v_s1code from stores order by is_pickup_point, code limit 1;
  select id into v_s2 from stores where id <> v_s1 order by code limit 1;
  select code into v_dest from stores where is_pickup_point and id <> v_s1 order by code limit 1;
  perform _t_check('versão do banco', _schema_version() = '0026');

  -- Viagens: t1 em andamento hoje; t2 concluída há 10 dias; t3 há 40 dias; t4 de outro entregador.
  insert into trips (day, driver_id, status, started_at) values (v_today, m_d, 'em_andamento', now()) returning id into t1;
  insert into routes (kind, day, trip_id, status) values ('coleta', v_today, t1, 'em_andamento') returning id into rt;
  insert into route_stops (route_id, store_id, position, status, done_at) values (rt, v_s1, 1, 'atendida', now()), (rt, v_s2, 2, 'aguardando', null);
  insert into trips (day, driver_id, status, started_at, finished_at, actual_km, actual_driver_cost)
  values (v_today - 10, m_d, 'concluida', now() - interval '10 days', now() - interval '10 days', 20, 50) returning id into t2;
  insert into routes (kind, day, trip_id, status) values ('coleta', v_today - 10, t2, 'concluida') returning id into rt;
  insert into route_stops (route_id, store_id, position, status, done_at, reason)
  values (rt, v_s1, 1, 'atendida', now() - interval '10 days', null), (rt, v_s2, 2, 'nao_realizada', now() - interval '10 days', 'loja_fechada');
  insert into trips (day, driver_id, status, finished_at) values (v_today - 40, m_d, 'concluida', now() - interval '40 days') returning id into t3;
  insert into trips (day, driver_id, status, started_at) values (v_today, m_d2, 'em_andamento', now()) returning id into t4;

  -- 1. GPS contínuo -----------------------------------------------------------------------
  perform _t_as(v_d);
  perform _t_check('GPS: grava a posição da própria viagem em andamento', driver_track_position(t1, -22.9, -43.2, 12));
  perform _t_check('GPS: descarta leitura em menos de 15 s', not driver_track_position(t1, -22.91, -43.21, 10));
  perform _t_check('GPS: descarta precisão pior que 200 m', not driver_track_position(t1, -22.92, -43.22, 500));
  perform _t_err('GPS: não grava em viagem concluída', format('select driver_track_position(%L, -22.9, -43.2)', t2), 'não está em andamento');
  perform _t_err('GPS: não grava na viagem de outro entregador', format('select driver_track_position(%L, -22.9, -43.2)', t4), 'não está em andamento');
  perform _t_as(null);
  perform _t_check('GPS fica gravado como "gps" com a precisão',
    (select count(*) = 1 and min(accuracy) = 12 from trip_positions where trip_id = t1 and source = 'gps'));

  -- 2. Viagens de hoje e histórico ---------------------------------------------------------
  perform _t_as(v_d);
  r := driver_trips();
  perform _t_check('hoje: traz a viagem em andamento com a última posição',
    exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = t1 and x -> 'lastPosition' ->> 'lat' is not null)
    and not exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid in (t2, t3, t4)), r::text);
  r := driver_trip_history();
  e := (select x from jsonb_array_elements(r) x where (x ->> 'id')::uuid = t2);
  perform _t_check('histórico: concluída há 10 dias com paradas feitas e não feitas',
    e is not null and (e ->> 'stopsDone')::int = 1 and (e ->> 'stopsFailed')::int = 1 and (e ->> 'actualKm')::numeric = 20, e::text);
  perform _t_check('histórico: não traz mais de 30 dias nem viagem aberta',
    not exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid in (t1, t3)));
  r := driver_trip_track(t1);
  perform _t_check('mapa: caminho e paradas da própria viagem',
    jsonb_array_length(r -> 'path') = 1 and jsonb_array_length(r -> 'stops') = 2 and r -> 'last' ->> 'source' = 'gps', r::text);
  perform _t_err('mapa: não abre a viagem de outro entregador', format('select driver_trip_track(%L)', t4), 'não encontrada');

  -- 3. Ganhos --------------------------------------------------------------------------------
  perform _t_check('ganhos: escondidos por padrão', (driver_earnings() ->> 'enabled')::boolean = false);
  perform _t_as(v_c);
  perform _t_err('quem só vê Coletas não libera ganhos', format('select admin_set_team_member_earnings(%L, true)', m_d), 'não permite');
  perform _t_as(v_a);
  perform admin_set_team_member_earnings(m_d, true);
  perform _t_as(v_d);
  r := driver_earnings();
  perform _t_as(null);
  perform _t_check('ganhos liberados: 6 meses, o atual igual à conta da Equipe',
    (r ->> 'enabled')::boolean and jsonb_array_length(r -> 'months') = 6
    and (r -> 'months' -> 0 ->> 'current')::boolean
    and (r -> 'months' -> 0 ->> 'total')::numeric = (_team_statement(m_d, v_today) ->> 'total')::numeric
    and r -> 'months' -> 0 ->> 'dueDate' is not null, (r -> 'months' -> 0)::text);
  perform _t_check('ganhos: a viagem concluída aparece no mês dela',
    exists (select 1 from jsonb_array_elements(r -> 'months') m, jsonb_array_elements(m -> 'tripList') t
            where (t ->> 'id')::uuid = t2 and (t ->> 'cost')::numeric = 50));
  perform _t_as(v_d2);
  perform _t_check('outro entregador continua sem ganhos', (driver_earnings() ->> 'enabled')::boolean = false);

  -- 4. Rastreio no admin ---------------------------------------------------------------------
  perform _t_as(v_c);
  r := admin_trip_track(t1);
  perform _t_check('admin com Coletas vê a viagem ao vivo',
    r ->> 'driverName' = 'Entregador 26' and jsonb_array_length(r -> 'stops') = 2 and r -> 'last' is not null, r::text);
  perform _t_as(v_x);
  perform _t_err('sem Coletas não vê o rastreio', format('select admin_trip_track(%L)', t1), 'não permite');
  perform _t_as(v_d);
  perform _t_err('entregador não usa a função do admin', format('select admin_trip_track(%L)', t1), 'restrito');

  -- 5. Indicadores do Dashboard (dia isolado, há 200 dias) -----------------------------------
  perform _t_as(null);
  insert into trips (day, driver_id, status, started_at, finished_at, actual_km, actual_driver_cost, actual_fuel_cost)
  values (v_old, m_d2, 'concluida', v_old + time '08:00', (v_old + time '18:00') at time zone 'America/Sao_Paulo', 25, 40, 10)
  returning id into t5;
  insert into routes (kind, day, trip_id, status) values ('coleta', v_old, t5, 'concluida') returning id into rt;
  insert into route_stops (route_id, store_id, position, status, planned_at, done_at, reason) values
    (rt, v_s1, 1, 'atendida', (v_old + time '10:00') at time zone 'America/Sao_Paulo', (v_old + time '10:30') at time zone 'America/Sao_Paulo', null),
    (rt, v_s2, 2, 'atendida', (v_old + time '11:00') at time zone 'America/Sao_Paulo', (v_old + time '14:00') at time zone 'America/Sao_Paulo', null),
    (rt, v_s1, 3, 'nao_realizada', null, (v_old + time '15:00') at time zone 'America/Sao_Paulo', 'loja_fechada');
  perform _t_as(v_u);
  v_order := _t_order(array[v_s1code], v_dest);
  perform _t_as(null);
  insert into order_item_checks (order_id, card_item_id, expected_qty, received_qty, checked_at)
  select v_order, ci.id, 2, 1, (v_old + time '12:00') at time zone 'America/Sao_Paulo'
  from pedido_card_items ci join pedido_groups g on g.id = ci.group_id where g.order_id = v_order;
  perform _t_as(v_a);
  r := admin_dashboard_ops(v_old, v_old);
  perform _t_check('coletas no prazo: 1 de 3 (uma atrasada, uma não feita)',
    (r ->> 'collectTotal')::int = 3 and (r ->> 'collectOnTime')::int = 1, r::text);
  perform _t_check('paradas não realizadas e o motivo mais comum',
    (r ->> 'stopsFailed')::int = 1 and (r ->> 'stopsEnded')::int = 3 and r ->> 'failedTopReason' = 'loja_fechada');
  perform _t_check('custo por rota e por km', (r ->> 'tripsDone')::int = 1 and (r ->> 'tripCostAvg')::numeric = 50
    and (r ->> 'costPerKm')::numeric = 2);
  perform _t_check('divergências na conferência', (r ->> 'ordersChecked')::int = 1 and (r ->> 'ordersDivergent')::int = 1);
  perform _t_as(v_c);
  perform _t_check('quem vê Coletas também lê os indicadores', (admin_dashboard_ops(v_old, v_old) ->> 'tripsDone')::int = 1);
  perform _t_as(v_x);
  perform _t_err('sem Dashboard nem Coletas não lê', format('select admin_dashboard_ops(%L, %L)', v_old, v_old), 'não permite');

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
