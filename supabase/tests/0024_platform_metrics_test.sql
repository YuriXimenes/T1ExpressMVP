-- Teste da 0024_platform_metrics.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0023 já aplicada.

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
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta 9', 'game', 'magic', 'price', 30,
        'priceMode', 'unit', 'quantity', 1))))));
end;
$$;

-- Simulação como o site manda.
create function public._t_sim(p_visitor text, p_origins text[], p_dest text, p_failed boolean default false,
                              p_savings numeric default 5)
returns uuid language sql as $$
  select log_simulation(jsonb_build_object('visitorId', p_visitor, 'originStoreCodes', to_jsonb(p_origins),
    'destinationStoreCode', p_dest, 'failed', p_failed,
    'quote', jsonb_build_object('estimatedDaysMin', 3, 'estimatedDaysMax', 3, 'cheapestSavingsBRL', p_savings,
      'competitors', jsonb_build_array(jsonb_build_object('carrier', 'uber', 'totalBRL', 30),
        jsonb_build_object('carrier', 'loggi', 'totalBRL', 25), jsonb_build_object('carrier', 'correios', 'totalBRL', 18)))));
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_v uuid := gen_random_uuid();    -- só vê Indicadores
  v_n uuid := gen_random_uuid();    -- admin sem Indicadores
  v_k uuid := gen_random_uuid();    -- só vê Comparador
  v_u uuid := gen_random_uuid();    -- cliente que pede
  v_u2 uuid := gen_random_uuid();   -- cliente que simula e não pede
  r_v uuid; r_n uuid; r_k uuid;
  va constant text := 'visitante-aaaa-0000000001';
  vb constant text := 'visitante-bbbb-0000000002';
  vc constant text := 'visitante-cccc-0000000003';
  vd constant text := 'visitante-dddd-0000000004';
  v_dest text; v_s1 text; v_s2 text; v_s1_id uuid; v_dest_id uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_stale uuid;
  s1 uuid; s1b uuid; s2 uuid; f1 uuid; s3 uuid; o1 uuid; o2 uuid;
  r jsonb; e jsonb;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_v, v_n, v_k, v_u, v_u2]) u;
  insert into staff_roles (name) values ('Só Indicadores') returning id into r_v;
  insert into staff_roles (name) values ('Sem Indicadores') returning id into r_n;
  insert into staff_roles (name) values ('Só Comparador') returning id into r_k;
  insert into staff_role_permissions (role_id, area, can_view) values
    (r_v, 'indicadores', true), (r_n, 'dashboard', true), (r_k, 'comparador', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_v, r_v), (v_n, r_n), (v_k, r_k);
  perform _t_check('área "indicadores" existe nas permissões', 'indicadores' = any (_staff_areas()));

  select code, id into v_dest, v_dest_id from stores where is_pickup_point order by code limit 1;
  select code, id into v_s1, v_s1_id from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;

  -- 1. Registro anônimo -----------------------------------------------------------------
  perform _t_as(null, true);
  s1 := _t_sim(va, array[v_s1], v_dest);
  s1b := _t_sim(va, array[v_s1], v_dest);
  s2 := _t_sim(va, array[v_s2, v_s1], v_dest);
  f1 := _t_sim(vb, array[v_s1], v_dest, true);
  perform _t_check('visitante registra simulação', s1 is not null);
  perform _t_check('recalcular a mesma rota em 2 min não conta duas vezes', s1b = s1);
  perform _t_check('rota diferente vira outra simulação', s2 is not null and s2 <> s1);
  perform _t_check('loja inválida: não grava e não dá erro', _t_sim(va, array['NAOEXISTE'], v_dest) is null);
  perform _t_check('código de navegador inválido: não grava', _t_sim('x', array[v_s1], v_dest) is null);
  perform _t_err('visitante não lê as simulações', 'select count(*) from freight_simulations', 'permission denied');
  perform _t_as(null);
  perform _t_check('simulação anônima, com o preço da T1 calculado no servidor',
    (select user_id is null and store_count = 1 and price_brl = (_pricing_at(now())).base_brl and uber_brl = 30
       and savings_brl = 5 and route_key = v_s1 || '>' || v_dest from freight_simulations where id = s1));
  perform _t_check('rota com 2 lojas guarda as duas, em ordem',
    (select store_count = 2 and route_key like '%+%>' || v_dest from freight_simulations where id = s2));
  perform _t_check('tentativa que falhou fica registrada sem preço',
    (select quote_failed and price_brl is null from freight_simulations where id = f1));

  -- 2. Etapas do funil ------------------------------------------------------------------------
  perform _t_as(null, true);
  perform mark_simulation(s1, vb, 'continued');
  perform _t_as(null);
  perform _t_check('outro navegador não marca etapa', (select continued_at is null from freight_simulations where id = s1));
  perform _t_as(null, true);
  perform mark_simulation(s1, va, 'continued');
  perform mark_simulation(s1, va, 'order_page');
  perform _t_as(null);
  perform _t_check('"continuou" marcado; "chegou ao pedido" exige login',
    (select continued_at is not null and order_page_at is null from freight_simulations where id = s1));
  perform _t_as(v_u);
  perform mark_simulation(s1, va, 'order_page');
  o1 := _t_order(array[v_s1], v_dest);
  perform mark_simulation(s1, va, 'order', o1);
  perform pay_order(o1, 'pix');
  perform _t_as(null);
  perform _t_check('logado: liga à conta e ao pedido', (select order_page_at is not null and user_id = v_u and order_id = o1
    from freight_simulations where id = s1));
  update orders set created_at = created_at - interval '2 days' where id = o1;

  perform _t_as(v_u2);
  o2 := _t_order(array[v_s1], v_dest);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = o2;
  perform _t_as(v_u);
  perform mark_simulation(s2, va, 'order', o2);
  perform _t_as(null);
  perform _t_check('não liga a simulação ao pedido de outro cliente', (select order_id is null from freight_simulations where id = s2));
  perform _t_as(v_u2);
  s3 := _t_sim(vc, array[v_s1], v_dest);
  perform _t_err('cliente não lê as simulações', 'select count(*) from freight_simulations', 'permission denied');

  -- 3. Indicadores ----------------------------------------------------------------------------
  perform _t_as(v_a);
  r := admin_metrics_funnel(v_today, v_today);
  perform _t_check('funil conta as etapas', (r ->> 'simulations')::int = 3 and (r ->> 'failed')::int = 1
    and (r ->> 'visitors')::int = 3 and (r ->> 'continued')::int = 1 and (r ->> 'orderPage')::int = 1
    and (r ->> 'ordersCreated')::int = 1 and (r ->> 'paid')::int = 1 and (r ->> 'loggedIn')::int = 2, r::text);
  perform _t_check('funil traz a série por dia', jsonb_array_length(r -> 'daily') >= 1
    and exists (select 1 from jsonb_array_elements(r -> 'daily') d where (d ->> 'day')::date = v_today
                and (d ->> 'simulations')::int = 3));
  perform _t_check('período sem dados: tudo zero', (admin_metrics_funnel(v_today - 400, v_today - 399) ->> 'simulations')::int = 0);

  r := admin_metrics_demand(v_today, v_today);
  e := (select x from jsonb_array_elements(r -> 'routes') x where x ->> 'key' = v_s1 || '>' || v_dest);
  perform _t_check('demanda: rota com simulações, falha e pedido', (e ->> 'simulations')::int = 3
    and (e ->> 'failed')::int = 1 and (e ->> 'orders')::int = 1 and (e ->> 'paid')::int = 1 and (e ->> 'visitors')::int = 3, e::text);
  perform _t_check('demanda: loja de coleta e ponto mais buscados',
    exists (select 1 from jsonb_array_elements(r -> 'origins') x where x ->> 'code' = v_s1 and (x ->> 'simulations')::int = 4)
    and exists (select 1 from jsonb_array_elements(r -> 'destinations') x where x ->> 'code' = v_dest and (x ->> 'simulations')::int = 4));

  r := admin_metrics_pricing(v_today, v_today);
  perform _t_check('preço: economia média e conversão por faixa', (r ->> 'avgSavings')::numeric = 5
    and (r ->> 'cheapest')::int = 3
    and exists (select 1 from jsonb_array_elements(r -> 'bySavings') x where x ->> 'bucket' = '5_a_15' and (x ->> 'paid')::int = 1)
    and exists (select 1 from jsonb_array_elements(r -> 'bySavings') x where x ->> 'bucket' = 'falhou' and (x ->> 'simulations')::int = 1)
    and exists (select 1 from jsonb_array_elements(r -> 'byStoreCount') x where (x ->> 'stores')::int = 2 and (x ->> 'simulations')::int = 1), r::text);

  r := admin_metrics_customers(v_today, v_today);
  perform _t_check('clientes: cadastros e quem pagou', (r ->> 'signups')::int >= 6 and (r ->> 'buyers')::int >= 1
    and (r ->> 'firstTimeBuyers')::int >= 1, r::text);

  r := admin_metrics_abandoned(v_today, v_today);
  perform _t_check('abandonadas: cliente logado que simulou e não pediu',
    exists (select 1 from jsonb_array_elements(r) x where (x ->> 'userId')::uuid = v_u2 and x ->> 'routeKey' = v_s1 || '>' || v_dest), r::text);
  perform _t_check('abandonadas: quem pediu não aparece e anônimo também não',
    not exists (select 1 from jsonb_array_elements(r) x where (x ->> 'userId')::uuid = v_u or x ->> 'userId' is null));

  perform _t_as(null);
  insert into store_suggestions (store_name, store_address) values ('Loja Nove Teste', 'Rua A, 1'), (' loja nove teste', 'Rua B, 2');
  insert into custom_preferred_stores (profile_id, name, address) values (v_u, 'LOJA NOVE TESTE', 'Rua A, 1');
  perform _t_as(v_a);
  e := (select x from jsonb_array_elements(admin_metrics_store_requests()) x where lower(x ->> 'name') = 'loja nove teste');
  perform _t_check('lojas pedidas: agrupa sugestões e indicações pelo nome', (e ->> 'total')::int = 3
    and (e ->> 'suggestions')::int = 2 and (e ->> 'customers')::int = 1, e::text);

  -- Saúde do comparador: sem rota (falha), sem Uber e desatualizado.
  perform _t_as(null);
  delete from freight_routes where origin_store_id = v_s1_id and destination_store_id = v_dest_id;
  update freight_routes set uber_brl = null
    where id = (select id from freight_routes where destination_store_id = v_dest_id order by id limit 1);
  select id into v_stale from freight_routes where destination_store_id = v_dest_id and uber_brl is not null order by id limit 1;
  update freight_routes set updated_at = now() - interval '200 days' where id = v_stale;
  perform _t_as(v_a);
  r := admin_metrics_comparator(90);
  perform _t_check('comparador: par sem rota aparece primeiro, com a demanda',
    r -> 'items' -> 0 ->> 'issue' = 'sem_rota'
    and exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'originCode' = v_s1 and x ->> 'destCode' = v_dest
                and x ->> 'issue' = 'sem_rota' and (x ->> 'simulations')::int >= 3), (r - 'items')::text);
  perform _t_check('comparador: conta sem Uber e desatualizado', (r ->> 'missingUber')::int >= 1 and (r ->> 'stale')::int >= 1, (r - 'items')::text);
  perform _t_as(null);
  update freight_routes set loggi_brl = loggi_brl + 1 where id = v_stale;
  perform _t_check('mudar o preço atualiza a data', (select updated_at = now() from freight_routes where id = v_stale));

  -- 4. Permissões -------------------------------------------------------------------------------
  perform _t_as(v_v);
  perform _t_check('quem vê Indicadores lê o resumo', (admin_metrics_summary(v_today, v_today) ->> 'simulations')::int = 3);
  perform _t_as(v_k);
  perform _t_check('quem vê o Comparador lê a saúde do comparador', (admin_metrics_comparator(90) ->> 'pairs')::int >= 1);
  perform _t_err('quem vê o Comparador não lê o funil', format('select admin_metrics_funnel(%L, %L)', v_today, v_today), 'não permite');
  perform _t_as(v_n);
  perform _t_err('admin sem Indicadores não lê', format('select admin_metrics_demand(%L, %L)', v_today, v_today), 'não permite');
  perform _t_as(v_u);
  perform _t_err('cliente não lê indicadores', format('select admin_metrics_abandoned(%L, %L)', v_today, v_today), 'restrito');

  -- 5. Limite por navegador (60 por hora) ---------------------------------------------------------
  perform _t_as(null);
  insert into freight_simulations (visitor_id, origin_store_ids, destination_store_id, store_count, route_key, created_at)
  select vd, array[v_s1_id], v_dest_id, 1, 'x' || g, now() - interval '10 minutes' from generate_series(1, 60) g;
  perform _t_as(null, true);
  perform _t_check('limite de 60 por hora: não grava mais', _t_sim(vd, array[v_s2], v_dest) is null);

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
