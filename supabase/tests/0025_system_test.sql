-- Teste da 0025_system.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0024 já aplicada.

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
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta 10', 'game', 'magic', 'price', 30,
        'priceMode', 'unit', 'quantity', 1))))));
end;
$$;

create function public._t_notif_has(p_prefix text)
returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(admin_notifications() -> 'items') i
                 where i ->> 'key' like p_prefix || '%');
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_au uuid := gen_random_uuid();   -- só vê Auditoria
  v_f uuid := gen_random_uuid();    -- só vê Despesas
  v_n uuid := gen_random_uuid();    -- só Dashboard
  v_u uuid := gen_random_uuid();    -- cliente
  r_au uuid; r_f uuid; r_n uuid;
  v_dest text; v_s1 text;
  v_member uuid; v_order uuid; v_occ uuid; v_exp uuid; v_cat uuid; v_err uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb; e jsonb; v_unread int;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_au, v_f, v_n, v_u]) u;
  insert into staff_roles (name) values ('Só Auditoria') returning id into r_au;
  insert into staff_roles (name) values ('Só Despesas') returning id into r_f;
  insert into staff_roles (name) values ('Só Dashboard') returning id into r_n;
  insert into staff_role_permissions (role_id, area, can_view) values
    (r_au, 'auditoria', true), (r_f, 'despesas', true), (r_n, 'dashboard', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_au, r_au), (v_f, r_f), (v_n, r_n);
  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  perform _t_check('versão do banco', _schema_version() = '0025');

  -- 1. Auditoria -------------------------------------------------------------------------
  perform _t_as(v_a);
  perform admin_upsert_coupon('T10AUD', '{"type": "flat", "value": 3, "label": "auditoria", "active": true}');
  perform set_config('t1.reason', 'Campanha encerrada', true);
  perform admin_upsert_coupon('T10AUD', '{"type": "flat", "value": 3, "label": "auditoria", "active": false}');
  perform _t_as(null);
  perform _t_check('equipe cria: auditoria "criou" com área e quem fez',
    exists (select 1 from audit_log where table_name = 'coupons' and record_id = 'T10AUD' and action = 'criou'
            and area = 'cupons' and actor_id = v_a and actor_name like 'Teste %' and record_label = 'T10AUD'
            and (changes -> 'value' ->> 'new')::numeric = 3));
  perform _t_check('equipe altera: só o campo que mudou, com antes, depois e motivo',
    (select changes ? 'active' and not changes ? 'label' and changes -> 'active' ->> 'old' = 'true'
            and changes -> 'active' ->> 'new' = 'false' and reason = 'Campanha encerrada'
     from audit_log where table_name = 'coupons' and record_id = 'T10AUD' and action = 'alterou'));

  perform _t_as(v_u);
  v_order := _t_order(array[v_s1], v_dest);
  perform pay_order(v_order, 'pix');
  perform _t_as(null);
  perform _t_check('ação do cliente (criar e pagar pedido) não entra na auditoria',
    not exists (select 1 from audit_log where table_name = 'orders' and record_id = v_order::text));
  update orders set created_at = created_at - interval '2 days' where id = v_order;

  -- Campo sensível: grava que mudou, sem o valor.
  insert into team_members (name, kind) values ('Pessoa Auditada', 'funcionario') returning id into v_member;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  update team_members set pix_key = 'chave-secreta@pix', notes = 'nota visível' where id = v_member;
  perform set_config('request.jwt.claims', '{}', true);
  perform _t_check('chave Pix mascarada, nota normal',
    (select changes -> 'pix_key' ->> 'new' = '•••' and changes -> 'notes' ->> 'new' = 'nota visível'
            and record_label = 'Pessoa Auditada' and area = 'pessoas'
     from audit_log where table_name = 'team_members' and record_id = v_member::text and action = 'alterou'));
  perform _t_check('CPF, dados do formulário e token mascarados; "contacted" não',
    _audit_value('responsible_cpf', '"12345678901"') = '"•••"' and _audit_value('data', '{"a":1}') = '"•••"'
    and _audit_value('token', '"abc"') = '"•••"' and _audit_value('contacted', 'true') = 'true');

  perform _t_as(v_au);
  r := admin_audit('{}');
  perform _t_check('quem vê Auditoria lê o registro', jsonb_array_length(r -> 'items') >= 3
    and exists (select 1 from jsonb_array_elements(r -> 'actors') a where (a ->> 'id')::uuid = v_a));
  r := admin_audit(jsonb_build_object('area', 'cupons', 'action', 'alterou', 'from', v_today, 'to', v_today));
  perform _t_check('filtro por área, ação e período',
    jsonb_array_length(r -> 'items') >= 1
    and not exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'area' <> 'cupons' or i ->> 'action' <> 'alterou'));
  r := admin_audit(jsonb_build_object('q', 'Campanha encerrada'));
  perform _t_check('busca pelo motivo', exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'recordId' = 'T10AUD'));
  perform _t_err('equipe não lê a tabela por fora', 'select count(*) from audit_log', 'permission denied');
  perform _t_as(v_n);
  perform _t_err('sem Auditoria não lê', 'select admin_audit(''{}'')', 'não permite');

  -- 2. Sino --------------------------------------------------------------------------------
  perform _t_as(v_a);
  r := admin_open_occurrence(jsonb_build_object('typeId', (select id from occurrence_types where name = 'Carta faltando'),
    'orderId', v_order, 'description', 'Teste do sino da entrega 10'));
  v_occ := (r ->> 'id')::uuid;
  perform _t_check('ocorrência aberta aparece no sino', _t_notif_has('occ:' || v_occ || ':aberta'));
  v_unread := (admin_notifications() ->> 'unread')::int;
  perform admin_mark_notifications(array['occ:' || v_occ || ':aberta']);
  r := admin_notifications();
  perform _t_check('marcar como lido baixa o contador',
    (r ->> 'unread')::int = v_unread - 1
    and (select (i ->> 'read')::boolean from jsonb_array_elements(r -> 'items') i where i ->> 'key' = 'occ:' || v_occ || ':aberta'));
  perform _t_as(null);
  update occurrences set due_at = now() + interval '2 hours' where id = v_occ;
  perform _t_as(v_a);
  r := admin_notifications();
  perform _t_check('mudou de estado (vencendo): volta como não lido e urgente',
    exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'key' = 'occ_due:' || v_occ || ':vence'
            and not (i ->> 'read')::boolean and i ->> 'severity' = 'alta')
    and r -> 'items' -> 0 ->> 'severity' = 'alta');

  select id into v_cat from expense_categories where active order by name limit 1;
  v_exp := admin_save_expense(null, jsonb_build_object('categoryId', v_cat, 'description', 'Despesa do sino',
    'amount', 42, 'competence', v_today));
  perform _t_as(v_f);
  perform _t_check('quem vê Despesas recebe a despesa pendente', _t_notif_has('exp:' || v_exp));
  perform _t_check('e não recebe avisos de Operação', not _t_notif_has('occ'));
  perform _t_as(v_a);
  perform admin_review_expense(v_exp, true);
  perform _t_as(v_f);
  perform _t_check('resolveu (aprovada): o aviso some', not _t_notif_has('exp:' || v_exp));
  perform _t_as(v_u);
  perform _t_err('cliente não usa o sino', 'select admin_notifications()', 'restrito');

  -- 3. Erros -----------------------------------------------------------------------------------
  perform _t_as(null, true);
  perform log_client_error('{"source": "site", "message": "Falha ao carregar pedido 123", "path": "/pedido", "stack": "Error\n    at Foo (app.js:10:5)"}');
  perform log_client_error('{"source": "site", "message": "Falha ao carregar pedido 456", "path": "/pedido", "stack": "Error\n    at Foo (app.js:99:7)"}');
  perform log_client_error('{"source": "site", "message": "Script error."}');
  perform log_client_error('{"source": "admin", "message": "x", "stack": "at y (chrome-extension://abc/z.js:1:1)"}');
  perform log_client_error('{"source": "hacker", "message": "x"}');
  perform _t_err('visitante não lê os erros', 'select count(*) from app_errors', 'permission denied');
  perform _t_as(null);
  select id into v_err from app_errors where message like 'Falha ao carregar pedido%';
  perform _t_check('mesmo erro com números diferentes agrupa e conta',
    (select count(*) = 1 and sum(occurrences) = 2 from app_errors where message like 'Falha ao carregar pedido%'));
  perform _t_check('ruído e origem inválida não entram',
    not exists (select 1 from app_errors where message in ('Script error.', 'x')));
  perform _t_as(v_a);
  perform admin_resolve_error(v_err);
  perform _t_as(null, true);
  perform log_client_error('{"source": "site", "message": "Falha ao carregar pedido 789", "stack": "Error\n    at Foo (app.js:1:1)"}');
  perform _t_as(null);
  perform _t_check('erro resolvido que volta reabre sozinho',
    (select status = 'aberto' and reopened and occurrences = 3 from app_errors where id = v_err));
  insert into app_errors (fingerprint, source, message) select 'flood' || g, 'site', 'flood' from generate_series(1, 200) g;
  perform _t_as(null, true);
  perform log_client_error('{"source": "site", "message": "Erro novo depois da enxurrada"}');
  perform _t_as(null);
  perform _t_check('limite de erros novos por hora', not exists (select 1 from app_errors where message = 'Erro novo depois da enxurrada'));
  perform _t_as(v_a);
  perform _t_check('admin lista os erros', exists (select 1 from jsonb_array_elements(admin_errors('aberto')) x where (x ->> 'id')::uuid = v_err));
  r := system_health();
  perform _t_check('saúde do sistema', r ->> 'schemaVersion' = '0025' and (r ->> 'openErrors')::int >= 1
    and (r -> 'buckets') ? 'order-photos', r::text);
  perform _t_as(v_n);
  perform _t_err('sem Integrações não lê erros', 'select admin_errors()', 'não permite');
  perform _t_err('sem Integrações não resolve', format('select admin_resolve_error(%L)', v_err), 'não permite');

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
