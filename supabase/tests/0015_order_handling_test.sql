-- Teste da 0015_order_handling.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Montado junto com a migração em 0015_teste_para_sql_editor.sql.

create table public._t_results (n serial primary key, ok boolean not null, name text not null, info text);
grant all on public._t_results to anon, authenticated;
grant usage on sequence public._t_results_n_seq to anon, authenticated;

create function public._t_check(p_name text, p_ok boolean, p_info text default null)
returns void language sql security definer set search_path = public as $$
  insert into _t_results (ok, name, info) values (coalesce(p_ok, false), p_name, p_info);
$$;

-- Age como o usuário, como anônimo ('anon') ou, com null, como o SQL Editor.
-- Também limpa as marcas t1.*: no app cada chamada é uma transação nova.
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

create function public._t_last_event(p_order uuid)
returns order_events language sql security definer set search_path = public as $$
  select * from order_events where order_id = p_order order by created_at desc limit 1;
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
  v_dest text; v_s1 text; v_s2 text;
  v_payload jsonb;
  x uuid; y uuid; v_other uuid;
  v_item uuid; v_other_item uuid;
  v_token text; v_code text; v_wrong text;
  v_photo uuid; v_path text;
  r jsonb;
  e order_events;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pedidos ativos que já existiam ganharam o código -----------------------
  perform _t_check('pedidos ativos antigos têm código',
    (select count(*) from orders o where o.status = 'active'
       and not exists (select 1 from order_pickups p where p.order_id = o.id)) = 0);
  perform _t_check('códigos com 6 dígitos e token de 32',
    (select count(*) from order_pickups where pickup_code !~ '^[0-9]{6}$' or package_token !~ '^[0-9a-f]{32}$') = 0);

  -- 2. Usuários, lojas e pedidos de teste (somem no fim) ---------------------------
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_c, 't1.teste.c.' || left(v_c::text, 8) || '@example.com', '{"name":"Cliente Teste"}'),
    (v_a, 't1.teste.a.' || left(v_a::text, 8) || '@example.com', '{"name":"Admin Teste"}'),
    (v_o, 't1.teste.o.' || left(v_o::text, 8) || '@example.com', '{"name":"Outro Teste"}');
  insert into admins (user_id) values (v_a);

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;
  v_payload := jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1, v_s2),
    'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object(
      'storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object(
        'cardName', 'Charizard', 'game', 'pokemon', 'price', 10, 'priceMode', 'unit', 'quantity', 2)))));

  perform _t_as(v_c);
  x := create_order(v_payload);
  y := create_order(v_payload);
  perform _t_as(v_o);
  v_other := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y, v_other);
  perform _t_check('sem pagamento, sem código', (select count(*) from order_pickups where order_id = x) = 0);

  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform _t_as(v_o);
  perform pay_order(v_other, 'pix');
  perform _t_as(null);
  select package_token, pickup_code into v_token, v_code from order_pickups where order_id = x;
  perform _t_check('pagar cria o código', v_token is not null and v_code ~ '^[0-9]{6}$');
  select i.id into v_item from pedido_card_items i join pedido_groups g on g.id = i.group_id where g.order_id = x;
  select i.id into v_other_item from pedido_card_items i join pedido_groups g on g.id = i.group_id where g.order_id = v_other;

  -- 3. Quem vê o código ---------------------------------------------------------------
  perform _t_as(v_c);
  select count(*) into v_n from order_pickups;
  perform _t_check('cliente vê só o próprio código', v_n = 1, v_n::text);
  perform _t_as(v_o);
  select count(*) into v_n from order_pickups where order_id = x;
  perform _t_check('outro usuário não vê o código', v_n = 0);
  perform _t_as(null, true);
  perform _t_err('anônimo não lê códigos', 'select count(*) from order_pickups', 'permission denied');

  -- 4. Conferência ------------------------------------------------------------------
  perform _t_as(v_o);
  perform _t_err('não admin não confere',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 2))),
    'Acesso restrito');
  perform _t_as(v_a);
  perform _t_err('item de outro pedido é recusado',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_other_item, 'receivedQty', 1))),
    'não pertence');
  perform _t_err('quantidade negativa é recusada',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', -1))),
    'quantidades');
  perform admin_save_item_checks(x, jsonb_build_array(
    jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 1, 'note', 'Veio só uma')));
  perform _t_check('conferência gravada com o esperado do pedido',
    (select expected_qty = 2 and received_qty = 1 and note = 'Veio só uma' and checked_by = v_a
       from order_item_checks where card_item_id = v_item));
  e := _t_last_event(x);
  perform _t_check('conferência entra na linha do tempo',
    e.kind = 'items_checked' and e.actor_kind = 'admin' and (e.details ->> 'divergent')::int = 1, e.details::text);
  perform admin_save_item_checks(x, jsonb_build_array(
    jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 2)));
  perform _t_check('salvar de novo atualiza (sem duplicar)',
    (select count(*) = 1 and min(received_qty) = 2 and min(note) is null from order_item_checks where card_item_id = v_item));
  perform _t_as(v_c);
  select count(*) into v_n from order_item_checks;
  perform _t_check('cliente vê a própria conferência', v_n = 1);
  perform _t_as(v_o);
  select count(*) into v_n from order_item_checks where order_id = x;
  perform _t_check('outro usuário não vê a conferência', v_n = 0);

  -- 5. Fotos ------------------------------------------------------------------------
  perform _t_as(v_a);
  v_path := x::text || '/' || gen_random_uuid()::text || '.jpg';
  perform _t_err('caminho de foto de outro pedido é recusado',
    format('select admin_add_photo(%L, ''card'', %L, %L)', x, v_item, v_other::text || '/' || gen_random_uuid() || '.jpg'),
    'Arquivo de foto inválido');
  perform _t_err('foto de item de outro pedido é recusada',
    format('select admin_add_photo(%L, ''card'', %L, %L)', x, v_other_item, v_path), 'não pertence');
  v_photo := admin_add_photo(x, 'card', v_item, v_path);
  perform admin_add_photo(x, null, null, x::text || '/' || gen_random_uuid()::text || '.webp');
  perform _t_as(v_c);
  select count(*) into v_n from order_photos;
  perform _t_check('cliente vê as fotos do próprio pedido', v_n = 2, v_n::text);
  perform _t_as(v_o);
  select count(*) into v_n from order_photos where order_id = x;
  perform _t_check('outro usuário não vê as fotos', v_n = 0);
  perform _t_as(v_a);
  perform _t_check('apagar foto devolve o caminho', admin_delete_photo(v_photo) = v_path);
  perform _t_as(null);  -- storage.buckets só é legível pelo dono do banco
  perform _t_check('bucket é privado',
    (select not public from storage.buckets where id = 'order-photos'));

  -- 6. Custódia ---------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('"outro" sem observação é recusado',
    format('select admin_add_custody_event(%L, %L::jsonb)', x, '{"action":"outro"}'), 'Descreva');
  perform _t_err('movimentação inválida é recusada',
    format('select admin_add_custody_event(%L, %L::jsonb)', x, '{"action":"sumiu"}'), 'Escolha a movimentação');
  perform admin_add_custody_event(x, jsonb_build_object(
    'action', 'coletado_na_loja', 'storeCode', v_s1, 'responsible', 'João Entregador'));
  e := _t_last_event(x);
  perform _t_check('custódia entra na linha do tempo',
    e.kind = 'custody' and e.to_value = 'coletado_na_loja' and e.details ->> 'storeCode' = v_s1
    and e.details ->> 'responsible' = 'João Entregador', e.details::text);
  perform _t_as(v_c);
  select count(*) into v_n from custody_events;
  perform _t_check('cliente não vê a custódia', v_n = 0);

  -- 7. Página do QR -----------------------------------------------------------------
  perform _t_as(null, true);
  r := pickup_lookup(v_token);
  perform _t_check('QR: pedido ainda não chegou',
    (r ->> 'found')::boolean and r ->> 'state' = 'not_ready' and r ->> 'customerFirstName' = 'Cliente'
    and r ->> 'orderCode' = upper(left(x::text, 8)), r::text);
  perform _t_check('QR: não expõe e-mail nem código', r::text not like '%@%' and r::text not like '%' || v_code || '%');
  perform _t_err('QR: não confirma antes de chegar',
    format('select pickup_confirm(%L, %L)', v_token, v_code), 'ainda não está liberado');
  perform _t_check('QR: token inválido não encontra', not (pickup_lookup('0123456789abcdef0123456789abcdef') ->> 'found')::boolean);
  perform _t_err('QR: confirmar com token inválido',
    format('select pickup_confirm(%L, %L)', '0123456789abcdef0123456789abcdef', '000000'), 'não é de um pacote');
  perform _t_err('anônimo não usa função de admin',
    format('select admin_save_item_checks(%L, ''[]''::jsonb)', x), 'permission denied');

  perform _t_as(v_a);
  perform admin_move_order(x, 'disponivel-para-retirada', 'Teste');
  perform _t_as(null, true);
  perform _t_check('QR: pronto para retirar', pickup_lookup(v_token) ->> 'state' = 'ready');

  v_wrong := case when v_code = '000000' then '111111' else '000000' end;
  for i in 1..4 loop
    r := pickup_confirm(v_token, v_wrong);
    perform _t_check('código errado nº ' || i, not (r ->> 'ok')::boolean and (r ->> 'attemptsLeft')::int = 5 - i, r::text);
  end loop;
  r := pickup_confirm(v_token, v_wrong);
  perform _t_check('5º erro trava', (r ->> 'locked')::boolean, r::text);
  perform _t_err('travado recusa até o código certo',
    format('select pickup_confirm(%L, %L)', v_token, v_code), 'Muitas tentativas');
  perform _t_as(null);
  perform _t_check('pedido continua aberto depois dos erros', (select status = 'active' from orders where id = x));

  perform _t_as(null);
  update order_pickups set locked_until = now() - interval '1 second' where order_id = x;
  perform _t_as(null, true);
  r := pickup_confirm(v_token, v_code);
  perform _t_check('código certo confirma', (r ->> 'ok')::boolean, r::text);
  perform _t_as(null);
  perform _t_check('pedido concluído', (select status = 'completed' and completed_at is not null from orders where id = x));
  perform _t_check('código marcado como usado', (select used_at is not null from order_pickups where order_id = x));
  perform _t_check('custódia "retirado pelo cliente" na loja de retirada',
    exists (select 1 from custody_events c join orders o on o.id = c.order_id
            where c.order_id = x and c.action = 'retirado_pelo_cliente' and c.store_id = o.destination_store_id));
  perform _t_check('linha do tempo: concluído pela loja',
    exists (select 1 from order_events where order_id = x and kind = 'completed' and actor_kind = 'store'
            and from_value = 'disponivel-para-retirada'));
  perform _t_as(null, true);
  perform _t_err('código não vale de novo', format('select pickup_confirm(%L, %L)', v_token, v_code), 'já foi retirado');
  perform _t_check('QR: já retirado', pickup_lookup(v_token) ->> 'state' = 'done');

  perform _t_as(v_c);
  perform pay_order(y, 'pix');
  perform _t_as(v_a);
  perform admin_move_order(y, 'cancelled', 'Teste');
  perform _t_as(null);
  select package_token into v_token from order_pickups where order_id = y;
  perform _t_as(null, true);
  perform _t_check('QR: pedido cancelado avisa', pickup_lookup(v_token) ->> 'state' = 'cancelled');

  -- 8. Resultado: o erro abaixo é de propósito e desfaz TUDO ----------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
