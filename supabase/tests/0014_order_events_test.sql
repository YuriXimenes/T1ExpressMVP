-- Teste da 0014_order_events.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Montado junto com a migração em 0014_teste_para_sql_editor.sql.

create table public._t_results (n serial primary key, ok boolean not null, name text not null, info text);
grant all on public._t_results to authenticated;
grant usage on sequence public._t_results_n_seq to authenticated;

create function public._t_check(p_name text, p_ok boolean, p_info text default null)
returns void language sql security definer set search_path = public as $$
  insert into _t_results (ok, name, info) values (coalesce(p_ok, false), p_name, p_info);
$$;

-- Age como o usuário (como o app faria) ou, com null, como o SQL Editor (sem usuário).
-- Também limpa as marcas t1.*: no app cada chamada é uma transação nova.
create function public._t_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('t1.actor', '', true);
  perform set_config('t1.reason', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  if p_user is not null then
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;

-- Último evento gravado (created_at usa clock_timestamp(), então cresce mesmo numa transação só).
create function public._t_last(p_order uuid)
returns order_events language sql security definer set search_path = public as $$
  select * from order_events where order_id = p_order order by created_at desc limit 1;
$$;

create function public._t_count(p_order uuid, p_kind text default null)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from order_events
  where order_id = p_order and (p_kind is null or kind = p_kind);
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
  v_c uuid := gen_random_uuid();   -- cliente
  v_a uuid := gen_random_uuid();   -- admin
  v_o uuid := gen_random_uuid();   -- outro usuário, sem ser admin
  v_dest text; v_s1 text; v_s2 text; v_s3 text;
  v_payload jsonb;
  x uuid; y uuid; z uuid; w uuid; v uuid;
  v_charge uuid; v_ticket uuid;
  e order_events;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Reconstrução dos pedidos que já existiam ----------------------------
  perform _t_check('backfill: 1 "criado" por pedido',
    (select count(*) from order_events where backfilled and kind = 'created') = (select count(*) from orders));
  perform _t_check('backfill: pagos',
    (select count(*) from order_events where backfilled and kind = 'paid') = (select count(*) from orders where paid_at is not null));
  perform _t_check('backfill: concluídos',
    (select count(*) from order_events where backfilled and kind = 'completed') = (select count(*) from orders where status = 'completed' and completed_at is not null));
  perform _t_check('backfill: cancelados',
    (select count(*) from order_events where backfilled and kind = 'cancelled') = (select count(*) from orders where status = 'cancelled'));
  perform _t_check('backfill: lojas extras',
    (select count(*) from order_events where backfilled and kind = 'store_charge_created') = (select count(*) from store_charges));
  perform _t_check('backfill: chamados',
    (select count(*) from order_events where backfilled and kind = 'ticket_opened') = (select count(*) from support_tickets));
  perform _t_check('backfill: nenhum evento extra', (select count(*) from order_events where not backfilled) = 0);

  -- 2. Usuários e lojas de teste ---------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_c, 't1.teste.c.' || left(v_c::text, 8) || '@example.com', '{"name":"Cliente Teste"}'),
    (v_a, 't1.teste.a.' || left(v_a::text, 8) || '@example.com', '{"name":"Admin Teste"}'),
    (v_o, 't1.teste.o.' || left(v_o::text, 8) || '@example.com', '{"name":"Outro Teste"}');
  insert into admins (user_id) values (v_a);

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;
  select code into v_s3 from stores where code not in (v_dest, v_s1, v_s2) order by code limit 1;

  v_payload := jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1, v_s2),
    'destinationStoreCode', v_dest,
    'deliveryNote', 'teste',
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4, 'competitors', '[]'::jsonb),
    'groups', jsonb_build_array(jsonb_build_object(
      'storeCode', v_s1, 'kind', 'cartas-avulsas', 'orderNumber', '',
      'cardItems', jsonb_build_array(jsonb_build_object(
        'cardName', 'Teste', 'game', 'magic', 'price', 10, 'priceMode', 'unit', 'quantity', 2)))),
    'insuranceOptedIn', true);

  -- 3. Criar: um evento só, com os valores finais -------------------------------
  perform _t_as(v_c);
  x := create_order(v_payload);
  e := _t_last(x);
  perform _t_check('criar: 1 evento só', _t_count(x) = 1, _t_count(x)::text);
  perform _t_check('criar: autor = cliente', e.kind = 'created' and e.actor_kind = 'customer' and e.actor_id = v_c);
  perform _t_check('criar: valor final nos detalhes',
    (e.details ->> 'amountDueBRL')::numeric = (select amount_due_brl from orders where id = x)
    and (e.details ->> 'itemsTotalBRL')::numeric = (select items_total_brl from orders where id = x), e.details::text);

  -- Fora do teste cada chamada é uma transação; aqui é uma só, então "envelhecemos"
  -- a criação para o gatilho tratar as próximas mudanças como novas.
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = x;
  perform _t_check('envelhecer não gera evento', _t_count(x) = 1);

  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  e := _t_last(x);
  perform _t_check('pagar: evento do cliente', e.kind = 'paid' and e.actor_kind = 'customer' and e.to_value = 'aguardando-coleta', e.kind);

  v_charge := add_store_charge(x, jsonb_build_object(
    'storeCodes', jsonb_build_array(v_s3), 'insuranceUpgrade', true,
    'groups', jsonb_build_array(jsonb_build_object(
      'storeCode', v_s3, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object(
        'cardName', 'Extra', 'game', 'pokemon', 'price', 50, 'priceMode', 'total', 'quantity', 1))))));
  e := _t_last(x);
  perform _t_check('loja extra: 1 evento com valor e loja',
    _t_count(x, 'store_charge_created') = 1 and e.kind = 'store_charge_created'
    and e.to_value::numeric = (select amount_brl from store_charges where id = v_charge)
    and e.details -> 'storeCodes' = jsonb_build_array(v_s3), e.details::text);
  perform _t_as(null);
  update store_charges set created_at = created_at - interval '1 day' where id = v_charge;
  perform _t_as(v_c);
  perform pay_store_charge(v_charge, 'credit-card');
  perform _t_check('pagar loja extra: evento de pagamento', _t_count(x, 'store_charge_paid') = 1);
  perform _t_check('pagar loja extra: valor declarado muda', _t_count(x, 'items_added') = 1);

  v_ticket := create_support_ticket(x, 'Assunto teste', 'Mensagem');
  perform _t_check('chamado aberto', (_t_last(x)).kind = 'ticket_opened');

  -- 4. Quem pode ver e gravar --------------------------------------------------------
  perform _t_as(v_c);
  select count(*) into v_n from order_events;
  perform _t_check('cliente não lê eventos', v_n = 0, v_n::text);
  perform _t_as(v_o);
  select count(*) into v_n from order_events;
  perform _t_check('outro usuário não lê eventos', v_n = 0, v_n::text);
  perform _t_err('ninguém grava evento direto',
    format('insert into order_events (order_id, actor_kind, kind) values (%L, ''admin'', ''paid'')', x),
    'permission denied');
  perform _t_err('não admin não move pedido',
    format('select admin_move_order(%L, ''em-transporte'', null)', x), 'Acesso restrito');
  perform _t_as(v_a);
  select count(*) into v_n from order_events where order_id = x;
  perform _t_check('admin lê eventos', v_n > 0);

  -- 5. Regras de movimento ---------------------------------------------------------
  perform admin_move_order(x, 'em-transporte', null);
  e := _t_last(x);
  perform _t_check('avançar sem motivo',
    e.kind = 'stage_changed' and e.actor_kind = 'admin' and e.actor_id = v_a
    and e.from_value = 'aguardando-coleta' and e.to_value = 'em-transporte' and e.reason is null);
  perform _t_err('voltar sem motivo é recusado',
    format('select admin_move_order(%L, ''aguardando-coleta'', null)', x), 'motivo para voltar');
  perform _t_err('motivo só com espaços é recusado',
    format('select admin_move_order(%L, ''aguardando-coleta'', ''   '')', x), 'motivo para voltar');
  perform admin_move_order(x, 'aguardando-coleta', 'Voltou por engano');
  perform _t_check('voltar com motivo grava o motivo', (_t_last(x)).reason = 'Voltou por engano');
  perform _t_err('pular sem motivo é recusado',
    format('select admin_move_order(%L, ''disponivel-para-retirada'', null)', x), 'motivo para voltar ou pular');
  perform admin_move_order(x, 'disponivel-para-retirada', 'Entrega direta');
  perform _t_check('pular com motivo', (_t_last(x)).to_value = 'disponivel-para-retirada');
  perform _t_err('mesma etapa é recusada',
    format('select admin_move_order(%L, ''disponivel-para-retirada'', ''x'')', x), 'já está nessa etapa');
  perform _t_err('destino inválido é recusado',
    format('select admin_move_order(%L, ''pending-payment'', ''x'')', x), 'Destino inválido');
  perform _t_err('motivo longo demais é recusado',
    format('select admin_move_order(%L, ''em-transporte'', %L)', x, repeat('x', 501)), 'longo demais');
  perform admin_set_ticket_resolved(v_ticket, true);
  e := _t_last(x);
  perform _t_check('chamado respondido pelo admin', e.kind = 'ticket_resolved' and e.actor_kind = 'admin');
  perform admin_move_order(x, 'completed', null);
  e := _t_last(x);
  perform _t_check('concluir a partir da retirada sem motivo',
    e.kind = 'completed' and e.from_value = 'disponivel-para-retirada');
  perform _t_err('concluído é final', format('select admin_move_order(%L, ''cancelled'', ''x'')', x), 'finalizado');

  perform _t_as(v_c);
  y := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = y;
  perform _t_as(v_a);
  perform _t_err('não pago não avança',
    format('select admin_move_order(%L, ''em-transporte'', ''x'')', y), 'ainda não foi pago');
  perform _t_err('não pago não conclui',
    format('select admin_move_order(%L, ''completed'', ''x'')', y), 'ainda não foi pago');
  perform _t_err('cancelar sem motivo é recusado',
    format('select admin_move_order(%L, ''cancelled'', null)', y), 'motivo do cancelamento');
  perform admin_move_order(y, 'cancelled', 'Cliente desistiu');
  e := _t_last(y);
  perform _t_check('cancelar com motivo',
    e.kind = 'cancelled' and e.from_value = 'pending-payment' and e.reason = 'Cliente desistiu');
  perform _t_check('motivo também no pedido', (select cancel_reason from orders where id = y) = 'Cliente desistiu');

  perform _t_as(v_c);
  z := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = z;
  perform _t_as(v_c);
  perform pay_order(z, 'pix');
  perform _t_as(v_a);
  perform _t_err('concluir antes da retirada sem motivo é recusado',
    format('select admin_move_order(%L, ''completed'', null)', z), 'concluir antes da retirada');
  perform admin_move_order(z, 'completed', 'Cliente retirou na origem');
  e := _t_last(z);
  perform _t_check('concluir antes da retirada com motivo',
    e.kind = 'completed' and e.from_value = 'aguardando-coleta' and e.reason is not null);
  perform _t_check('data de conclusão preenchida', (select completed_at is not null from orders where id = z));

  -- 6. Funções antigas continuam funcionando e entram no histórico ----------------
  perform _t_as(v_c);
  w := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = w;
  perform _t_as(v_c);
  perform pay_order(w, 'pix');
  perform _t_as(v_a);
  perform advance_delivery_stage(w);
  e := _t_last(w);
  perform _t_check('antiga: avançar etapa vira evento do admin', e.kind = 'stage_changed' and e.actor_kind = 'admin');
  perform admin_cancel_order(w, 'Motivo antigo');
  e := _t_last(w);
  perform _t_check('antiga: cancelar grava o motivo',
    e.kind = 'cancelled' and e.reason = 'Motivo antigo' and e.from_value = 'em-transporte',
    format('último evento: %s / %s / de %s / motivo %s', e.kind, e.actor_kind, e.from_value, e.reason));
  perform _t_check('eventos da mesma ação ficam em ordem',
    (select count(distinct created_at) = count(*) from order_events where not backfilled));

  perform _t_as(v_c);
  v := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = v;
  perform _t_as(v_c);
  perform pay_order(v, 'pix');
  perform _t_as(v_a);
  perform admin_move_order(v, 'em-transporte', null);
  perform admin_move_order(v, 'disponivel-para-retirada', null);
  perform _t_as(v_c);
  perform complete_order(v);
  e := _t_last(v);
  perform _t_check('cliente confirma a retirada', e.kind = 'completed' and e.actor_kind = 'customer');

  -- 7. Resultado: o erro abaixo é de propósito e desfaz TUDO ----------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
