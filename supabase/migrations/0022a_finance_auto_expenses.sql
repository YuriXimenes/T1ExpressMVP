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
