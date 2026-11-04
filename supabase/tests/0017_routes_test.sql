-- Teste da 0017_routes.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Montado junto com a migração em 0017_teste_para_sql_editor.sql.

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

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();   -- Administrador
  v_nc uuid := gen_random_uuid();  -- backoffice sem coletas nem pedidos
  v_d uuid := gen_random_uuid();   -- entregador
  v_d2 uuid := gen_random_uuid();  -- outro entregador
  v_c uuid := gen_random_uuid();   -- cliente
  v_role uuid;
  v_driver uuid; v_driver2 uuid; v_vehicle uuid;
  v_dest text; v_s1 text; v_s2 text;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  x uuid; y uuid;
  v_coleta uuid; v_entrega uuid; v_coleta_y uuid;
  v_trip1 uuid; v_trip2 uuid; v_trip3 uuid;
  v_stop1 uuid; v_stop2 uuid; v_stop_y uuid;
  v_token text;
  t trips%rowtype;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas, lojas e base de teste (somem no fim) -----------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_nc, v_d, v_d2, v_c]) u;
  insert into staff_roles (name) values ('Sem coletas') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'dashboard', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_nc, v_role);
  insert into team_members (name, kind, user_id) values ('Entregador Teste', 'entregador', v_d) returning id into v_driver;
  insert into team_members (name, kind, user_id) values ('Outro Entregador', 'entregador', v_d2) returning id into v_driver2;
  insert into team_pay_rules (member_id, kind, amount_brl) values
    (v_driver, 'por_parada', 5), (v_driver, 'por_km', 1), (v_driver, 'bonus', 10), (v_driver, 'fixo_mensal', 1500);

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;
  update stores set lat = -22.91, lng = -43.18 where code = v_s1;
  update stores set lat = -22.92, lng = -43.19 where code = v_s2;
  update stores set lat = -22.95, lng = -43.21 where code = v_dest;
  update ops_settings set base_lat = -22.90, base_lng = -43.20;

  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1, v_s2), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'X', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  y := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Y', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y);
  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform pay_order(y, 'pix');

  -- 2. Cadastros ------------------------------------------------------------------------
  perform _t_as(v_a);
  v_vehicle := admin_upsert_vehicle(null, '{"name":"Moto teste","plate":"abc1d23","kmPerLiter":10}'::jsonb);
  perform _t_check('veículo cadastrado com placa em maiúsculas',
    (select plate = 'ABC1D23' from vehicles where id = v_vehicle));
  perform _t_err('veículo sem consumo é recusado', 'select admin_upsert_vehicle(null, ''{"name":"X"}''::jsonb)', 'consumo');
  perform admin_set_fuel_price(v_day, 6);
  perform _t_err('preço do litro inválido', format('select admin_set_fuel_price(%L, 0)', v_day), 'preço');
  perform admin_set_store_closure(v_s2, v_day + 1, true, 'Feriado da loja');
  perform _t_check('loja fechada registrada', exists (select 1 from store_closures where day = v_day + 1));
  perform _t_check('lista de entregadores para montar viagem', (select count(*) >= 2 from admin_list_drivers()));

  -- 3. Pendências e acesso ---------------------------------------------------------------
  select count(*) into v_n from admin_collection_backlog() where order_id = x;
  perform _t_check('pedido com 2 lojas aparece 2 vezes para coletar', v_n = 2, v_n::text);
  perform _t_as(v_nc);
  perform _t_err('sem a área coletas não vê o planejamento', 'select * from admin_collection_backlog()', 'não permite');
  select count(*) into v_n from trips;
  perform _t_check('sem coletas nem pedidos não lê viagens', v_n = 0);
  perform _t_as(v_d);
  perform _t_err('entregador não usa função de admin', 'select * from admin_collection_backlog()', 'Acesso restrito');

  -- 4. Rota de coleta e viagem ------------------------------------------------------------
  perform _t_as(v_a);
  v_coleta := admin_create_route('coleta', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(x)),
    jsonb_build_object('storeCode', v_s2, 'orderIds', jsonb_build_array(x))));
  perform _t_check('rota de coleta com 2 paradas', (select count(*) = 2 from route_stops where route_id = v_coleta));
  perform _t_check('linha do tempo: pedido entrou em rota',
    exists (select 1 from order_events where order_id = x and kind = 'route' and to_value = 'adicionado'));
  perform _t_err('mesmo pedido em duas rotas de coleta abertas',
    format('select admin_create_route(''coleta'', %L, %L::jsonb)', v_day,
      jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(x)))), 'outra rota');
  perform _t_err('pedido que não está em transporte não entra em entrega',
    format('select admin_create_route(''entrega'', %L, %L::jsonb)', v_day,
      jsonb_build_array(jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(y)))), 'não está pronto');

  v_trip1 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'vehicleId', v_vehicle, 'routeIds', jsonb_build_array(v_coleta), 'plannedStart', '08:00'));
  select * into t from trips where id = v_trip1;
  perform _t_check('viagem guarda preço do litro e consumo', t.fuel_price = 6 and t.km_per_liter = 10);
  perform _t_check('km previsto calculado pelas coordenadas', t.planned_km > 0, t.planned_km::text);
  perform _t_check('custo do entregador previsto = 2 paradas×5 + km×1 + bônus (sem fixo mensal)',
    t.planned_driver_cost = round(2 * 5 + t.planned_km * 1 + 10, 2), t.planned_driver_cost::text);
  perform _t_check('combustível previsto = km ÷ 10 × 6', t.planned_fuel_cost = round(t.planned_km / 10 * 6, 2));
  perform _t_check('horários das paradas estimados',
    (select count(*) = 2 from route_stops where route_id = v_coleta and planned_at > t.planned_start_at));
  perform _t_err('rota não entra em duas viagens',
    format('select admin_save_trip(null, %L::jsonb)', jsonb_build_object('day', v_day, 'driverId', v_driver,
      'routeIds', jsonb_build_array(v_coleta))), 'não está disponível');
  perform _t_err('viagem sem entregador da equipe',
    format('select admin_save_trip(null, %L::jsonb)', jsonb_build_object('day', v_day, 'driverId', gen_random_uuid(),
      'routeIds', jsonb_build_array(v_coleta))), 'entregador');

  -- 5. Entregador: só as próprias viagens -------------------------------------------------
  perform _t_as(v_d);
  perform _t_check('viagem planejada ainda não aparece para o entregador', jsonb_array_length(driver_trips()) = 0);
  perform _t_as(v_a);
  perform admin_send_trip(v_trip1);
  perform _t_as(v_d);
  r := driver_trips();
  perform _t_check('entregador vê a viagem enviada com as paradas',
    jsonb_array_length(r) = 1 and jsonb_array_length(r -> 0 -> 'routes' -> 0 -> 'stops') = 2, r::text);
  select count(*) into v_n from trips;
  perform _t_check('entregador não lê a tabela de viagens direto', v_n = 0);
  perform _t_as(null);
  select id into v_stop1 from route_stops where route_id = v_coleta and position = 1;
  select id into v_stop2 from route_stops where route_id = v_coleta and position = 2;
  perform _t_check('paradas da coleta encontradas', v_stop1 is not null and v_stop2 is not null);
  perform _t_as(v_d2);
  perform _t_check('outro entregador não vê a viagem', jsonb_array_length(driver_trips()) = 0);
  perform _t_err('outro entregador não registra parada',
    format('select driver_record_stop(%L, %L::jsonb)', v_stop1, jsonb_build_object('orders',
      jsonb_build_array(jsonb_build_object('orderId', x, 'ok', true)))), 'não encontrada');
  perform _t_as(v_c);
  perform _t_err('cliente não é entregador', 'select driver_trips()', 'entregadores ativos');

  -- 6. Coleta ------------------------------------------------------------------------------
  perform _t_as(v_d);
  perform _t_err('registrar antes de iniciar',
    format('select driver_record_stop(%L, %L::jsonb)', v_stop1, jsonb_build_object('orders',
      jsonb_build_array(jsonb_build_object('orderId', x, 'ok', true)))), 'Inicie a viagem');
  perform driver_start_trip(v_trip1, 1000, -22.90, -43.20);
  perform _t_as(v_a);
  perform _t_err('rota começada não é reordenada',
    format('select admin_reorder_stops(%L, %L::uuid[])', v_coleta, array[v_stop2, v_stop1]), 'não começou');
  perform _t_as(v_d);
  perform driver_record_stop(v_stop1, jsonb_build_object('contactName', 'Lojista 1', 'lat', -22.91, 'lng', -43.18,
    'orders', jsonb_build_array(jsonb_build_object('orderId', x, 'ok', true))));
  perform _t_as(null);
  perform _t_check('parada atendida com nome e posição',
    (select status = 'atendida' and contact_name = 'Lojista 1' and lat = -22.91 from route_stops where id = v_stop1));
  perform _t_check('custódia "coletado na loja" pelo entregador',
    exists (select 1 from custody_events where order_id = x and action = 'coletado_na_loja'));
  perform _t_check('com uma loja pendente, o pedido ainda aguarda coleta',
    (select delivery_stage = 'aguardando-coleta' from orders where id = x));
  perform _t_as(v_d);
  perform _t_err('parada não é registrada duas vezes',
    format('select driver_record_stop(%L, %L::jsonb)', v_stop1, jsonb_build_object('orders',
      jsonb_build_array(jsonb_build_object('orderId', x, 'ok', true)))), 'já foi registrada');
  perform driver_record_stop(v_stop2, jsonb_build_object('contactName', 'Lojista 2',
    'orders', jsonb_build_array(jsonb_build_object('orderId', x, 'ok', true))));
  perform _t_as(null);
  perform _t_check('todas as lojas coletadas: pedido em transporte',
    (select delivery_stage = 'em-transporte' from orders where id = x));
  perform _t_check('linha do tempo: etapa mudada pelo entregador',
    exists (select 1 from order_events where order_id = x and kind = 'stage_changed'
      and actor_kind = 'driver' and to_value = 'em-transporte'));
  perform _t_check('posições registradas para o futuro GPS',
    (select count(*) >= 2 from trip_positions where trip_id = v_trip1));

  -- 7. Entrega pelo QR ----------------------------------------------------------------------
  perform _t_as(v_a);
  v_entrega := admin_create_route('entrega', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(x))));
  v_trip2 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'vehicleId', v_vehicle, 'routeIds', jsonb_build_array(v_entrega)));
  perform admin_send_trip(v_trip2);
  perform _t_as(null);
  select package_token into v_token from order_pickups where order_id = x;
  perform _t_as(v_d);
  perform _t_check('QR antes de iniciar: entregador ainda não pode entregar',
    not (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  perform driver_start_trip(v_trip2, 1040);
  perform _t_check('QR: entregador da viagem pode entregar', (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  perform _t_as(null, true);
  perform _t_check('QR: anônimo não vê a opção de entrega', not (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  perform _t_as(v_d2);
  perform _t_err('outro entregador não entrega pelo QR',
    format('select driver_deliver_by_token(%L)', v_token), 'não está numa entrega');
  perform _t_as(v_d);
  r := driver_deliver_by_token(v_token, '{"contactName":"Atendente"}'::jsonb);
  perform _t_as(null);
  perform _t_check('entrega pelo QR: pedido disponível para retirada',
    (r ->> 'ok')::boolean and (select delivery_stage = 'disponivel-para-retirada' from orders where id = x));
  perform _t_check('custódia "entregue no ponto"',
    exists (select 1 from custody_events where order_id = x and action = 'entregue_no_ponto'));
  perform _t_check('parada de entrega atendida',
    (select status = 'atendida' from route_stops where route_id = v_entrega));
  perform _t_as(null, true);
  perform _t_check('próxima leitura do QR: pronto para o código do cliente', pickup_lookup(v_token) ->> 'state' = 'ready');

  -- 8. Fechamento e custo real ----------------------------------------------------------------
  perform _t_as(v_d);
  perform _t_err('odômetro final menor que o inicial', format('select driver_finish_trip(%L, 900)', v_trip1), 'maior que o inicial');
  perform driver_finish_trip(v_trip1, 1040);
  perform _t_as(null);
  select * into t from trips where id = v_trip1;
  perform _t_check('viagem concluída com km do odômetro', t.status = 'concluida' and t.actual_km = 40 and t.km_source = 'odometro');
  perform _t_check('custo real do entregador = 2×5 + 40×1 + 10 = 60', t.actual_driver_cost = 60, t.actual_driver_cost::text);
  perform _t_check('combustível real = 40 ÷ 10 × 6 = 24', t.actual_fuel_cost = 24, t.actual_fuel_cost::text);

  -- 9. Parada não realizada --------------------------------------------------------------------
  perform _t_as(v_a);
  v_coleta_y := admin_create_route('coleta', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(y))));
  v_trip3 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_coleta_y)));
  perform admin_send_trip(v_trip3);
  perform _t_as(null);
  select id into v_stop_y from route_stops where route_id = v_coleta_y;
  perform _t_as(v_d);
  perform driver_start_trip(v_trip3, 2000);
  perform _t_err('não coletado sem motivo é recusado',
    format('select driver_record_stop(%L, %L::jsonb)', v_stop_y, jsonb_build_object('orders',
      jsonb_build_array(jsonb_build_object('orderId', y, 'ok', false)))), 'motivo');
  perform _t_err('motivo "outro" exige observação',
    format('select driver_record_stop(%L, %L::jsonb)', v_stop_y, jsonb_build_object('reason', 'outro', 'orders',
      jsonb_build_array(jsonb_build_object('orderId', y, 'ok', false)))), 'Descreva');
  perform _t_err('finalizar com parada pendente',
    format('select driver_finish_trip(%L, 2010)', v_trip3), 'todas as paradas');
  perform driver_record_stop(v_stop_y, jsonb_build_object('reason', 'loja_fechada',
    'orders', jsonb_build_array(jsonb_build_object('orderId', y, 'ok', false))));
  perform _t_as(null);
  perform _t_check('parada não realizada', (select status = 'nao_realizada' and reason = 'loja_fechada' from route_stops where id = v_stop_y));
  perform _t_check('linha do tempo: parada não realizada com motivo',
    exists (select 1 from order_events where order_id = y and kind = 'stop_failed' and reason = 'loja_fechada'));
  perform _t_as(v_a);
  perform _t_check('pedido volta para o planejamento de coleta',
    exists (select 1 from admin_collection_backlog() where order_id = y and open_route_id is null));

  -- 10. Fotos e cancelamento -------------------------------------------------------------------
  perform _t_as(v_d);
  perform _t_err('foto de parada com caminho inválido',
    format('select driver_add_stop_photo(%L, ''outro/abc.jpg'')', v_stop_y), 'inválido');
  perform _t_check('foto de parada registrada',
    driver_add_stop_photo(v_stop_y, 'stops/' || v_stop_y || '/' || gen_random_uuid() || '.jpg') is not null);
  perform _t_as(v_c);
  select count(*) into v_n from stop_photos;
  perform _t_check('cliente não vê fotos de parada', v_n = 0);

  perform _t_as(v_a);
  v_coleta_y := admin_create_route('coleta', v_day + 7, jsonb_build_array(
    jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(y))));
  v_trip3 := admin_save_trip(null, jsonb_build_object('day', v_day + 7, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_coleta_y)));
  perform _t_err('cancelar viagem sem motivo', format('select admin_cancel_trip(%L, '''')', v_trip3), 'motivo');
  perform admin_cancel_trip(v_trip3, 'Teste');
  perform _t_check('viagem cancelada libera a rota',
    (select trip_id is null and status = 'aguardando' from routes where id = v_coleta_y));
  perform admin_cancel_route(v_coleta_y);
  perform _t_check('rota cancelada libera o pedido para outra rota',
    exists (select 1 from admin_collection_backlog() where order_id = y and open_route_id is null));

  -- 11. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
