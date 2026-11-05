-- Teste da 0020_partners.sql. Roda DEPOIS da migração, na MESMA transação,
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
  v_a uuid := gen_random_uuid();   -- Administrador
  v_nc uuid := gen_random_uuid();  -- backoffice só com dashboard
  v_s uuid := gen_random_uuid();   -- responsável da loja nova
  v_f uuid := gen_random_uuid();   -- funcionário da loja nova
  v_o uuid := gen_random_uuid();   -- funcionário do ponto existente
  v_c uuid := gen_random_uuid();   -- cliente
  v_role uuid;
  v_lead uuid;
  v_onb uuid;
  v_token text; v_inv text;
  v_new text; v_dest text; v_s1 text;
  v_doc uuid;
  x uuid;
  v_ptoken text; v_code text;
  r jsonb;
  v_n int;
  v_occ uuid;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas (somem no fim) ----------------------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_nc, v_s, v_f, v_o, v_c]) u;
  insert into staff_roles (name) values ('Só dashboard') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'dashboard', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_nc, v_role);
  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;

  -- 2. Validações e calendário -----------------------------------------------------------
  perform _t_as(null);
  perform _t_check('CNPJ e CPF válidos', _valid_cnpj('11222333000181') and _valid_cpf('52998224725'));
  perform _t_check('CNPJ e CPF inválidos', not _valid_cnpj('11222333000182') and not _valid_cpf('11111111111')
    and not _valid_cpf('123'));
  perform _t_check('5º dia útil de novembro/2026 pula Finados', _nth_business_day('2026-11-01', 5) = '2026-11-09',
    _nth_business_day('2026-11-01', 5)::text);
  perform _t_check('5º dia útil de dezembro/2026', _nth_business_day('2026-12-15', 5) = '2026-12-07');

  -- 3. Admin inicia o onboarding a partir do formulário ---------------------------------
  insert into partner_leads (store_name, wants_pickup, wants_dropoff, street, number, city, state,
    contact_name, contact_phone, contact_email)
  values ('Loja Teste TCG', true, true, 'Rua A', '10', 'Rio de Janeiro', 'RJ', 'Fulano', '21999990000',
    't1.lead@example.com') returning id into v_lead;
  perform _t_as(v_a);
  r := admin_start_onboarding(v_lead);
  v_onb := (r ->> 'id')::uuid; v_token := r ->> 'token';
  perform _t_as(null);
  perform _t_check('onboarding criado com dados do formulário',
    (select status = 'aguardando_preenchimento' and data ->> 'tradeName' = 'Loja Teste TCG' and data ->> 'kind' = 'ambos'
     from partner_onboardings where id = v_onb)
    and (select contacted from partner_leads where id = v_lead));
  perform _t_as(v_a);
  perform _t_err('mesmo formulário duas vezes', format('select admin_start_onboarding(%L)', v_lead), 'já tem');
  perform _t_as(v_nc);
  perform _t_err('perfil sem KYC não vê', 'select admin_onboardings()', 'não permite');
  perform _t_as(null, true);
  perform _t_check('link pode ser visto antes do login', (onboarding_preview(v_token) ->> 'found')::boolean);
  perform _t_err('anon não abre o cadastro', format('select onboarding_by_token(%L)', v_token), 'permission denied');

  -- 4. A loja preenche -----------------------------------------------------------------------
  perform _t_as(v_s);
  r := onboarding_by_token(v_token);
  perform _t_as(null);
  perform _t_check('link ligado à conta de quem abriu', (select user_id = v_s from partner_onboardings where id = v_onb));
  perform _t_as(v_s);
  perform _t_check('lista o que falta', jsonb_array_length(r -> 'missing') > 3, (r -> 'missing')::text);
  perform _t_as(v_o);
  perform _t_err('outra conta não usa o mesmo link', format('select onboarding_by_token(%L)', v_token), 'outra conta');
  perform _t_as(v_s);
  perform _t_err('enviar incompleto', format('select onboarding_submit(%L)', v_token), 'Falta preencher');
  perform onboarding_save(v_token, jsonb_build_object(
    'legalName', 'Loja Teste TCG LTDA', 'tradeName', 'Loja Teste TCG', 'cnpj', '11.222.333/0001-81',
    'responsibleName', 'Fulano de Tal', 'responsibleCpf', '529.982.247-25', 'responsibleEmail', 'fulano@example.com',
    'responsiblePhone', '(21) 99999-0000', 'street', 'Rua A', 'number', '10', 'neighborhood', 'Centro',
    'city', 'Rio de Janeiro', 'state', 'rj', 'kind', 'ambos', 'capacity', '40',
    'hours', jsonb_build_object('1', '10:00-19:00', '3', '10:00-19:00'),
    'payout', jsonb_build_object('method', 'pix', 'pixKey', '11222333000181'),
    'termsAccepted', true));
  perform _t_as(null);
  perform _t_check('dados normalizados (CNPJ só dígitos, UF maiúscula)',
    (select data ->> 'cnpj' = '11222333000181' and data ->> 'state' = 'RJ' from partner_onboardings where id = v_onb));
  perform _t_as(v_s);
  perform _t_err('documento fora da pasta', format('select onboarding_add_document(%L, %L, %L, %L, %L)',
    v_token, 'cnpj', 'outra/x.pdf', 'x.pdf', 'application/pdf'), 'Arquivo inválido');
  perform onboarding_add_document(v_token, k, 'onboarding/' || v_onb || '/' || k || '.pdf', k || '.pdf', 'application/pdf')
    from unnest(array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco', 'comprovante_bancario']) k;
  perform _t_err('ponto de retirada precisa de fotos do local', format('select onboarding_submit(%L)', v_token), 'Fotos do local');
  perform onboarding_add_document(v_token, 'foto_local', 'onboarding/' || v_onb || '/f' || n || '.jpg', 'f.jpg', 'image/jpeg')
    from generate_series(1, 2) n;
  perform onboarding_submit(v_token);
  perform _t_as(null);
  perform _t_check('enviado: em análise', (select status = 'em_analise' and submitted_at is not null
    from partner_onboardings where id = v_onb));
  perform _t_as(v_s);
  perform _t_err('enviado não aceita mais edição', format('select onboarding_save(%L, %L::jsonb)', v_token, '{"tradeName":"X"}'),
    'já foi enviado');
  perform _t_check('policy do arquivo: dono lê', _can_read_partner_path('onboarding', v_onb::text));
  perform _t_as(v_c);
  perform _t_check('policy do arquivo: outro não lê', not _can_read_partner_path('onboarding', v_onb::text));

  -- 5. Análise: pendência, correção e aprovação --------------------------------------------
  perform _t_as(v_a);
  perform _t_err('aprovar com documentos não aceitos', format('select admin_set_onboarding_status(%L, %L)', v_onb, 'aprovado'),
    'Aceite os documentos');
  select id into v_doc from partner_documents where onboarding_id = v_onb and kind = 'cnpj';
  perform admin_review_document(v_doc, 'recusado', 'Cartão CNPJ ilegível');
  perform _t_err('pendência sem mensagem', format('select admin_set_onboarding_status(%L, %L)', v_onb, 'pendencia'), 'mensagem');
  perform admin_set_onboarding_status(v_onb, 'pendencia', 'Reenvie o cartão CNPJ legível.');
  perform _t_as(v_s);
  r := onboarding_by_token(v_token);
  perform _t_check('loja vê a pendência e o documento recusado',
    r ->> 'status' = 'pendencia' and r ->> 'message' like 'Reenvie%'
    and exists (select 1 from jsonb_array_elements(r -> 'documents') d where d ->> 'status' = 'recusado'));
  perform _t_err('recusado conta como faltando', format('select onboarding_submit(%L)', v_token), 'Cartão CNPJ');
  perform onboarding_add_document(v_token, 'cnpj', 'onboarding/' || v_onb || '/cnpj2.pdf', 'cnpj2.pdf', 'application/pdf');
  perform onboarding_submit(v_token);
  perform _t_as(null);
  perform _t_check('correção volta para em análise com registro',
    (select status = 'em_analise' from partner_onboardings where id = v_onb)
    and exists (select 1 from partner_onboarding_events where onboarding_id = v_onb and kind = 'enviado'
                and note like 'Pendência corrigida%'));
  perform _t_as(v_a);
  perform admin_review_document(d.id, 'aceito') from partner_documents d where d.onboarding_id = v_onb and d.status = 'pendente';
  r := admin_set_onboarding_status(v_onb, 'aprovado', 'Bem-vindo!');
  v_new := r ->> 'storeCode';
  perform _t_as(null);
  perform _t_check('aprovado cria a loja oculta no site, coleta e retirada',
    (select not published and is_pickup_point and partner_kind = 'ambos' and pickup_capacity = 40
     from stores where code = v_new), v_new);
  perform _t_check('perfil do parceiro com CNPJ e Pix',
    (select cnpj = '11222333000181' and payout ->> 'pixKey' = '11222333000181'
     from store_partner_profiles pp join stores s on s.id = pp.store_id where s.code = v_new));
  perform _t_check('quem preencheu vira responsável',
    exists (select 1 from store_members m join stores s on s.id = m.store_id
            where s.code = v_new and m.user_id = v_s and m.role = 'responsavel' and m.active));

  -- 6. Área da loja e equipe -------------------------------------------------------------------
  perform _t_as(v_s);
  perform _t_check('minhas lojas', jsonb_array_length(my_stores()) = 1);
  r := store_dashboard(v_new);
  perform _t_check('painel da loja', r ? 'next' and (r ->> 'stored')::int = 0, r::text);
  v_inv := store_invite_member(v_new);
  perform _t_as(v_c);
  perform _t_err('cliente não acessa a loja', format('select store_dashboard(%L)', v_new), 'Sem acesso');
  perform _t_check('prévia do convite', (store_invite_preview(v_inv) ->> 'valid')::boolean);
  perform _t_as(v_f);
  perform accept_store_invite(v_inv);
  perform _t_err('convite usado uma vez só', format('select accept_store_invite(%L)', v_inv), 'já foi usado');
  perform _t_check('funcionário entrou', jsonb_array_length(my_stores()) = 1);
  perform _t_err('funcionário não convida', format('select store_invite_member(%L)', v_new), 'Sem acesso');
  perform _t_as(v_s);
  perform store_set_member_active(v_new, v_f, false);
  perform _t_as(v_f);
  perform _t_check('funcionário desativado perde o acesso', jsonb_array_length(my_stores()) = 0);

  -- 7. Retirada pelo QR exige a conta da loja ------------------------------------------------
  perform _t_as(v_a);
  v_inv := admin_store_invite(v_dest, 'funcionario');
  perform _t_as(v_o);
  perform accept_store_invite(v_inv);
  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'X', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = x;
  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform _t_as(null);
  update orders set delivery_stage = 'disponivel-para-retirada' where id = x;
  select package_token, pickup_code into v_ptoken, v_code from order_pickups where order_id = x;
  perform _t_as(null, true);
  perform _t_check('sem login: não confirma', not (pickup_lookup(v_ptoken) ->> 'canConfirm')::boolean);
  perform _t_err('anon não confirma', format('select pickup_confirm(%L, %L)', v_ptoken, v_code), 'conta da loja');
  perform _t_as(v_c);
  perform _t_err('cliente não confirma', format('select pickup_confirm(%L, %L)', v_ptoken, v_code), 'conta da loja');
  perform _t_as(v_s);
  perform _t_err('outra loja não confirma', format('select pickup_confirm(%L, %L)', v_ptoken, v_code), 'conta da loja');
  perform _t_as(v_o);
  perform _t_check('loja de destino pode confirmar', (pickup_lookup(v_ptoken) ->> 'canConfirm')::boolean);
  r := pickup_confirm(v_ptoken, v_code);
  perform _t_as(null);
  perform _t_check('retirada confirmada pela loja',
    (r ->> 'ok')::boolean and (select status = 'completed' from orders where id = x)
    and exists (select 1 from order_events where order_id = x and kind = 'completed' and actor_kind = 'store'));

  -- 8. Remuneração, extrato e pagamento --------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('percentual acima de 100', format('select admin_set_store_pay_rules(%L, %L::jsonb)', v_dest,
    '[{"kind":"percentual_frete","amount":150}]'), '100');
  perform admin_set_store_pay_rules(v_dest, '[{"kind":"por_retirada","amount":2.5},{"kind":"bonus_mensal","amount":50},{"kind":"percentual_frete","amount":10}]');
  perform _t_as(null);
  r := _store_statement((select id from stores where code = v_dest), (now() at time zone 'America/Sao_Paulo')::date);
  perform _t_check('extrato conta a retirada de hoje',
    (r ->> 'pickups')::int >= 1, r::text);
  perform _t_check('total = 2,50 por retirada + bônus 50 + 10% do frete',
    (r ->> 'total')::numeric = round(2.5 * (r ->> 'pickups')::int + 50 + 0.1 * (r ->> 'pickupFreight')::numeric, 2), r::text);
  perform _t_as(v_a);
  perform admin_register_payout(v_dest, ((now() at time zone 'America/Sao_Paulo')::date - interval '1 month')::date,
    120, (now() at time zone 'America/Sao_Paulo')::date, null, 'Pix enviado');
  perform _t_as(v_o);
  r := store_finance(v_dest);
  perform _t_check('loja vê o pagamento do mês anterior e o próximo recebimento',
    (r -> 'previous' -> 'payout' ->> 'amount')::numeric = 120 and r -> 'next' ->> 'date' is not null, r::text);

  -- 9. Ocorrências da loja --------------------------------------------------------------------
  perform _t_as(v_a);
  r := admin_open_occurrence(jsonb_build_object('typeId', (select id from occurrence_types where name = 'Atraso'),
    'storeCode', v_dest, 'description', 'Teste de ocorrência da loja'));
  v_occ := (r ->> 'id')::uuid;
  perform _t_as(v_o);
  perform _t_check('loja vê a ocorrência ligada a ela',
    exists (select 1 from jsonb_array_elements(store_occurrences(v_dest)) e where (e ->> 'id')::uuid = v_occ));
  perform occurrence_comment(v_occ, 'Estamos verificando aqui.');
  perform _t_as(null);
  perform _t_check('comentário com autor loja',
    exists (select 1 from occurrence_updates where occurrence_id = v_occ and author_kind = 'store'));

  -- 10. Ficha, publicação e desempenho --------------------------------------------------------
  perform _t_as(v_a);
  r := admin_store_profile(v_new);
  perform _t_check('ficha traz KYC, acessos e financeiro',
    r -> 'onboarding' ->> 'status' = 'aprovado' and jsonb_array_length(r -> 'members') = 2 and r ? 'finance', r::text);
  perform admin_set_store_published(v_new, true);
  perform _t_as(null);
  perform _t_check('loja publicada', (select published from stores where code = v_new));
  perform _t_as(v_a);
  perform _t_check('desempenho por loja', jsonb_array_length(admin_partner_performance(current_date - 30, current_date)) > 0);
  perform _t_as(v_nc);
  perform _t_err('perfil sem lojas não vê a ficha', format('select admin_store_profile(%L)', v_new), 'não permite');

  -- 11. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
