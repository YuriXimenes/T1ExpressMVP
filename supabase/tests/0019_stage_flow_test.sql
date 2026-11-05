-- Teste da 0019_stage_flow.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0019a_stage_values.sql já aplicada.

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
  v_d uuid := gen_random_uuid();   -- entregador
  v_c uuid := gen_random_uuid();   -- cliente
  v_driver uuid;
  v_dest text; v_s1 text; v_s2 text;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  x uuid; y uuid; z uuid;
  v_coleta uuid; v_entrega uuid; v_entrega_z uuid;
  v_trip1 uuid; v_trip2 uuid; v_trip3 uuid;
  v_stop1 uuid; v_stop2 uuid;
  v_token text;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas e pedidos de teste (somem no fim) ------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_d, v_c]) u;
  insert into admins (user_id, role_id) values (v_a, c_admin);
  insert into team_members (name, kind, user_id) values ('Entregador Teste', 'entregador', v_d) returning id into v_driver;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;

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
  z := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s2), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s2, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Z', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  -- Pedido criado na mesma transação: o gatilho da linha do tempo trata mudanças
  -- no mesmo instante da criação como parte dela. "Envelhece" os pedidos.
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y, z);
  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform pay_order(y, 'pix');
  perform pay_order(z, 'pix');

  -- 2. Kanban: 6 etapas ---------------------------------------------------------------
  perform _t_as(v_a);
  perform admin_move_order(z, 'em-transporte-coleta');
  perform _t_as(null);
  perform _t_check('Kanban avança uma etapa sem motivo',
    (select delivery_stage = 'em-transporte-coleta' from orders where id = z));
  perform _t_as(v_a);
  perform _t_err('Kanban pula etapa sem motivo', format('select admin_move_order(%L, %L)', z, 'recebido-na-central'), 'motivo');
  perform admin_move_order(z, 'recebido-na-central', 'Chegou junto com outro lote');
  perform _t_as(null);
  perform _t_check('Kanban pula etapa com motivo',
    (select delivery_stage = 'recebido-na-central' from orders where id = z));

  -- 3. Coleta: iniciar a viagem leva para "Em transporte para coleta" ------------------
  perform _t_as(v_a);
  v_coleta := admin_create_route('coleta', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(x, y)),
    jsonb_build_object('storeCode', v_s2, 'orderIds', jsonb_build_array(x))));
  v_trip1 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_coleta)));
  perform admin_send_trip(v_trip1);
  perform _t_as(null);
  perform _t_check('viagem enviada ainda não muda a etapa',
    (select delivery_stage = 'aguardando-coleta' from orders where id = x));
  select id into v_stop1 from route_stops where route_id = v_coleta and position = 1;
  select id into v_stop2 from route_stops where route_id = v_coleta and position = 2;
  perform _t_as(v_d);
  perform driver_start_trip(v_trip1, 1000);
  perform _t_as(null);
  perform _t_check('viagem iniciada: pedidos em transporte para coleta',
    (select count(*) = 2 from orders where id in (x, y) and delivery_stage = 'em-transporte-coleta'));
  perform _t_check('linha do tempo: mudança feita pelo entregador',
    exists (select 1 from order_events where order_id = x and kind = 'stage_changed'
            and to_value = 'em-transporte-coleta' and actor_kind = 'driver'));

  -- 4. Coletou em todas as lojas: "A caminho da central" ---------------------------------
  perform _t_as(v_d);
  perform driver_record_stop(v_stop1, jsonb_build_object('reason', 'pedido_nao_pronto', 'orders', jsonb_build_array(
    jsonb_build_object('orderId', x, 'ok', true), jsonb_build_object('orderId', y, 'ok', false))));
  perform _t_as(null);
  perform _t_check('faltando loja, o pedido segue em transporte para coleta',
    (select delivery_stage = 'em-transporte-coleta' from orders where id = x));
  perform _t_as(v_a);
  perform _t_check('pedido não coletado volta ao planejamento de coletas',
    exists (select 1 from admin_collection_backlog() where order_id = y and open_route_id is null));
  perform _t_as(v_d);
  perform driver_record_stop(v_stop2, jsonb_build_object('orders', jsonb_build_array(
    jsonb_build_object('orderId', x, 'ok', true))));
  perform _t_as(null);
  perform _t_check('coletado em todas as lojas: a caminho da central',
    (select delivery_stage = 'em-transporte' from orders where id = x));
  perform _t_as(v_a);
  select count(*) into v_n from admin_trip_central_candidates(v_trip1);
  perform _t_check('candidatos à central: só o coletado',
    v_n = 1 and exists (select 1 from admin_trip_central_candidates(v_trip1) where order_id = x));

  -- 5. Finalizar: o que não saiu volta para "Aguardando coleta" -----------------------------
  perform _t_as(v_d);
  perform driver_finish_trip(v_trip1, 1030);
  perform _t_as(null);
  perform _t_check('não coletado volta para aguardando coleta',
    (select delivery_stage = 'aguardando-coleta' from orders where id = y));
  perform _t_check('a volta entra na linha do tempo com motivo',
    exists (select 1 from order_events where order_id = y and kind = 'stage_changed'
            and to_value = 'aguardando-coleta' and reason like 'Viagem finalizada%'));
  perform _t_check('coletado continua a caminho da central',
    (select delivery_stage = 'em-transporte' from orders where id = x));

  -- 6. Chegada na central ------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('entrega exige pedido recebido na central',
    format('select admin_create_route(''entrega'', %L, %L::jsonb)', v_day,
      jsonb_build_array(jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(x)))), 'não está pronto');
  perform _t_err('central só aceita pedido a caminho', format('select admin_mark_at_central(%L::uuid[])', array[y]),
    'não está a caminho');
  perform _t_as(v_c);
  perform _t_err('cliente não marca chegada', format('select admin_mark_at_central(%L::uuid[])', array[x]),
    'Acesso restrito');
  perform _t_as(v_a);
  perform _t_check('marcou 1 pedido', admin_mark_at_central(array[x], 'Lote da manhã') = 1);
  perform _t_as(null);
  perform _t_check('recebido na central, com custódia',
    (select delivery_stage = 'recebido-na-central' from orders where id = x)
    and exists (select 1 from custody_events where order_id = x and action = 'recebido_na_base'));
  perform _t_as(v_a);
  perform _t_check('planejamento de entregas mostra o pedido com conferência pendente',
    exists (select 1 from admin_delivery_backlog() where order_id = x and not checked and open_route_id is null));

  -- 7. Entrega: iniciar leva para "Em transporte para retirada"; QR deixa disponível ------
  v_entrega := admin_create_route('entrega', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(x))));
  v_trip2 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_entrega)));
  perform admin_send_trip(v_trip2);
  perform _t_as(null);
  select package_token into v_token from order_pickups where order_id = x;
  perform _t_as(v_d);
  perform _t_check('antes de iniciar, o QR não libera a entrega',
    not (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  perform driver_start_trip(v_trip2, 1100);
  perform _t_as(null);
  perform _t_check('viagem de entrega iniciada: em transporte para retirada',
    (select delivery_stage = 'em-transporte-retirada' from orders where id = x));
  perform _t_as(v_d);
  perform _t_check('QR libera a entrega para o entregador', (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  r := driver_deliver_by_token(v_token, '{"contactName": "Lojista"}'::jsonb);
  perform _t_as(null);
  perform _t_check('entregue: disponível para retirada',
    (select delivery_stage = 'disponivel-para-retirada' from orders where id = x));

  -- 8. Cancelar a viagem: entrega não feita volta para a central -----------------------------
  perform _t_as(v_a);
  v_entrega_z := admin_create_route('entrega', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(z))));
  v_trip3 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_entrega_z)));
  perform admin_send_trip(v_trip3);
  perform _t_as(v_d);
  perform driver_start_trip(v_trip3, 1200);
  perform _t_as(null);
  perform _t_check('z saiu para retirada', (select delivery_stage = 'em-transporte-retirada' from orders where id = z));
  perform _t_as(v_a);
  perform admin_cancel_trip(v_trip3, 'Moto quebrou');
  perform _t_as(null);
  perform _t_check('viagem cancelada: z volta para recebido na central',
    (select delivery_stage = 'recebido-na-central' from orders where id = z));
  perform _t_check('a volta registra o motivo do cancelamento',
    exists (select 1 from order_events where order_id = z and kind = 'stage_changed'
            and to_value = 'recebido-na-central' and reason like 'Viagem cancelada: Moto quebrou%'));

  -- 9. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
