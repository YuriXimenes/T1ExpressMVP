-- Teste da 0021_partners_receipt.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0020_partners.sql já aplicada.

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
  v_s uuid := gen_random_uuid();   -- loja só de coleta
  v_p uuid := gen_random_uuid();   -- ponto de retirada
  v_onb uuid; v_onb2 uuid;
  v_token text; v_token2 text;
  v_new text;
  r jsonb;
  v_ok int; v_total int; v_fails text;
  v_base jsonb := jsonb_build_object(
    'legalName', 'Loja Teste LTDA', 'tradeName', 'Loja Teste', 'cnpj', '11222333000181',
    'responsibleName', 'Fulano de Tal', 'responsibleCpf', '52998224725', 'responsibleEmail', 'fulano@example.com',
    'responsiblePhone', '(21) 99999-0000', 'street', 'Rua A', 'number', '10', 'city', 'Rio de Janeiro',
    'state', 'RJ', 'termsAccepted', true);
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_s, v_p]) u;
  insert into admins (user_id, role_id) values (v_a, c_admin);

  -- 1. Loja só de coleta: sem recebimento e sem comprovante bancário ------------------------
  perform _t_as(v_a);
  r := admin_start_onboarding(null);
  v_onb := (r ->> 'id')::uuid; v_token := r ->> 'token';
  perform _t_as(v_s);
  perform onboarding_by_token(v_token);
  perform onboarding_save(v_token, v_base || jsonb_build_object('kind', 'coleta'));
  perform onboarding_add_document(v_token, k, 'onboarding/' || v_onb || '/' || k || '.pdf', k || '.pdf', 'application/pdf')
    from unnest(array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco']) k;
  r := onboarding_by_token(v_token);
  perform _t_check('coleta: nada falta sem recebimento nem comprovante bancário',
    jsonb_array_length(r -> 'missing') = 0, (r -> 'missing')::text);
  perform onboarding_submit(v_token);
  perform _t_as(v_a);
  perform admin_review_document(d.id, 'aceito') from partner_documents d where d.onboarding_id = v_onb;
  r := admin_set_onboarding_status(v_onb, 'aprovado');
  v_new := r ->> 'storeCode';
  perform _t_as(null);
  perform _t_check('coleta aprovada: loja oculta, não é ponto de retirada e sem dados de recebimento',
    (select not published and not is_pickup_point and partner_kind = 'coleta' from stores where code = v_new)
    and (select payout = '{}'::jsonb from store_partner_profiles pp join stores s on s.id = pp.store_id where s.code = v_new));

  -- 2. Ponto de retirada: continua exigindo os dois -------------------------------------------
  perform _t_as(v_a);
  r := admin_start_onboarding(null);
  v_onb2 := (r ->> 'id')::uuid; v_token2 := r ->> 'token';
  perform _t_as(v_p);
  perform onboarding_by_token(v_token2);
  perform onboarding_save(v_token2, v_base || jsonb_build_object('kind', 'retirada',
    'hours', jsonb_build_object('1', '10:00-19:00')));
  perform onboarding_add_document(v_token2, k, 'onboarding/' || v_onb2 || '/' || k || '.pdf', k || '.pdf', 'application/pdf')
    from unnest(array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco']) k;
  perform onboarding_add_document(v_token2, 'foto_local', 'onboarding/' || v_onb2 || '/f' || n || '.jpg', 'f.jpg', 'image/jpeg')
    from generate_series(1, 2) n;
  r := onboarding_by_token(v_token2);
  perform _t_check('retirada: falta a forma de recebimento e o comprovante bancário',
    (r -> 'missing')::text like '%Forma de recebimento%' and (r -> 'missing')::text like '%Comprovante bancário%',
    (r -> 'missing')::text);
  perform _t_err('retirada: não envia sem recebimento', format('select onboarding_submit(%L)', v_token2), 'Forma de recebimento');
  perform onboarding_save(v_token2, jsonb_build_object('payout', jsonb_build_object('method', 'pix', 'pixKey', '11222333000181')));
  perform onboarding_add_document(v_token2, 'comprovante_bancario', 'onboarding/' || v_onb2 || '/b.pdf', 'b.pdf', 'application/pdf');
  r := onboarding_by_token(v_token2);
  perform _t_check('retirada completa: nada falta', jsonb_array_length(r -> 'missing') = 0, (r -> 'missing')::text);
  perform onboarding_submit(v_token2);
  perform _t_as(v_a);
  perform admin_review_document(d.id, 'aceito') from partner_documents d
    where d.onboarding_id = v_onb2 and d.kind <> 'comprovante_bancario';
  perform _t_err('retirada: aprovar sem aceitar o comprovante bancário',
    format('select admin_set_onboarding_status(%L, %L)', v_onb2, 'aprovado'), 'Aceite os documentos');
  perform admin_review_document(d.id, 'aceito') from partner_documents d
    where d.onboarding_id = v_onb2 and d.kind = 'comprovante_bancario';
  r := admin_set_onboarding_status(v_onb2, 'aprovado');
  perform _t_as(null);
  perform _t_check('retirada aprovada: guarda o Pix no perfil',
    (select payout ->> 'pixKey' = '11222333000181' and s.is_pickup_point
     from store_partner_profiles pp join stores s on s.id = pp.store_id where s.code = r ->> 'storeCode'));

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
