-- Teste da 0022_finance.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).

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
  v_l uuid := gen_random_uuid();    -- só lança despesas (criar)
  v_ap uuid := gen_random_uuid();   -- aprova despesas (criar + editar)
  v_c uuid := gen_random_uuid();    -- cliente
  v_role_l uuid; v_role_ap uuid;
  v_driver uuid; v_trip uuid;
  v_cat uuid; v_exp uuid; v_exp2 uuid;
  v_dest text; v_s1 text;
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  x uuid; y uuid;
  v_occ uuid; v_refund uuid; v_claim uuid; v_item uuid;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas, perfis e pedido de teste (somem no fim) -----------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_l, v_ap, v_c]) u;
  insert into staff_roles (name) values ('Lança despesas') returning id into v_role_l;
  insert into staff_role_permissions (role_id, area, can_view, can_create) values (v_role_l, 'despesas', true, true);
  insert into staff_roles (name) values ('Aprova despesas') returning id into v_role_ap;
  insert into staff_role_permissions (role_id, area, can_view, can_create, can_edit) values (v_role_ap, 'despesas', true, true, true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_l, v_role_l), (v_ap, v_role_ap);
  insert into team_members (name, kind) values ('Entregador Financeiro', 'entregador') returning id into v_driver;
  insert into team_pay_rules (member_id, kind, amount_brl) values (v_driver, 'fixo_mensal', 1500), (v_driver, 'por_parada', 5);
  insert into trips (day, driver_id, status, finished_at, actual_driver_cost, actual_fuel_cost)
  values (current_date, v_driver, 'concluida', now(), 80, 20) returning id into v_trip;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta X', 'game', 'magic', 'price', 40, 'priceMode', 'unit', 'quantity', 2))))));
  y := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta Y', 'game', 'magic', 'price', 5, 'priceMode', 'unit', 'quantity', 1))))));
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y);
  perform _t_as(v_c);
  perform pay_order(x, 'pix');

  -- 2. Despesas: lançar, aprovar (outra pessoa), pagar ------------------------------------
  perform _t_as(null);
  select id into v_cat from expense_categories where name = 'Embalagem e etiquetas';
  perform _t_check('categorias iniciais nos 4 grupos', (select count(distinct grp) = 4 from expense_categories));
  perform _t_as(v_l);
  v_exp := admin_save_expense(null, jsonb_build_object('categoryId', v_cat, 'description', 'Caixas de papelão',
    'amount', 120.5, 'competence', v_month));
  perform _t_as(null);
  perform _t_check('despesa nasce pendente', (select status = 'pendente' and amount_brl = 120.50 from expenses where id = v_exp));
  perform _t_as(v_l);
  perform _t_err('quem só lança não aprova', format('select admin_review_expense(%L, true)', v_exp), 'não permite');
  perform _t_err('despesa sem valor', format('select admin_save_expense(null, %L::jsonb)',
    jsonb_build_object('categoryId', v_cat, 'description', 'X teste', 'amount', 0, 'competence', v_month)), 'valor');
  perform _t_as(v_ap);
  v_exp2 := admin_save_expense(null, jsonb_build_object('categoryId', v_cat, 'description', 'Fita adesiva',
    'amount', 30, 'competence', v_month));
  perform _t_err('quem lançou não aprova a própria', format('select admin_review_expense(%L, true)', v_exp2), 'Outra pessoa');
  perform _t_err('recusa sem motivo', format('select admin_review_expense(%L, false)', v_exp), 'motivo');
  perform _t_err('pagar antes de aprovar', format('select admin_pay_expense(%L, current_date)', v_exp), 'aprovadas');
  perform admin_review_expense(v_exp, true);
  perform admin_pay_expense(v_exp, current_date);
  perform _t_as(null);
  perform _t_check('aprovada por outra pessoa e paga',
    (select status = 'paga' and reviewed_by = v_ap and paid_at = current_date from expenses where id = v_exp));
  perform _t_as(v_l);
  perform _t_err('paga não é editada', format('select admin_save_expense(%L, %L::jsonb)', v_exp,
    jsonb_build_object('categoryId', v_cat, 'description', 'Mudou', 'amount', 1, 'competence', v_month)), 'não pode ser editada');
  perform _t_as(v_a);
  perform admin_review_expense(v_exp2, true);
  perform _t_check('Administrador aprova a própria? (lançada por outro: ok)', (select status = 'aprovada' from expenses where id = v_exp2));

  -- 3. Repasse da equipe: viagens + fixo + avulsos ------------------------------------------
  perform _t_as(null);
  r := _team_statement(v_driver, v_month);
  perform _t_check('repasse = viagens 80 + fixo 1500 (regras por viagem não somam de novo)',
    (r ->> 'tripCost')::numeric = 80 and (r ->> 'fixed')::numeric = 1500 and (r ->> 'total')::numeric = 1580, r::text);
  perform _t_as(v_a);
  perform admin_add_team_adjustment(v_driver, v_month, 50, 'Diária extra');
  perform _t_as(null);
  perform _t_check('avulso entra no total',
    ((_team_statement(v_driver, v_month)) ->> 'total')::numeric = 1630);
  perform _t_as(v_a);
  r := admin_payouts_month(v_month);
  perform _t_check('mês de repasses lista a pessoa com o valor',
    exists (select 1 from jsonb_array_elements(r -> 'team') e where (e ->> 'id')::uuid = v_driver
            and (e -> 'statement' ->> 'total')::numeric = 1630), (r -> 'team')::text);
  perform _t_as(null);
  perform _t_check('vencimento no 5º dia útil do mês seguinte',
    (r ->> 'dueDate')::date = _nth_business_day((v_month + interval '1 month')::date, 5));
  perform _t_as(v_a);
  perform admin_register_team_payout(v_driver, v_month, 1630, current_date, null, 'Pix');
  perform _t_err('avulso em mês já pago', format('select admin_add_team_adjustment(%L, %L, 10, %L)', v_driver, v_month, 'Bônus'),
    'já foi pago');
  perform _t_as(null);
  perform _t_check('pagamento registrado', ((_team_statement(v_driver, v_month)) -> 'payout' ->> 'amount')::numeric = 1630);
  perform _t_as(v_a);

  -- 4. Reembolso a partir da ocorrência ---------------------------------------------------
  r := admin_open_occurrence(jsonb_build_object('typeId', (select id from occurrence_types where name = 'Carta faltando'),
    'orderId', x, 'description', 'Faltou uma carta X'));
  v_occ := (r ->> 'id')::uuid;
  perform admin_add_resolution(v_occ, '{"kind": "reembolso", "amountBrl": 30}');
  perform _t_as(null);
  select id into v_refund from customer_refunds where occurrence_id = v_occ;
  perform _t_check('resolução "reembolso" cria o item a pagar', v_refund is not null
    and (select status = 'a_pagar' and amount_brl = 30 and user_id = v_c from customer_refunds where id = v_refund));
  perform _t_as(v_a);
  perform _t_check('reembolso aparece em Clientes',
    exists (select 1 from jsonb_array_elements(admin_payouts_month(v_month) -> 'customers') e where (e ->> 'id')::uuid = v_refund));
  perform admin_pay_refund(v_refund, current_date);
  perform _t_as(v_c);
  r := (select e from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ);
  perform _t_check('cliente vê o reembolso pago', r -> 'refunds' -> 0 ->> 'status' = 'pago', r::text);

  -- 5. Sinistro a partir da ocorrência ------------------------------------------------------
  perform _t_as(v_a);
  perform admin_add_resolution(v_occ, '{"kind": "sinistro", "amountBrl": 500}');
  perform _t_as(null);
  select id into v_claim from claims where occurrence_id = v_occ;
  perform _t_check('resolução "sinistro" cria o sinistro; sugestão limitada à cobertura',
    (select status = 'aberto' and declared_amount = 500 and suggested_amount = coverage_brl and coverage_brl = 100
     from claims where id = v_claim));
  select ci.id into v_item from pedido_groups g join pedido_card_items ci on ci.group_id = g.id where g.order_id = x;
  perform _t_as(v_a);
  perform admin_set_claim_items(v_claim, jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'qty', 1)));
  perform _t_as(null);
  perform _t_check('itens afetados: declarado 1 × R$ 40 e sugestão = menor valor',
    (select declared_amount = 40 and suggested_amount = 40 from claims where id = v_claim));
  perform _t_as(v_a);
  perform _t_err('item de outro pedido', format('select admin_set_claim_items(%L, %L::jsonb)', v_claim,
    jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId',
      (select ci.id from pedido_groups g join pedido_card_items ci on ci.group_id = g.id where g.order_id = y), 'qty', 1))),
    'não é deste pedido');
  perform _t_err('quantidade maior que a do pedido', format('select admin_set_claim_items(%L, %L::jsonb)', v_claim,
    jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'qty', 3))), 'inválido');
  perform _t_err('aprovar sem valor', format('select admin_set_claim_status(%L, %L)', v_claim, 'aprovado'), 'valor');
  perform admin_set_claim_status(v_claim, 'aprovado', 40);
  perform _t_check('aprovado aparece em Clientes',
    exists (select 1 from jsonb_array_elements(admin_payouts_month(v_month) -> 'customers') e where (e ->> 'id')::uuid = v_claim));
  perform admin_pay_claim(v_claim, current_date);
  perform _t_err('sinistro pago não muda', format('select admin_set_claim_status(%L, %L, null, %L)', v_claim, 'negado', 'teste'),
    'encerrado');
  perform _t_as(v_c);
  r := (select e from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ);
  perform _t_check('cliente vê o sinistro pago com o valor',
    r -> 'claims' -> 0 ->> 'status' = 'pago' and (r -> 'claims' -> 0 ->> 'approvedAmount')::numeric = 40, r::text);
  perform _t_as(v_a);
  perform _t_check('abrir sinistro direto pelo pedido', admin_open_claim(y, 'Pacote molhado na chuva') is not null);
  r := admin_claim(v_claim);
  perform _t_check('detalhe do sinistro traz os itens do pedido e o histórico',
    jsonb_array_length(r -> 'orderItems') = 1 and jsonb_array_length(r -> 'events') >= 4, r::text);

  -- 6. Painel -----------------------------------------------------------------------------
  r := admin_finance_overview(v_month);
  perform _t_check('painel: receita inclui o frete do pedido pago no mês',
    (r -> 'month' -> 'revenue' ->> 'freight')::numeric >= (select freight_after_discount_brl from orders where id = x), r::text);
  perform _t_check('painel: custos com combustível, equipe, despesas, sinistro e reembolso',
    (r -> 'month' -> 'costs' ->> 'fuel')::numeric >= 20 and (r -> 'month' -> 'costs' ->> 'team')::numeric >= 1630
    and (r -> 'month' -> 'costs' -> 'expenses' ->> 'operacao')::numeric >= 150.5
    and (r -> 'month' -> 'costs' ->> 'claims')::numeric >= 40 and (r -> 'month' -> 'costs' ->> 'refunds')::numeric >= 30);
  perform _t_check('painel: margem = receita − custos e 6 meses de histórico',
    (r -> 'month' ->> 'margin')::numeric = (r -> 'month' -> 'revenue' ->> 'total')::numeric - (r -> 'month' -> 'costs' ->> 'total')::numeric
    and jsonb_array_length(r -> 'history') = 6);
  perform _t_as(v_c);
  perform _t_err('cliente não vê o financeiro', 'select admin_expenses(current_date - 30, current_date)', 'Acesso restrito');
  perform _t_as(v_l);
  perform _t_err('perfil só de despesas não vê repasses', format('select admin_payouts_month(%L)', v_month), 'não permite');

  -- 7. Resultado: o erro abaixo é de propósito e desfaz TUDO ---------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
