-- Desfaz 0021: volta as duas funções para como a 0020 deixou.
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
  if coalesce((d ->> 'termsAccepted')::boolean, false) is not true then v := array_append(v, 'Aceite dos termos'); end if;

  foreach k in array array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco', 'comprovante_bancario'] loop
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
      select 1 from unnest(array['cnpj', 'contrato_social', 'doc_responsavel', 'comprovante_endereco',
        'comprovante_bancario']) k
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
            coalesce(d -> 'payout', '{}'::jsonb));
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
