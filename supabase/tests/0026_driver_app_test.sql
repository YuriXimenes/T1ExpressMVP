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
