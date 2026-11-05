-- TESTE da 0021 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. A 0020 precisa estar aplicada.
-- Gerado de migrations/0021_partners_receipt.sql + tests/0021_partners_receipt_test.sql.

begin;

-- Ajuste da 0020: recebimento só para ponto de retirada. A T1 só paga pontos de
-- retirada, então loja só de coleta não informa dados de recebimento nem envia
-- comprovante bancário. Precisa da 0020. Ver rollback/0021_down.sql.
-- Só recria duas funções (pode ser aplicada de novo sem efeito colateral).

create or replace function public._onboarding_missing(p_onb uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype;
  d jsonb;
  v text[] := '{}';
  v_kind text;
  v_has_doc boolean;
  k text;
begin
  select * into o from partner_onboardings where id = p_onb;
  d := o.data;
  v_kind := d ->> 'kind';
  if coalesce(btrim(d ->> 'legalName'), '') = '' then v := array_append(v, 'Razão social'); end if;
  if coalesce(btrim(d ->> 'tradeName'), '') = '' then v := array_append(v, 'Nome da loja'); end if;
  if not _valid_cnpj(d ->> 'cnpj') then v := array_append(v, 'CNPJ válido'); end if;
  if coalesce(btrim(d ->> 'responsibleName'), '') = '' then v := array_append(v, 'Nome do responsável'); end if;
  if not _valid_cpf(d ->> 'responsibleCpf') then v := array_append(v, 'CPF válido do responsável'); end if;
  if coalesce(d ->> 'responsibleEmail', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v := array_append(v, 'E-mail do responsável'); end if;
  if char_length(regexp_replace(coalesce(d ->> 'responsiblePhone', ''), '\D', '', 'g')) < 10 then v := array_append(v, 'Telefone do responsável'); end if;
  if coalesce(btrim(d ->> 'street'), '') = '' or coalesce(btrim(d ->> 'number'), '') = ''
     or coalesce(btrim(d ->> 'city'), '') = '' or coalesce(d ->> 'state', '') !~ '^[A-Z]{2}$' then
    v := array_append(v, 'Endereço completo');
  end if;
  if v_kind is null or v_kind not in ('coleta', 'retirada', 'ambos') then v := array_append(v, 'Tipo de parceria'); end if;
  if v_kind in ('retirada', 'ambos') and (jsonb_typeof(d -> 'hours') is distinct from 'object'
      or not exists (select 1 from jsonb_each_text(d -> 'hours') h where btrim(h.value) <> '')) then
    v := array_append(v, 'Horário de atendimento');
  end if;
  -- Só ponto de retirada recebe da T1: coleta pura não informa recebimento.
  if v_kind in ('retirada', 'ambos') then
    if (d -> 'payout' ->> 'method') = 'pix' then
      if coalesce(btrim(d -> 'payout' ->> 'pixKey'), '') = '' then v := array_append(v, 'Chave Pix'); end if;
    elsif (d -> 'payout' ->> 'method') = 'conta' then
      if coalesce(btrim(d -> 'payout' ->> 'bank'), '') = '' or coalesce(btrim(d -> 'payout' ->> 'agency'), '') = ''
         or coalesce(btrim(d -> 'payout' ->> 'account'), '') = '' then
        v := array_append(v, 'Dados da conta bancária');
      end if;
    else
      v := array_append(v, 'Forma de recebimento');
    end if;
  end if;
  if coalesce((d ->> 'termsAccepted')::boolean, false) is not true then v := array_append(v, 'Aceite dos termos'); end if;

  foreach k in array case when v_kind in ('retirada', 'ambos')
      then array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco', 'comprovante_bancario']
      else array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco'] end loop
    select exists (select 1 from partner_documents where onboarding_id = p_onb and kind = k and status <> 'recusado')
      into v_has_doc;
    if not v_has_doc then
      v := array_append(v, 'Documento: ' || case k
        when 'cnpj' then 'Cartão CNPJ ou CCMEI'
        when 'contrato_social' then 'Contrato social ou CCMEI'
        when 'doc_responsavel' then 'Documento com foto do responsável'
        when 'comprovante_endereco' then 'Comprovante de endereço'
        else 'Comprovante bancário' end);
    end if;
  end loop;
  if v_kind in ('retirada', 'ambos') and (select count(*) from partner_documents
      where onboarding_id = p_onb and kind = 'foto_local' and status <> 'recusado') < 2 then
    v := array_append(v, 'Fotos do local (2 ou mais)');
  end if;
  return v;
exception
  when invalid_text_representation then
    return array_append(v, 'Dados inválidos');
end;
$$;

create or replace function public.admin_set_onboarding_status(p_onb uuid, p_status text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype;
  d jsonb;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_store uuid;
  v_code text;
  v_next int;
  v_address text;
begin
  perform _require_perm('kyc', 'editar');
  select * into o from partner_onboardings where id = p_onb for update;
  if not found then
    raise exception 'Onboarding não encontrado.' using errcode = 'P0001';
  end if;
  if o.status in ('aprovado', 'recusado') then
    raise exception 'Este onboarding já foi encerrado.' using errcode = 'P0001';
  end if;
  if p_status not in ('pendencia', 'aprovado', 'recusado') then
    raise exception 'Situação inválida.' using errcode = 'P0001';
  end if;
  if p_status in ('pendencia', 'recusado') and char_length(coalesce(v_msg, '')) < 5 then
    raise exception 'Escreva a mensagem para a loja.' using errcode = 'P0001';
  end if;
  if p_status in ('pendencia', 'aprovado') and o.status <> 'em_analise' then
    raise exception 'Só dá para analisar depois que a loja enviar o cadastro.' using errcode = 'P0001';
  end if;

  if p_status = 'aprovado' then
    if array_length(_onboarding_missing(p_onb), 1) > 0 then
      raise exception 'O cadastro ainda tem itens faltando.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from unnest(case when o.data ->> 'kind' in ('retirada', 'ambos')
        then array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco', 'comprovante_bancario']
        else array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco'] end) k
      where not exists (select 1 from partner_documents where onboarding_id = p_onb and kind = k and status = 'aceito')
    ) or (o.data ->> 'kind' in ('retirada', 'ambos') and (select count(*) from partner_documents
           where onboarding_id = p_onb and kind = 'foto_local' and status = 'aceito') < 2) then
      raise exception 'Aceite os documentos obrigatórios antes de aprovar.' using errcode = 'P0001';
    end if;
    if o.user_id is null then
      raise exception 'Nenhuma conta preencheu este cadastro.' using errcode = 'P0001';
    end if;
    d := o.data;
    v_address := btrim(d ->> 'street') || ', ' || btrim(d ->> 'number')
      || coalesce(' - ' || nullif(btrim(coalesce(d ->> 'complement', '')), ''), '');
    select coalesce(max(substring(code from '^fs-([0-9]+)$')::int), 0) + 1 into v_next from stores;
    v_code := 'fs-' || lpad(v_next::text, 2, '0');
    insert into stores (code, name, address, neighborhood, city, state, is_pickup_point,
                        published, partner_kind, pickup_hours, pickup_capacity)
    values (v_code, left(btrim(d ->> 'tradeName'), 200), left(v_address, 300),
            nullif(btrim(coalesce(d ->> 'neighborhood', '')), ''), left(btrim(d ->> 'city'), 120), d ->> 'state',
            d ->> 'kind' in ('retirada', 'ambos'), false, d ->> 'kind',
            case when jsonb_typeof(d -> 'hours') = 'object' then (select coalesce(jsonb_object_agg(h.key, btrim(h.value)), '{}'::jsonb)
              from jsonb_each_text(d -> 'hours') h where btrim(h.value) <> '') else '{}'::jsonb end,
            case when (d ->> 'capacity') ~ '^[0-9]{1,5}$' and (d ->> 'capacity')::int between 1 and 10000
                 then (d ->> 'capacity')::int end)
    returning id into v_store;
    insert into store_partner_profiles (store_id, legal_name, cnpj, responsible_name, responsible_cpf,
                                        responsible_email, responsible_phone, payout)
    values (v_store, left(d ->> 'legalName', 200), d ->> 'cnpj', left(d ->> 'responsibleName', 200),
            d ->> 'responsibleCpf', left(d ->> 'responsibleEmail', 200), left(d ->> 'responsiblePhone', 30),
            case when d ->> 'kind' in ('retirada', 'ambos') then coalesce(d -> 'payout', '{}'::jsonb)
                 else '{}'::jsonb end);
    insert into store_members (store_id, user_id, role) values (v_store, o.user_id, 'responsavel')
      on conflict (store_id, user_id) do update set role = 'responsavel', active = true;
    update partner_onboardings set status = 'aprovado', message = v_msg, store_id = v_store,
      reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_onb;
    perform _onb_log(p_onb, 'aprovado', v_msg, 'admin');
    return jsonb_build_object('storeCode', v_code);
  end if;

  update partner_onboardings set status = p_status, message = v_msg, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_onb;
  perform _onb_log(p_onb, p_status, v_msg, 'admin');
  return '{}'::jsonb;
end;
$$;

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
