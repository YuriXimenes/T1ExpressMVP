-- Teste da 0022a_finance_auto_expenses.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0022_finance.sql já aplicada.

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
  v_a uuid := gen_random_uuid();    -- Administrador
  v_d uuid := gen_random_uuid();    -- só vê despesas
  v_role uuid;
  v_driver uuid; v_staff uuid; v_user uuid := gen_random_uuid(); v_order uuid; v_refund uuid; v_claim uuid;
  v_dest text; v_s1 text;
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  r jsonb; o jsonb;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_d, v_user]) u;
  insert into staff_roles (name) values ('Só despesas') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'despesas', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_d, v_role);
  insert into team_members (name, kind) values ('Entregador Auto', 'entregador') returning id into v_driver;
  insert into team_pay_rules (member_id, kind, amount_brl) values (v_driver, 'fixo_mensal', 1000), (v_driver, 'por_parada', 5);
  insert into team_members (name, kind) values ('Funcionária Auto', 'funcionario') returning id into v_staff;
  insert into team_pay_rules (member_id, kind, amount_brl) values (v_staff, 'fixo_mensal', 2500);
  insert into trips (day, driver_id, status, finished_at, actual_driver_cost, actual_fuel_cost, actual_km)
  values (current_date, v_driver, 'concluida', now(), 40, 13.37, 22);

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  insert into store_pay_rules (store_id, kind, amount) select id, 'bonus_mensal', 10 from stores where code = v_dest;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  perform _t_as(v_user);
  v_order := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta Z', 'game', 'magic', 'price', 20, 'priceMode', 'unit', 'quantity', 1))))));
  perform _t_as(null);
  insert into customer_refunds (order_id, user_id, amount_brl) values (v_order, v_user, 25) returning id into v_refund;
  insert into claims (order_id, coverage_brl, approved_amount, status) values (v_order, 100, 60, 'aprovado') returning id into v_claim;

  perform _t_check('"Salários" desativada e combustível renomeado',
    (select not active from expense_categories where grp = 'pessoal' and name = 'Salários')
    and exists (select 1 from expense_categories where grp = 'operacao' and name = 'Combustível fora das viagens'));

  perform _t_as(v_a);
  r := admin_expenses_auto(v_month);
  perform _t_check('combustível das viagens concluídas aparece (com a viagem)',
    (r -> 'fuel' ->> 'total')::numeric >= 13.37 and jsonb_array_length(r -> 'fuel' -> 'trips') >= 1, (r -> 'fuel')::text);
  perform _t_check('equipe: fixo da funcionária e fixo + viagens do entregador',
    exists (select 1 from jsonb_array_elements(r -> 'team' -> 'people') e where (e ->> 'id')::uuid = v_staff
            and (e -> 'statement' ->> 'total')::numeric = 2500 and (e -> 'rules' -> 0 ->> 'kind') = 'fixo_mensal')
    and exists (select 1 from jsonb_array_elements(r -> 'team' -> 'people') e where (e ->> 'id')::uuid = v_driver
            and (e -> 'statement' ->> 'total')::numeric = 1040 and jsonb_array_length(e -> 'rules') = 2), (r -> 'team')::text);
  perform _t_check('Administrador vê o detalhe por pessoa', (r -> 'team' ->> 'detailed')::boolean);

  -- Os totais batem com a Visão geral (mesmas regras, mesmos números).
  o := admin_finance_overview(v_month);
  perform _t_check('combustível = Visão geral', (r -> 'fuel' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'fuel')::numeric);
  perform _t_check('equipe = Visão geral', (r -> 'team' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'team')::numeric);
  perform _t_check('lojas = Visão geral', (r -> 'stores' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'stores')::numeric);
  perform _t_check('sinistros e reembolsos = Visão geral',
    (r -> 'claims' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'claims')::numeric
    and (r -> 'refunds' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'refunds')::numeric);

  -- A pagar aos clientes aparece (não entra no total pago do mês); ao pagar, passa a contar.
  perform _t_check('reembolso a pagar e sinistro aprovado aparecem como pendentes',
    (r -> 'refunds' ->> 'pending')::numeric >= 25 and (r -> 'claims' ->> 'pending')::numeric >= 60
    and exists (select 1 from jsonb_array_elements(r -> 'refunds' -> 'items') e where (e ->> 'id')::uuid = v_refund and e ->> 'status' = 'a_pagar')
    and exists (select 1 from jsonb_array_elements(r -> 'claims' -> 'items') e where (e ->> 'id')::uuid = v_claim and e ->> 'status' = 'aprovado'),
    (r -> 'refunds')::text);
  perform _t_check('pendentes não entram no total pago (Visão geral continua igual)',
    (r -> 'refunds' ->> 'total')::numeric = (o -> 'month' -> 'costs' ->> 'refunds')::numeric);
  perform _t_check('lojas trazem o id e a remuneração do mês',
    exists (select 1 from jsonb_array_elements(r -> 'stores' -> 'items') e where e ->> 'code' = v_dest
            and (e ->> 'id') is not null and (e ->> 'total')::numeric >= 10), (r -> 'stores')::text);
  perform admin_pay_refund(v_refund, current_date);
  r := admin_expenses_auto(v_month);
  perform _t_check('reembolso pago passa a contar no total do mês',
    (r -> 'refunds' ->> 'total')::numeric >= 25
    and exists (select 1 from jsonb_array_elements(r -> 'refunds' -> 'items') e where (e ->> 'id')::uuid = v_refund and e ->> 'status' = 'pago'));

  perform _t_as(v_d);
  r := admin_expenses_auto(v_month);
  perform _t_check('quem só vê despesas recebe os totais sem o detalhe por pessoa',
    (r -> 'team' ->> 'total')::numeric >= 3540 and not (r -> 'team' ->> 'detailed')::boolean
    and jsonb_array_length(r -> 'team' -> 'people') = 0, (r -> 'team')::text);
  perform _t_as(null, true);
  perform _t_err('sem login não vê', format('select admin_expenses_auto(%L)', v_month), 'permission denied');

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
