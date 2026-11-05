-- TESTE da 0022a para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. A 0022 precisa estar aplicada.
-- Gerado de migrations/0022a_finance_auto_expenses.sql + tests/0022a_finance_auto_test.sql.

begin;

-- Ajuste da 0022: a tela de Despesas passa a ser o lugar único para ver e pagar. Ela
-- mostra o que a plataforma já sabe sozinha (combustível das viagens, pagamento da
-- equipe pelo formato definido na Equipe, repasses a lojas, sinistros e reembolsos),
-- com os mesmos totais da Visão geral, e também o que está a pagar aos clientes.
-- Precisa da 0022. Ver rollback/0022a_down.sql.
-- Pode ser aplicada de novo sem efeito colateral.

-- "Salários" agora vem sozinho da Equipe e "Combustível avulso" é só o abastecimento
-- que NÃO está no cálculo das viagens: evita contar duas vezes.
update expense_categories set active = false where grp = 'pessoal' and name = 'Salários';
update expense_categories set name = 'Combustível fora das viagens'
  where grp = 'operacao' and name = 'Combustível avulso'
    and not exists (select 1 from expense_categories where grp = 'operacao' and name = 'Combustível fora das viagens');

-- Custos do mês que não precisam de lançamento. Os totais batem com _finance_month
-- (Visão geral). Valores por pessoa da Equipe só para quem vê Repasses ou Pessoas.
create or replace function public.admin_expenses_auto(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_next date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_start timestamptz := _month_start(v_month);
  v_end timestamptz := _month_start(v_next);
  v_detail boolean := has_any_perm(array['repasses', 'pessoas'], 'ver');
  v_team_total numeric;
  v_team jsonb := '[]'::jsonb;
begin
  perform _require_perm('despesas', 'ver');
  select coalesce(sum((_team_statement(id, v_month) ->> 'total')::numeric), 0) into v_team_total from team_members;
  if v_detail then
    select coalesce(jsonb_agg(x.j order by x.k, x.name), '[]'::jsonb) into v_team from (
      select tm.kind as k, tm.name, jsonb_build_object(
        'id', tm.id, 'name', tm.name, 'kind', tm.kind, 'status', tm.status,
        'rules', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', r.kind,
          'amountBRL', r.amount_brl, 'note', r.note)) order by r.sort_order, r.kind)
          from team_pay_rules r where r.member_id = tm.id), '[]'::jsonb),
        'statement', _team_statement(tm.id, v_month)) as j
      from team_members tm
      where tm.status = 'ativo' or (_team_statement(tm.id, v_month) ->> 'total')::numeric <> 0
    ) x;
  end if;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'fuel', jsonb_build_object(
      'total', round(coalesce((select sum(actual_fuel_cost) from trips
        where status = 'concluida' and finished_at >= v_start and finished_at < v_end), 0), 2),
      'trips', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', t.id, 'day', t.day,
          'driverName', tm.name, 'vehicleName', vh.name, 'km', t.actual_km, 'cost', t.actual_fuel_cost))
          order by t.finished_at desc)
        from trips t join team_members tm on tm.id = t.driver_id left join vehicles vh on vh.id = t.vehicle_id
        where t.status = 'concluida' and t.finished_at >= v_start and t.finished_at < v_end), '[]'::jsonb)),
    'team', jsonb_build_object('total', round(v_team_total, 2), 'detailed', v_detail, 'people', v_team),
    'stores', jsonb_build_object(
      'total', round(coalesce((select sum((_store_statement(s.id, v_month) ->> 'total')::numeric) from stores s
        where s.is_pickup_point and exists (select 1 from store_pay_rules r where r.store_id = s.id)), 0), 2),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
          'total', (_store_statement(s.id, v_month) ->> 'total')::numeric,
          'paid', exists (select 1 from store_payouts sp where sp.store_id = s.id and sp.month = v_month),
          'payout', _store_statement(s.id, v_month) -> 'payout')
          order by s.name)
        from stores s where s.is_pickup_point and exists (select 1 from store_pay_rules r where r.store_id = s.id)),
        '[]'::jsonb)),
    -- total = pago no mês (igual à Visão geral); pending = aprovado ou a pagar, de qualquer mês.
    'claims', jsonb_build_object(
      'total', round(coalesce((select sum(approved_amount) from claims
        where status = 'pago' and paid_at >= v_month and paid_at < v_next), 0), 2),
      'pending', round(coalesce((select sum(approved_amount) from claims where status = 'aprovado'), 0), 2),
      'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', c.id, 'number', c.number,
          'orderId', c.order_id, 'amount', c.approved_amount, 'status', c.status, 'paidAt', c.paid_at,
          'receiptPath', c.receipt_path, 'customerName', p.name))
          order by (c.status = 'aprovado') desc, c.paid_at desc nulls first)
        from claims c join orders o on o.id = c.order_id left join profiles p on p.id = o.user_id
        where c.status = 'aprovado' or (c.status = 'pago' and c.paid_at >= v_month and c.paid_at < v_next)),
        '[]'::jsonb)),
    'refunds', jsonb_build_object(
      'total', round(coalesce((select sum(amount_brl) from customer_refunds
        where status = 'pago' and paid_at >= v_month and paid_at < v_next), 0), 2),
      'pending', round(coalesce((select sum(amount_brl) from customer_refunds where status = 'a_pagar'), 0), 2),
      'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'orderId', r.order_id,
          'occurrenceId', r.occurrence_id, 'amount', r.amount_brl, 'status', r.status, 'paidAt', r.paid_at,
          'receiptPath', r.receipt_path, 'customerName', p.name))
          order by (r.status = 'a_pagar') desc, r.paid_at desc nulls first)
        from customer_refunds r left join profiles p on p.id = r.user_id
        where r.status = 'a_pagar' or (r.status = 'pago' and r.paid_at >= v_month and r.paid_at < v_next)),
        '[]'::jsonb))
  );
end;
$$;

revoke all on function admin_expenses_auto(date) from public, anon, authenticated;
grant execute on function admin_expenses_auto(date) to authenticated;

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
