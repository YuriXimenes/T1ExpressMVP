-- Teste da 0016_staff_access.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Montado junto com a migração em 0016_teste_para_sql_editor.sql.

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

create function public._t_ok(p_name text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform _t_check(p_name, true);
  exception when others then
    perform _t_check(p_name, false, sqlerrm);
  end;
end;
$$;

-- Função de admin sem mapeamento: só Administrador passa.
create function public._t_unmapped() returns void language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
end;
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  c_op constant uuid := '00000000-0000-4000-8000-000000000002';
  c_fin constant uuid := '00000000-0000-4000-8000-000000000003';
  c_at constant uuid := '00000000-0000-4000-8000-000000000004';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_b uuid := gen_random_uuid();    -- outro Administrador
  v_op uuid := gen_random_uuid();   -- Operação
  v_fin uuid := gen_random_uuid();  -- Financeiro
  v_at uuid := gen_random_uuid();   -- Atendimento
  v_ppl uuid := gen_random_uuid();  -- perfil próprio com Pessoas (sem ser Administrador)
  v_in uuid := gen_random_uuid();   -- inativo
  v_c uuid := gen_random_uuid();    -- cliente
  v_new uuid := gen_random_uuid();  -- vai aceitar convite
  v_role uuid; v_ppl_role uuid;
  v_dest text; v_s1 text;
  x uuid; v_ticket uuid; v_token text; v_member uuid;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Migração ------------------------------------------------------------------
  perform _t_check('admins de hoje viraram Administrador ativo',
    (select count(*) from admins where role_id <> c_admin or status <> 'ativo') = 0);
  perform _t_check('4 perfis iniciais', (select count(*) from staff_roles) = 4);
  perform _t_check('todas as funções antigas mapeadas',
    (select count(*) from admin_function_perms) = 26);

  -- 2. Pessoas de teste (somem no fim) -------------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_b, v_op, v_fin, v_at, v_ppl, v_in, v_c, v_new]) u;
  insert into staff_roles (id, name) values (gen_random_uuid(), 'Gestor de pessoas') returning id into v_ppl_role;
  insert into staff_role_permissions (role_id, area, can_view, can_create, can_edit, can_delete)
  values (v_ppl_role, 'pessoas', true, true, true, true);
  insert into admins (user_id, role_id, status) values
    (v_a, c_admin, 'ativo'), (v_b, c_admin, 'ativo'), (v_op, c_op, 'ativo'), (v_fin, c_fin, 'ativo'),
    (v_at, c_at, 'ativo'), (v_ppl, v_ppl_role, 'ativo'), (v_in, c_op, 'inativo');

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
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
  v_ticket := create_support_ticket(x, 'Assunto', 'Mensagem');

  -- 3. Meu acesso -------------------------------------------------------------------
  perform _t_as(v_op);
  r := my_staff_access();
  perform _t_check('meu acesso: perfil e permissões',
    r ->> 'roleName' = 'Operação' and (r -> 'permissions' -> 'pedidos' ->> 'edit')::boolean
    and r -> 'permissions' -> 'precos' is null, r::text);
  perform _t_as(v_c);
  perform _t_check('cliente não tem acesso', my_staff_access() is null);
  perform _t_as(v_in);
  perform _t_check('inativo: is_admin falso', not is_admin());
  perform _t_err('inativo não move pedido', format('select admin_move_order(%L, ''em-transporte'', null)', x), 'Acesso restrito');

  -- 4. Funções antigas seguem o perfil -------------------------------------------------
  perform _t_as(v_op);
  perform _t_ok('Operação move pedido', format('select admin_move_order(%L, ''em-transporte'', null)', x));
  perform _t_err('Operação não mexe em cupom',
    'select admin_upsert_coupon(''TESTE0016'', ''{"type":"flat","value":1,"label":"x"}''::jsonb)', 'não permite');
  perform _t_err('Operação não mexe em preço',
    'select admin_update_pricing(''{"baseBrl":1,"extraStoreBrl":1,"addedStoreBrl":1,"insurancePer100Brl":1}''::jsonb)', 'não permite');
  perform _t_ok('Operação responde chamado (chamados/editar)', format('select admin_set_ticket_resolved(%L, true)', v_ticket));
  perform _t_err('função sem mapeamento exige Administrador', 'select _t_unmapped()', 'não permite');

  perform _t_as(v_fin);
  perform _t_ok('Financeiro cria cupom',
    'select admin_upsert_coupon(''TESTE0016'', ''{"type":"flat","value":1,"label":"x","active":false}''::jsonb)');
  perform _t_err('Financeiro não move pedido', format('select admin_move_order(%L, ''aguardando-coleta'', ''x'')', x), 'não permite');
  select count(*) into v_n from orders where id = x;
  perform _t_check('Financeiro vê pedidos', v_n = 1);
  select count(*) into v_n from partner_leads;
  perform _t_check('Financeiro não vê formulários', v_n = 0);
  perform _t_err('Financeiro não lista clientes', 'select * from admin_list_users()', 'não permite');

  perform _t_as(v_at);
  perform _t_ok('Atendimento reabre chamado', format('select admin_set_ticket_resolved(%L, false)', v_ticket));
  perform _t_err('Atendimento não move pedido', format('select admin_move_order(%L, ''aguardando-coleta'', ''x'')', x), 'não permite');
  perform _t_ok('Atendimento lista clientes', 'select * from admin_list_users()');

  perform _t_as(v_a);
  perform _t_ok('Administrador passa na função sem mapeamento', 'select _t_unmapped()');

  -- 5. Leituras por área ------------------------------------------------------------
  perform _t_as(v_ppl);
  select count(*) into v_n from orders where id = x;
  perform _t_check('perfil sem Pedidos não vê pedidos', v_n = 0);
  select count(*) into v_n from order_events where order_id = x;
  perform _t_check('perfil sem Pedidos não vê linha do tempo', v_n = 0);
  select count(*) into v_n from admins;
  perform _t_check('quem vê Pessoas lista os usuários do admin', v_n >= 7);
  perform _t_as(v_op);
  select count(*) into v_n from admins;
  perform _t_check('sem Pessoas, só vê o próprio acesso', v_n = 1);
  select count(*) into v_n from team_members;
  perform _t_check('sem Pessoas, não vê a equipe', v_n = 0);
  perform _t_err('sem Pessoas, não lista usuários do admin', 'select * from admin_list_staff()', 'não permite');

  -- 6. Usuários do admin -----------------------------------------------------------
  perform _t_as(v_a);
  perform _t_ok('Administrador lista usuários do admin', 'select * from admin_list_staff()');
  perform _t_ok('adicionar pelo e-mail',
    format('select admin_add_staff(%L, %L, ''Atendente'')', (select email from profiles where id = v_c), c_at));
  perform _t_err('adicionar de novo é recusado',
    format('select admin_add_staff(%L, %L, null)', (select email from profiles where id = v_c), c_at), 'já tem acesso');
  perform _t_err('e-mail sem conta sugere convite',
    'select admin_add_staff(''ninguem.t1.teste@example.com'', ''00000000-0000-4000-8000-000000000002'', null)', 'convite');
  perform _t_err('não se desativa',
    format('select admin_update_staff(%L, %L, null, ''inativo'')', v_a, c_admin), 'próprio acesso');
  perform _t_err('não reduz o próprio acesso',
    format('select admin_update_staff(%L, %L, null, ''ativo'')', v_a, c_op), 'próprio acesso');
  perform _t_ok('desativar outra pessoa', format('select admin_update_staff(%L, %L, ''Op'', ''inativo'')', v_op, c_op));
  perform _t_as(v_op);
  perform _t_check('desativado perde o acesso', not is_admin());
  perform _t_as(v_ppl);
  perform _t_err('quem não é Administrador não mexe em Administrador',
    format('select admin_update_staff(%L, %L, null, ''inativo'')', v_b, c_admin), 'Só um Administrador');
  perform _t_err('quem não é Administrador não dá perfil de Administrador',
    format('select admin_update_staff(%L, %L, null, ''ativo'')', v_fin, c_admin), 'Só um Administrador');
  perform _t_ok('Gestor de pessoas muda perfil comum', format('select admin_update_staff(%L, %L, null, ''ativo'')', v_fin, c_at));
  perform _t_err('função antiga de adicionar admin exige Administrador',
    format('select admin_add_admin(%L)', (select email from profiles where id = v_new)), 'Só um Administrador');

  -- 7. Perfis ------------------------------------------------------------------------
  perform _t_as(v_a);
  v_role := admin_upsert_role(null, 'Perfil Teste', 'x');
  perform admin_set_role_permissions(v_role, '[{"area":"pedidos","edit":true},{"area":"lojas","view":false}]'::jsonb);
  perform _t_check('editar marca ver junto',
    (select can_view and can_edit and not can_create from staff_role_permissions where role_id = v_role and area = 'pedidos'));
  perform _t_check('área sem nada marcado não fica salva',
    not exists (select 1 from staff_role_permissions where role_id = v_role and area = 'lojas'));
  perform _t_err('área inválida é recusada',
    format('select admin_set_role_permissions(%L, ''[{"area":"xyz","view":true}]''::jsonb)', v_role), 'Área inválida');
  perform _t_err('Administrador não é editável',
    format('select admin_set_role_permissions(%L, ''[]''::jsonb)', c_admin), 'não pode ser alterado');
  perform _t_err('Administrador não é apagável', format('select admin_delete_role(%L)', c_admin), 'não pode ser apagado');
  perform _t_err('nome repetido é recusado', 'select admin_upsert_role(null, ''Operação'', null)', 'Já existe');
  perform _t_err('perfil em uso não é apagado', format('select admin_delete_role(%L)', c_at), 'Há usuários');
  perform _t_ok('perfil vazio é apagado', format('select admin_delete_role(%L)', v_role));

  -- 8. Convites ------------------------------------------------------------------------
  perform _t_as(v_fin);
  perform _t_err('sem Pessoas não convida', format('select admin_create_invite(%L, null)', c_op), 'não permite');
  perform _t_as(v_ppl);
  perform _t_err('quem não é Administrador não convida Administrador',
    format('select admin_create_invite(%L, null)', c_admin), 'Só um Administrador');
  v_token := admin_create_invite(c_op, 'Conferente');
  perform _t_as(null, true);
  r := invite_lookup(v_token);
  perform _t_check('convite: página mostra o perfil', r ->> 'state' = 'valid' and r ->> 'roleName' = 'Operação', r::text);
  perform _t_err('anônimo não aceita convite', format('select accept_staff_invite(%L)', v_token), 'permission denied');
  perform _t_as(v_new);
  perform accept_staff_invite(v_token);
  perform _t_check('aceitar dá o acesso com o perfil e a função',
    (select role_id = c_op and job_title = 'Conferente' and status = 'ativo' from admins where user_id = v_new));
  perform _t_err('convite não vale duas vezes', format('select accept_staff_invite(%L)', v_token), 'já foi usado');
  perform _t_as(v_a);
  v_token := admin_create_invite(c_at, null);
  perform admin_revoke_invite(v_token);
  perform _t_as(v_c);
  perform _t_err('convite revogado', format('select accept_staff_invite(%L)', v_token), 'cancelado');
  perform _t_as(v_a);
  v_token := admin_create_invite(c_at, null);
  perform _t_as(null);
  update staff_invites set expires_at = now() - interval '1 minute' where token = v_token;
  perform _t_as(v_c);
  perform _t_err('convite vencido', format('select accept_staff_invite(%L)', v_token), 'venceu');

  -- 9. Equipe ------------------------------------------------------------------------
  perform _t_as(v_a);
  v_member := admin_upsert_team_member(null, jsonb_build_object(
    'name', 'João Entregador', 'kind', 'entregador', 'phone', '21999999999',
    'linkEmail', (select email from profiles where id = v_new)));
  perform admin_set_team_pay_rules(v_member,
    '[{"kind":"fixo_mensal","amountBRL":1500},{"kind":"por_parada","amountBRL":8,"note":"coleta"},{"kind":"por_km","amountBRL":0.9}]'::jsonb);
  perform _t_check('pessoa ligada à conta', (select user_id = v_new from team_members where id = v_member));
  perform _t_check('3 regras de remuneração', (select count(*) = 3 from team_pay_rules where member_id = v_member));
  perform _t_err('tipo de regra inválido',
    format('select admin_set_team_pay_rules(%L, ''[{"kind":"comissao","amountBRL":1}]''::jsonb)', v_member), 'Confira');
  perform _t_err('valor negativo', format('select admin_set_team_pay_rules(%L, ''[{"kind":"bonus","amountBRL":-1}]''::jsonb)', v_member), 'Confira');
  perform _t_err('mesma conta em duas pessoas',
    format('select admin_upsert_team_member(null, %L::jsonb)', jsonb_build_object('name', 'Outro', 'kind', 'prestador',
      'linkEmail', (select email from profiles where id = v_new))), 'já está ligada');
  perform _t_err('tipo de pessoa inválido',
    'select admin_upsert_team_member(null, ''{"name":"X","kind":"socio"}''::jsonb)', 'Escolha o tipo');
  perform _t_as(v_at);
  perform _t_err('sem Pessoas não cadastra equipe',
    'select admin_upsert_team_member(null, ''{"name":"X","kind":"prestador"}''::jsonb)', 'não permite');

  -- 10. Resultado: o erro abaixo é de propósito e desfaz TUDO ------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
