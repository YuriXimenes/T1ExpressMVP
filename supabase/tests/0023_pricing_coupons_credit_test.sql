-- Teste da 0023_pricing_coupons_credit.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0022 já aplicada.

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

-- Pedido de teste com 1 ou 2 lojas de coleta (chamado já como o cliente).
create function public._t_order(p_origins text[], p_dest text, p_coupon text default null, p_credit boolean default false)
returns uuid language plpgsql as $$
begin
  return create_order(jsonb_build_object(
    'originStoreCodes', to_jsonb(p_origins), 'destinationStoreCode', p_dest,
    'couponCode', p_coupon, 'useCredit', p_credit,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', p_origins[1], 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta 8B', 'game', 'magic', 'price', 30,
        'priceMode', 'unit', 'quantity', 1))))));
end;
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_v uuid := gen_random_uuid();    -- só vê preços e cupons
  v_u uuid := gen_random_uuid();    -- cliente 1
  v_u2 uuid := gen_random_uuid();   -- cliente 2
  v_role uuid;
  v_dest text; v_s1 text; v_s2 text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_sched uuid; v_cur uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; v_occ uuid; v_oc_code text;
  r jsonb;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_v, v_u, v_u2]) u;
  insert into staff_roles (name) values ('Só vê preços e cupons') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'precos', true), (v_role, 'cupons', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_v, v_role);
  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;

  -- 1. Preços versionados ------------------------------------------------------------
  perform _t_as(null);
  perform _t_check('a tabela de preços antiga virou a 1ª versão', (select count(*) >= 1 from pricing_versions));
  perform _t_check('pricing_settings (site publicado) mostra o preço em vigor',
    (select s.base_brl = (_pricing_at(now())).base_brl and s.id = 1 from pricing_settings s));
  perform _t_as(null, true);
  perform _t_check('visitante lê o preço em vigor', (select count(*) = 1 from pricing_current));
  perform _t_check('visitante não lê o histórico nem agendamentos', (select count(*) = 0 from pricing_versions));

  perform _t_as(v_a);
  v_cur := admin_save_pricing('{"baseBRL": 20, "extraStoreBRL": 4, "addedStoreBRL": 5, "insurancePer100BRL": 2, "note": "Teste 8B"}');
  v_sched := admin_save_pricing(jsonb_build_object('baseBRL', 99, 'extraStoreBRL', 9, 'addedStoreBRL', 9,
    'insurancePer100BRL', 9, 'effectiveFrom', (now() + interval '1 day')::text));
  perform _t_check('preço novo vale agora; o agendado ainda não',
    (select base_brl = 20 and extra_store_brl = 4 from pricing_current));
  perform _t_check('histórico mostra as versões para quem vê Preços', (select count(*) >= 3 from pricing_versions));
  perform _t_err('não agenda no passado',
    format('select admin_save_pricing(%L)', jsonb_build_object('baseBRL', 1, 'extraStoreBRL', 1, 'addedStoreBRL', 1,
      'insurancePer100BRL', 1, 'effectiveFrom', (now() - interval '1 day')::text)), 'passado');
  perform _t_err('não apaga o preço que já está valendo', format('select admin_delete_pricing_version(%L)', v_cur), 'agendado');
  perform admin_delete_pricing_version(v_sched);
  perform _t_as(null);
  perform _t_check('preço agendado cancelado', not exists (select 1 from pricing_versions where id = v_sched));

  perform _t_as(v_v);
  perform _t_err('quem só vê Preços não salva', 'select admin_save_pricing(''{"baseBRL": 1, "extraStoreBRL": 1, "addedStoreBRL": 1, "insurancePer100BRL": 1}'')', 'não permite');
  perform _t_as(v_u);
  perform _t_err('cliente não salva preço', 'select admin_save_pricing(''{"baseBRL": 1, "extraStoreBRL": 1, "addedStoreBRL": 1, "insurancePer100BRL": 1}'')', 'restrito');

  -- O pedido cobra o preço em vigor (20 + 4 por loja a mais).
  o1 := _t_order(array[v_s1, v_s2], v_dest);
  perform pay_order(o1, 'pix');
  perform _t_as(null);
  perform _t_check('pedido cobra o preço em vigor (2 lojas = R$ 24)',
    (select quote_price_brl = 24 and amount_due_brl = 24 from orders where id = o1));  update orders set created_at = created_at - interval '2 days' where id = o1;

  -- Site antigo (admin_update_pricing) também cria versão.
  perform _t_as(v_a);
  perform admin_update_pricing('{"baseBRL": 30, "extraStoreBRL": 4, "addedStoreBRL": 5, "insurancePer100BRL": 2}');
  perform _t_check('salvar pela tela antiga vira nova versão', (select base_brl = 30 from pricing_current));
  perform admin_save_pricing('{"baseBRL": 20, "extraStoreBRL": 4, "addedStoreBRL": 5, "insurancePer100BRL": 2}');

  -- 2. Cupons --------------------------------------------------------------------------
  perform admin_upsert_coupon('T8BDEZ', jsonb_build_object('type', 'percent', 'value', 10, 'label', '10% teste',
    'active', true, 'maxUsesPerUser', 1, 'minOrderBRL', 15, 'note', 'interno'));
  perform admin_upsert_coupon('T8BMIN', jsonb_build_object('type', 'flat', 'value', 5, 'label', 'mínimo', 'active', true, 'minOrderBRL', 50));
  perform admin_upsert_coupon('T8BVENC', jsonb_build_object('type', 'flat', 'value', 5, 'label', 'vencido', 'active', true,
    'validUntil', v_today - 1));
  perform admin_upsert_coupon('T8BFUT', jsonb_build_object('type', 'flat', 'value', 5, 'label', 'futuro', 'active', true,
    'validFrom', v_today + 3));
  perform admin_upsert_coupon('T8BOFF', jsonb_build_object('type', 'flat', 'value', 5, 'label', 'inativo', 'active', false));
  perform admin_upsert_coupon('T8BUM', jsonb_build_object('type', 'flat', 'value', 3, 'label', 'um só', 'active', true, 'maxUses', 1));
  perform admin_upsert_coupon('T8BPRI', jsonb_build_object('type', 'flat', 'value', 4, 'label', 'primeira', 'active', true,
    'firstPurchaseOnly', true));
  perform _t_err('validade invertida é recusada', format('select admin_upsert_coupon(%L, %L)', 'T8BX',
    jsonb_build_object('type', 'flat', 'value', 1, 'label', 'x', 'validFrom', v_today, 'validUntil', v_today - 1)), 'termina antes');

  perform _t_as(v_u);
  r := check_coupon('t8bdez', 1);
  perform _t_check('check_coupon calcula o desconto no preço em vigor (10% de 20)', (r ->> 'discountBRL')::numeric = 2, r::text);
  perform _t_err('pedido mínimo', 'select check_coupon(''T8BMIN'', 1)', 'Pedido mínimo de R$ 50,00');
  perform _t_err('vencido', 'select check_coupon(''T8BVENC'', 1)', 'vencido');
  perform _t_err('ainda não vale', 'select check_coupon(''T8BFUT'', 1)', 'vale a partir');
  perform _t_err('inativo', 'select check_coupon(''T8BOFF'', 1)', 'não está mais ativo');
  perform _t_err('inexistente', 'select check_coupon(''NAOEXISTE'', 1)', 'Cupom inválido');
  perform _t_err('primeira compra (cliente já tem pedido)', 'select check_coupon(''T8BPRI'', 1)', 'primeira compra');
  perform _t_err('create_order recusa com a mesma mensagem',
    format('select _t_order(%L, %L, %L)', array[v_s1], v_dest, 'T8BMIN'), 'Pedido mínimo');

  o2 := _t_order(array[v_s1], v_dest, 'T8BDEZ');
  perform _t_as(null);
  perform _t_check('pedido grava o desconto do cupom', (select coupon_code = 'T8BDEZ' and coupon_discount_brl = 2
    and amount_due_brl = 18 from orders where id = o2));
  update orders set created_at = created_at - interval '2 days' where id = o2;
  perform _t_as(v_u);
  perform _t_err('limite por cliente: avisa do pedido aguardando pagamento', 'select check_coupon(''T8BDEZ'', 1)', 'aguarda pagamento');
  perform pay_order(o2, 'pix');
  perform _t_err('limite por cliente: já usou', 'select check_coupon(''T8BDEZ'', 1)', 'Você já usou este cupom.');
  perform _t_as(v_a);
  perform admin_cancel_order(o2, 'teste 8B');
  perform _t_as(v_u);
  perform _t_check('pedido cancelado libera o uso do cupom', (check_coupon('T8BDEZ', 1) ->> 'code') = 'T8BDEZ');

  o3 := _t_order(array[v_s1], v_dest, 'T8BUM');
  perform _t_as(v_u2);
  perform _t_err('limite total: esgotou', 'select check_coupon(''T8BUM'', 1)', 'esgotou');
  perform _t_check('primeira compra vale para quem não tem pedido', (check_coupon('T8BPRI', 1) ->> 'discountBRL')::numeric = 4);

  perform _t_as(null, true);
  perform _t_err('visitante não lê regras nem observação dos cupons', 'select note from coupons', 'permission denied');
  perform _t_check('visitante ainda lê os campos de antes', (select count(*) >= 1 from coupons where code = 'T8BDEZ'));

  perform _t_as(v_a);
  perform admin_upsert_coupon('T8BDEZ', '{"type": "percent", "value": 15, "label": "15% teste", "active": true}');
  r := (select e from jsonb_array_elements(admin_coupons()) e where e ->> 'code' = 'T8BDEZ');
  perform _t_check('editar pela tela antiga não apaga as regras', (r ->> 'maxUsesPerUser')::int = 1
    and (r ->> 'minOrderBRL')::numeric = 15 and r ->> 'note' = 'interno' and (r ->> 'value')::numeric = 15, r::text);
  perform _t_check('admin_coupons mostra os usos (cancelado não conta)', (r ->> 'uses')::int = 0, r::text);
  r := (select e from jsonb_array_elements(admin_coupons()) e where e ->> 'code' = 'T8BUM');
  perform _t_check('admin_coupons conta o uso pendente', (r ->> 'uses')::int = 1 and (r ->> 'paidUses')::int = 0, r::text);
  perform _t_check('admin_coupon_orders lista o pedido', jsonb_array_length(admin_coupon_orders('t8bum')) = 1);
  perform _t_as(v_v);
  perform _t_check('quem vê Cupons lê a lista', jsonb_array_length(admin_coupons()) >= 7);
  perform _t_err('quem só vê Cupons não edita', format('select admin_upsert_coupon(%L, %L)', 'T8BUM',
    '{"type": "flat", "value": 1, "label": "x", "active": true}'::jsonb), 'não permite');

  -- 3. Ocorrência: cupom só do cliente e crédito no saldo ---------------------------------
  perform _t_as(v_a);
  r := admin_open_occurrence(jsonb_build_object('typeId', (select id from occurrence_types where name = 'Carta faltando'),
    'orderId', o1, 'description', 'Teste 8B'));
  v_occ := (r ->> 'id')::uuid;
  v_oc_code := admin_add_resolution(v_occ, '{"kind": "cupom", "amountBrl": 5, "couponType": "flat"}') ->> 'couponCode';
  perform admin_add_resolution(v_occ, '{"kind": "credito", "amountBrl": 10}');
  perform _t_as(null);
  perform _t_check('cupom da ocorrência é só do cliente e de uso único',
    (select owner_user_id = v_u and max_uses = 1 and max_uses_per_user = 1 from coupons where code = v_oc_code));
  perform _t_as(v_u2);
  perform _t_err('outro cliente não usa o cupom da ocorrência', format('select check_coupon(%L, 1)', v_oc_code), 'Cupom inválido');
  perform _t_as(null, true);
  perform _t_check('cupom da ocorrência não aparece na lista pública', (select count(*) = 0 from coupons where code = v_oc_code));
  perform _t_as(v_u);
  perform _t_check('o cliente da ocorrência usa o cupom', (check_coupon(v_oc_code, 1) ->> 'discountBRL')::numeric = 5);
  r := my_credit();
  perform _t_check('resolução "crédito" entra no saldo do cliente', (r ->> 'balance')::numeric = 10
    and r -> 'entries' -> 0 ->> 'kind' = 'ocorrencia', r::text);

  -- 4. Crédito no pedido, devolução no cancelamento, ajuste ----------------------------
  o4 := _t_order(array[v_s1], v_dest, null, true);
  perform _t_as(null);
  perform _t_check('pedido usa o crédito até o saldo', (select credit_used_brl = 10 and amount_due_brl = 10
    from orders where id = o4));
  perform _t_check('uso aparece no extrato', _credit_balance(v_u) = 0
    and exists (select 1 from customer_credits where order_id = o4 and kind = 'uso' and amount_brl = -10));
  update orders set created_at = created_at - interval '2 days' where id = o4;
  perform _t_as(v_a);
  perform admin_cancel_order(o4, 'teste crédito');
  perform _t_as(null);
  perform _t_check('cancelar devolve o crédito', _credit_balance(v_u) = 10
    and exists (select 1 from customer_credits where order_id = o4 and kind = 'estorno' and amount_brl = 10));

  perform _t_as(v_a);
  perform _t_check('ajuste do admin', admin_adjust_credit(v_u, -4, 'Correção de teste') = 6);
  perform _t_err('saldo não fica negativo', format('select admin_adjust_credit(%L, -50, %L)', v_u, 'x teste'), 'negativo');
  perform _t_err('ajuste exige motivo', format('select admin_adjust_credit(%L, 5, %L)', v_u, ''), 'motivo');
  perform _t_check('admin vê o extrato do cliente', (admin_user_credit(v_u) ->> 'balance')::numeric = 6);
  perform _t_as(v_v);
  perform _t_err('quem não vê Usuários não lê o crédito', format('select admin_user_credit(%L)', v_u), 'não permite');
  perform _t_as(v_u2);
  perform _t_check('cliente não vê o crédito de outro', (select count(*) = 0 from customer_credits where user_id = v_u));
  perform _t_check('cliente sem crédito: saldo zero', (my_credit() ->> 'balance')::numeric = 0);

  -- Crédito usado num pedido pago sai da receita do mês.
  perform _t_as(v_u);
  o4 := _t_order(array[v_s1], v_dest, null, true);
  perform pay_order(o4, 'pix');
  perform _t_as(null);
  perform _t_check('painel: crédito usado aparece e sai da receita',
    ((_finance_month(v_today) -> 'revenue' ->> 'credits')::numeric >= 6));
  perform _t_as(null, true);
  perform _t_err('visitante não usa check_coupon', 'select check_coupon(''T8BDEZ'', 1)', 'permission denied');
  perform _t_err('visitante não lê crédito', 'select my_credit()', 'permission denied');

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
