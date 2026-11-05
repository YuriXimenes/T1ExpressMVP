-- Backoffice, entrega 7: parceiros, KYC (onboarding de lojas) e área da loja.
-- Precisa da 0014 a 0019. Ver rollback/0020_down.sql.
--
-- Fluxo: lead do formulário → admin gera o link de onboarding → a loja cria a
-- conta e preenche dados e documentos → análise (pendência, aprovado, recusado)
-- → aprovada, vira loja no cadastro (oculta no site até publicar) e o
-- responsável ganha acesso à área da loja. A loja recebe pelas regras de
-- remuneração dela; o pagamento do mês sai no 5º dia útil do mês seguinte.

-- ---------------------------------------------------------------------------
-- 1. Lojas: publicada no site + perfil do parceiro (dados só do admin)
-- ---------------------------------------------------------------------------
alter table stores add column published boolean not null default true;
alter table stores add column partner_kind text check (partner_kind in ('coleta', 'retirada', 'ambos'));

-- Separado de stores: stores é lida pelo site (anon); CNPJ e dados de pagamento não.
create table store_partner_profiles (
  store_id uuid primary key references stores(id) on delete cascade,
  legal_name text check (coalesce(char_length(legal_name), 0) <= 200),
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  responsible_name text check (coalesce(char_length(responsible_name), 0) <= 200),
  responsible_cpf text check (responsible_cpf is null or responsible_cpf ~ '^[0-9]{11}$'),
  responsible_email text check (coalesce(char_length(responsible_email), 0) <= 200),
  responsible_phone text check (coalesce(char_length(responsible_phone), 0) <= 30),
  payout jsonb not null default '{}'::jsonb,
  notes text check (coalesce(char_length(notes), 0) <= 2000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Onboarding (KYC)
-- ---------------------------------------------------------------------------
create table partner_onboardings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references partner_leads(id) on delete set null,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  token_expires_at timestamptz not null default now() + interval '30 days',
  user_id uuid references profiles(id) on delete set null,
  status text not null default 'aguardando_preenchimento' check (status in (
    'aguardando_preenchimento', 'em_analise', 'pendencia', 'aprovado', 'recusado')),
  data jsonb not null default '{}'::jsonb,
  message text check (coalesce(char_length(message), 0) <= 2000),
  submitted_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  store_id uuid references stores(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_onboardings_status_idx on partner_onboardings (status);
create index partner_onboardings_user_idx on partner_onboardings (user_id);

-- Arquivos no bucket partner-docs, em "onboarding/<onboarding>/<arquivo>".
create table partner_documents (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references partner_onboardings(id) on delete cascade,
  kind text not null check (kind in ('cnpj', 'contrato_social', 'doc_responsavel',
    'comprovante_endereco', 'comprovante_bancario', 'foto_local', 'alvara')),
  path text not null unique check (char_length(path) <= 300),
  name text check (coalesce(char_length(name), 0) <= 160),
  mime text check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado')),
  review_note text check (coalesce(char_length(review_note), 0) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index partner_documents_onb_idx on partner_documents (onboarding_id);

create table partner_onboarding_events (
  id bigint generated always as identity primary key,
  onboarding_id uuid not null references partner_onboardings(id) on delete cascade,
  kind text not null check (kind in ('criado', 'link_renovado', 'preenchendo', 'enviado',
    'documento', 'pendencia', 'aprovado', 'recusado')),
  note text check (coalesce(char_length(note), 0) <= 2000),
  actor_kind text not null check (actor_kind in ('admin', 'store', 'system')),
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index partner_onboarding_events_onb_idx on partner_onboarding_events (onboarding_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Acessos da loja
-- ---------------------------------------------------------------------------
create table store_members (
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('responsavel', 'funcionario')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_idx on store_members (user_id);

create table store_invites (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  store_id uuid not null references stores(id) on delete cascade,
  role text not null check (role in ('responsavel', 'funcionario')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null,
  revoked_at timestamptz
);
create index store_invites_store_idx on store_invites (store_id);

-- ---------------------------------------------------------------------------
-- 4. Remuneração e pagamentos
-- ---------------------------------------------------------------------------
-- percentual_frete: amount é o percentual (ex.: 5 = 5% do frete dos retirados).
create table store_pay_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  kind text not null check (kind in ('por_retirada', 'por_coleta', 'por_pacote_dia',
    'percentual_frete', 'bonus_mensal')),
  amount numeric(10,2) not null check (amount >= 0),
  note text check (coalesce(char_length(note), 0) <= 200),
  sort_order int not null default 0
);
create index store_pay_rules_store_idx on store_pay_rules (store_id);

create table store_payouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_brl numeric(10,2) not null check (amount_brl >= 0),
  paid_at date not null,
  receipt_path text check (coalesce(char_length(receipt_path), 0) <= 300),
  note text check (coalesce(char_length(note), 0) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (store_id, month)
);

-- ---------------------------------------------------------------------------
-- 5. Acesso (admin lê direto; loja e parceiro só pelas funções)
-- ---------------------------------------------------------------------------
alter table store_partner_profiles enable row level security;
alter table partner_onboardings enable row level security;
alter table partner_documents enable row level security;
alter table partner_onboarding_events enable row level security;
alter table store_members enable row level security;
alter table store_invites enable row level security;
alter table store_pay_rules enable row level security;
alter table store_payouts enable row level security;

create policy "staff read partner profiles" on store_partner_profiles for select using (has_perm('lojas', 'ver'));
create policy "staff read onboardings" on partner_onboardings for select using (has_any_perm(array['kyc', 'lojas'], 'ver'));
create policy "staff read partner documents" on partner_documents for select using (has_any_perm(array['kyc', 'lojas'], 'ver'));
create policy "staff read onboarding events" on partner_onboarding_events for select using (has_any_perm(array['kyc', 'lojas'], 'ver'));
create policy "staff read store members" on store_members for select using (has_perm('lojas', 'ver'));
create policy "staff read store invites" on store_invites for select using (has_perm('lojas', 'ver'));
create policy "staff read store pay rules" on store_pay_rules for select using (has_perm('lojas', 'ver'));
create policy "staff read store payouts" on store_payouts for select using (has_perm('lojas', 'ver'));

revoke insert, update, delete on store_partner_profiles, partner_onboardings, partner_documents,
  partner_onboarding_events, store_members, store_invites, store_pay_rules, store_payouts
  from anon, authenticated;
revoke select on store_partner_profiles, partner_onboardings, partner_documents,
  partner_onboarding_events, store_members, store_invites, store_pay_rules, store_payouts
  from anon;

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------
create or replace function public._new_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

-- Dígitos verificadores (Receita Federal).
create or replace function public._valid_cpf(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  d int[];
  s int;
  r int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^(.)\1{10}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 11) i;
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

create or replace function public._valid_cnpj(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  d int[];
  w1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  s int;
  r int;
begin
  if p is null or p !~ '^[0-9]{14}$' or p ~ '^(.)\1{13}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 14) i;
  s := 0;
  for i in 1..12 loop s := s + d[i] * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> d[13] then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + d[i] * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = d[14];
end;
$$;

-- n-ésimo dia útil (seg a sex, sem feriado) do mês de p_month.
create or replace function public._nth_business_day(p_month date, p_n int)
returns date
language plpgsql
immutable
as $$
declare
  v_day date := date_trunc('month', p_month)::date - 1;
  v_count int := 0;
begin
  while v_count < p_n loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 and not _is_holiday(v_day) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_day;
end;
$$;

-- Loja de quem está logado (membro ativo). Owner = só o responsável.
create or replace function public._store_member_id(p_code text, p_owner boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre com a conta da loja.' using errcode = 'P0001';
  end if;
  select s.id into v_store
    from stores s join store_members m on m.store_id = s.id
    where s.code = p_code and m.user_id = auth.uid() and m.active
      and (not p_owner or m.role = 'responsavel');
  if v_store is null then
    raise exception 'Sem acesso a esta loja.' using errcode = 'P0001';
  end if;
  return v_store;
end;
$$;

create or replace function public._onb_log(p_onb uuid, p_kind text, p_note text, p_actor text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into partner_onboarding_events (onboarding_id, kind, note, actor_kind, actor_id)
  values (p_onb, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_actor,
          case when p_actor = 'system' then null else auth.uid() end);
  update partner_onboardings set updated_at = now() where id = p_onb;
$$;

-- O que falta para enviar (rótulos prontos para a tela).
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

-- Limites do mês (Brasília).
create or replace function public._month_start(p_month date)
returns timestamptz
language sql
immutable
as $$
  select (date_trunc('month', p_month)::date)::timestamp at time zone 'America/Sao_Paulo';
$$;

-- Extrato da loja no mês: fatos do mês × regras de remuneração.
create or replace function public._store_statement(p_store uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := _month_start(p_month);
  v_end timestamptz := _month_start((date_trunc('month', p_month) + interval '1 month')::date);
  v_pickups int; v_freight numeric; v_collects int; v_days numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  r store_pay_rules%rowtype;
  v_qty numeric; v_line numeric;
  p store_payouts%rowtype;
begin
  select count(*), coalesce(sum(o.freight_after_discount_brl), 0) into v_pickups, v_freight
    from order_pickups op join orders o on o.id = op.order_id
    where o.destination_store_id = p_store and op.used_at >= v_start and op.used_at < v_end;
  select count(distinct so.order_id) into v_collects
    from route_stop_orders so join route_stops s on s.id = so.stop_id join routes ro on ro.id = s.route_id
    where s.store_id = p_store and ro.kind = 'coleta' and so.result = 'coletado'
      and s.done_at >= v_start and s.done_at < v_end;
  select coalesce(sum(floor(greatest(0, extract(epoch from
           least(coalesce(op.used_at, now()), v_end) - greatest(op.available_at, v_start))) / 86400)), 0)
    into v_days
    from order_pickups op join orders o on o.id = op.order_id
    where o.destination_store_id = p_store and op.available_at is not null
      and op.available_at < v_end and coalesce(op.used_at, now()) > v_start;

  for r in select * from store_pay_rules where store_id = p_store order by sort_order, kind loop
    v_qty := case r.kind
      when 'por_retirada' then v_pickups
      when 'por_coleta' then v_collects
      when 'por_pacote_dia' then v_days
      when 'percentual_frete' then v_freight
      else 1 end;
    v_line := round(case when r.kind = 'percentual_frete' then v_freight * r.amount / 100
                         else r.amount * v_qty end, 2);
    v_total := v_total + v_line;
    v_lines := v_lines || jsonb_build_object('kind', r.kind, 'amount', r.amount, 'qty', v_qty,
      'total', v_line, 'note', r.note);
  end loop;

  select * into p from store_payouts where store_id = p_store and month = date_trunc('month', p_month)::date;
  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'pickups', v_pickups, 'collects', v_collects, 'storageDays', v_days, 'pickupFreight', v_freight,
    'lines', v_lines, 'total', round(v_total, 2),
    'payout', case when p.id is null then null else jsonb_build_object(
      'amount', p.amount_brl, 'paidAt', p.paid_at, 'receiptPath', p.receipt_path, 'note', p.note) end
  );
end;
$$;

-- Mês atual, anterior, histórico e próximo recebimento (5º dia útil do mês seguinte).
create or replace function public._store_finance(p_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cur date := date_trunc('month', v_today)::date;
  v_prev date := (v_cur - interval '1 month')::date;
  v_cur_s jsonb := _store_statement(p_store, v_cur);
  v_prev_s jsonb := _store_statement(p_store, v_prev);
  v_due date := _nth_business_day(v_cur, 5);
  v_next jsonb;
  v_hist jsonb := '[]'::jsonb;
begin
  if (v_prev_s ->> 'total')::numeric > 0 and v_prev_s -> 'payout' = 'null'::jsonb then
    v_next := jsonb_build_object('date', v_due, 'amount', v_prev_s -> 'total', 'month', v_prev_s -> 'month',
      'estimated', false, 'late', v_today > v_due);
  else
    v_next := jsonb_build_object('date', _nth_business_day((v_cur + interval '1 month')::date, 5),
      'amount', v_cur_s -> 'total', 'month', v_cur_s -> 'month', 'estimated', true, 'late', false);
  end if;
  for i in 1..6 loop
    v_hist := v_hist || _store_statement(p_store, (v_cur - make_interval(months => i))::date);
  end loop;
  return jsonb_build_object('current', v_cur_s, 'previous', v_prev_s, 'next', v_next, 'history', v_hist);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Onboarding: admin
-- ---------------------------------------------------------------------------
create or replace function public._onboarding_json(p_onb uuid, p_admin boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'data', o.data,
    'message', o.message,
    'tokenExpiresAt', o.token_expires_at,
    'token', case when p_admin then o.token end,
    'leadId', case when p_admin then o.lead_id end,
    'userEmail', case when p_admin then u.email end,
    'storeCode', s.code,
    'submittedAt', o.submitted_at,
    'reviewedAt', o.reviewed_at,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'missing', to_jsonb(_onboarding_missing(o.id)),
    'documents', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', d.id, 'kind', d.kind, 'path', d.path,
        'name', d.name, 'mime', d.mime, 'status', d.status, 'reviewNote', d.review_note,
        'createdAt', d.created_at)) order by d.created_at)
      from partner_documents d where d.onboarding_id = o.id), '[]'::jsonb),
    'events', case when p_admin then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', e.kind, 'note', e.note,
        'actorKind', e.actor_kind, 'actorName', pr.name, 'createdAt', e.created_at)) order by e.created_at, e.id)
      from partner_onboarding_events e left join profiles pr on pr.id = e.actor_id
      where e.onboarding_id = o.id), '[]'::jsonb) end
  ))
  from partner_onboardings o
  left join profiles u on u.id = o.user_id
  left join stores s on s.id = o.store_id
  where o.id = p_onb;
$$;

-- Gera o link (a partir de um lead do formulário, ou em branco).
create or replace function public.admin_start_onboarding(p_lead uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l partner_leads%rowtype;
  v_id uuid;
  v_token text := _new_token();
  v_data jsonb := '{}'::jsonb;
begin
  perform _require_perm('kyc', 'criar');
  if p_lead is not null then
    select * into l from partner_leads where id = p_lead;
    if not found then
      raise exception 'Formulário não encontrado.' using errcode = 'P0001';
    end if;
    if exists (select 1 from partner_onboardings where lead_id = p_lead and status not in ('recusado')) then
      raise exception 'Este formulário já tem um onboarding em andamento.' using errcode = 'P0001';
    end if;
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'tradeName', l.store_name, 'responsibleName', l.contact_name,
      'responsibleEmail', l.contact_email, 'responsiblePhone', l.contact_phone,
      'street', l.street, 'number', l.number, 'complement', l.complement,
      'city', l.city, 'state', l.state,
      'kind', case when l.wants_pickup and l.wants_dropoff then 'ambos'
                   when l.wants_dropoff then 'retirada' else 'coleta' end));
    update partner_leads set contacted = true where id = p_lead;
  end if;
  insert into partner_onboardings (lead_id, token, data, created_by)
  values (p_lead, v_token, v_data, auth.uid())
  returning id into v_id;
  perform _onb_log(v_id, 'criado', null, 'admin');
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.admin_onboardings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('kyc', 'ver');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', o.id, 'status', o.status,
      'tradeName', o.data ->> 'tradeName', 'kind', o.data ->> 'kind', 'city', o.data ->> 'city',
      'responsibleName', o.data ->> 'responsibleName',
      'storeCode', s.code, 'tokenExpiresAt', o.token_expires_at,
      'submittedAt', o.submitted_at, 'createdAt', o.created_at, 'updatedAt', o.updated_at,
      'pendingDocs', (select count(*) from partner_documents d where d.onboarding_id = o.id and d.status = 'pendente')
    )) order by o.updated_at desc)
    from partner_onboardings o left join stores s on s.id = o.store_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_onboarding(p_onb uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('kyc', 'ver');
  if not exists (select 1 from partner_onboardings where id = p_onb) then
    raise exception 'Onboarding não encontrado.' using errcode = 'P0001';
  end if;
  return _onboarding_json(p_onb, true);
end;
$$;

create or replace function public.admin_renew_onboarding_link(p_onb uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := _new_token();
begin
  perform _require_perm('kyc', 'editar');
  update partner_onboardings set token = v_token, token_expires_at = now() + interval '30 days'
    where id = p_onb and status not in ('aprovado', 'recusado');
  if not found then
    raise exception 'Só dá para renovar o link de um onboarding em andamento.' using errcode = 'P0001';
  end if;
  perform _onb_log(p_onb, 'link_renovado', null, 'admin');
  return v_token;
end;
$$;

create or replace function public.admin_review_document(p_doc uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onb uuid;
begin
  perform _require_perm('kyc', 'editar');
  if p_status not in ('pendente', 'aceito', 'recusado') then
    raise exception 'Situação inválida.' using errcode = 'P0001';
  end if;
  if p_status = 'recusado' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Diga por que o documento foi recusado.' using errcode = 'P0001';
  end if;
  update partner_documents set status = p_status, review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_at = now()
    where id = p_doc
    returning onboarding_id into v_onb;
  if v_onb is null then
    raise exception 'Documento não encontrado.' using errcode = 'P0001';
  end if;
  update partner_onboardings set updated_at = now() where id = v_onb;
end;
$$;

-- Pendência, recusa ou aprovação. Aprovar cria a loja (oculta no site) e dá o
-- acesso de responsável a quem preencheu.
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

-- ---------------------------------------------------------------------------
-- 8. Onboarding: a loja preenchendo pelo link
-- ---------------------------------------------------------------------------
-- Antes do login: o link vale? (para mostrar "entre ou crie sua conta").
create or replace function public.onboarding_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('found', true, 'tradeName', o.data ->> 'tradeName', 'status', o.status,
      'expired', o.token_expires_at < now() and o.status in ('aguardando_preenchimento', 'pendencia'))
    from partner_onboardings o where o.token = p_token
  ), jsonb_build_object('found', false));
$$;

create or replace function public._onboarding_of_token(p_token text, p_editable boolean)
returns partner_onboardings
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Entre ou crie sua conta para continuar.' using errcode = 'P0001';
  end if;
  select * into o from partner_onboardings where token = p_token for update;
  if not found then
    raise exception 'Link de cadastro inválido.' using errcode = 'P0001';
  end if;
  if o.user_id is null then
    if o.token_expires_at < now() then
      raise exception 'Este link expirou. Peça um novo para a T1 Express.' using errcode = 'P0001';
    end if;
    update partner_onboardings set user_id = auth.uid() where id = o.id;
    o.user_id := auth.uid();
    perform _onb_log(o.id, 'preenchendo', null, 'store');
  elsif o.user_id <> auth.uid() then
    raise exception 'Este cadastro está ligado a outra conta.' using errcode = 'P0001';
  end if;
  if p_editable and o.status not in ('aguardando_preenchimento', 'pendencia') then
    raise exception 'O cadastro já foi enviado e está com a T1 Express.' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

create or replace function public.onboarding_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype := _onboarding_of_token(p_token, false);
begin
  return _onboarding_json(o.id, false);
end;
$$;

-- Guarda o rascunho (só os campos conhecidos, com limite de tamanho).
create or replace function public.onboarding_save(p_token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype := _onboarding_of_token(p_token, true);
  v jsonb := '{}'::jsonb;
  k text;
  v_hours jsonb := '{}'::jsonb;
  v_payout jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Dados inválidos.' using errcode = 'P0001';
  end if;
  foreach k in array array['legalName', 'tradeName', 'responsibleName', 'responsibleEmail', 'responsiblePhone',
    'street', 'number', 'complement', 'neighborhood', 'city', 'zip', 'notes'] loop
    if p ? k then
      v := v || jsonb_build_object(k, left(btrim(coalesce(p ->> k, '')), case when k = 'notes' then 1000 else 200 end));
    end if;
  end loop;
  if p ? 'cnpj' then v := v || jsonb_build_object('cnpj', regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g')); end if;
  if p ? 'responsibleCpf' then
    v := v || jsonb_build_object('responsibleCpf', regexp_replace(coalesce(p ->> 'responsibleCpf', ''), '\D', '', 'g'));
  end if;
  if p ? 'state' then v := v || jsonb_build_object('state', upper(left(btrim(coalesce(p ->> 'state', '')), 2))); end if;
  if p ? 'kind' then
    if p ->> 'kind' not in ('coleta', 'retirada', 'ambos') then
      raise exception 'Tipo de parceria inválido.' using errcode = 'P0001';
    end if;
    v := v || jsonb_build_object('kind', p ->> 'kind');
  end if;
  if p ? 'capacity' then v := v || jsonb_build_object('capacity', left(coalesce(p ->> 'capacity', ''), 6)); end if;
  if p ? 'termsAccepted' then v := v || jsonb_build_object('termsAccepted', coalesce((p ->> 'termsAccepted')::boolean, false)); end if;
  if jsonb_typeof(p -> 'games') = 'array' then
    v := v || jsonb_build_object('games', (select coalesce(jsonb_agg(left(x, 40)), '[]'::jsonb)
      from (select jsonb_array_elements_text(p -> 'games') x limit 12) g));
  end if;
  if jsonb_typeof(p -> 'hours') = 'object' then
    for k in select jsonb_object_keys(p -> 'hours') loop
      if k in ('0', '1', '2', '3', '4', '5', '6') then
        v_hours := v_hours || jsonb_build_object(k, left(btrim(coalesce(p -> 'hours' ->> k, '')), 40));
      end if;
    end loop;
    v := v || jsonb_build_object('hours', v_hours);
  end if;
  if jsonb_typeof(p -> 'payout') = 'object' then
    foreach k in array array['method', 'pixKey', 'bank', 'agency', 'account', 'holder'] loop
      v_payout := v_payout || jsonb_build_object(k, left(btrim(coalesce(p -> 'payout' ->> k, '')), 120));
    end loop;
    v := v || jsonb_build_object('payout', v_payout);
  end if;
  update partner_onboardings set data = data || v, updated_at = now() where id = o.id;
exception
  when invalid_text_representation then
    raise exception 'Dados inválidos.' using errcode = 'P0001';
end;
$$;

-- O arquivo já foi enviado para "onboarding/<id>/..."; aqui só registramos.
create or replace function public.onboarding_add_document(p_token text, p_kind text, p_path text,
  p_name text, p_mime text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype := _onboarding_of_token(p_token, true);
  v_id uuid;
begin
  if p_path is null or p_path not like 'onboarding/' || o.id || '/%' or p_path like '%..%' then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if (select count(*) from partner_documents where onboarding_id = o.id) >= 30 then
    raise exception 'Limite de arquivos atingido.' using errcode = 'P0001';
  end if;
  insert into partner_documents (onboarding_id, kind, path, name, mime)
  values (o.id, p_kind, p_path, left(p_name, 160), p_mime)
  returning id into v_id;
  return v_id;
exception
  when check_violation then
    raise exception 'Tipo de documento ou de arquivo não aceito (use foto ou PDF).' using errcode = 'P0001';
end;
$$;

-- Tira um arquivo ainda não aceito (o navegador apaga do bucket depois).
create or replace function public.onboarding_remove_document(p_token text, p_doc uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype := _onboarding_of_token(p_token, true);
  v_path text;
begin
  delete from partner_documents where id = p_doc and onboarding_id = o.id and status <> 'aceito'
    returning path into v_path;
  if v_path is null then
    raise exception 'Este documento não pode ser removido.' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

create or replace function public.onboarding_submit(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o partner_onboardings%rowtype := _onboarding_of_token(p_token, true);
  v_missing text[] := _onboarding_missing(o.id);
begin
  if array_length(v_missing, 1) > 0 then
    raise exception 'Falta preencher: %.', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  update partner_onboardings set status = 'em_analise', submitted_at = now(), updated_at = now()
    where id = o.id;
  perform _onb_log(o.id, 'enviado',
    case when o.status = 'pendencia' then 'Pendência corrigida e reenviada.' end, 'store');
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Ficha da loja (admin): dados, KYC, remuneração, financeiro e acessos
-- ---------------------------------------------------------------------------
create or replace function public._store_members_json(p_store uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', p.name, 'email', p.email,
    'role', m.role, 'active', m.active, 'createdAt', m.created_at) order by m.role desc, p.name), '[]'::jsonb)
  from store_members m join profiles p on p.id = m.user_id
  where m.store_id = p_store;
$$;

create or replace function public.admin_store_profile(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s stores%rowtype;
  pp store_partner_profiles%rowtype;
  v_onb uuid;
begin
  perform _require_perm('lojas', 'ver');
  select * into s from stores where code = p_code;
  if not found then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
  select * into pp from store_partner_profiles where store_id = s.id;
  select id into v_onb from partner_onboardings where store_id = s.id order by created_at desc limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'id', s.id, 'code', s.code, 'name', s.name, 'address', s.address, 'neighborhood', s.neighborhood,
    'city', s.city, 'state', s.state, 'isPickupPoint', s.is_pickup_point, 'published', s.published,
    'partnerKind', s.partner_kind, 'hasCoordinates', s.lat is not null,
    'profile', case when pp.store_id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'legalName', pp.legal_name, 'cnpj', pp.cnpj, 'responsibleName', pp.responsible_name,
      'responsibleCpf', pp.responsible_cpf, 'responsibleEmail', pp.responsible_email,
      'responsiblePhone', pp.responsible_phone, 'payout', pp.payout, 'notes', pp.notes)) end,
    'onboarding', case when v_onb is null then null else _onboarding_json(v_onb, true) end,
    'payRules', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'kind', r.kind,
      'amount', r.amount, 'note', r.note)) order by r.sort_order, r.kind)
      from store_pay_rules r where r.store_id = s.id), '[]'::jsonb),
    'finance', _store_finance(s.id),
    'members', _store_members_json(s.id),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('token', i.token, 'role', i.role,
      'expiresAt', i.expires_at) order by i.created_at desc)
      from store_invites i where i.store_id = s.id and i.used_at is null and i.revoked_at is null
        and i.expires_at > now()), '[]'::jsonb),
    'openOccurrences', (select count(*) from occurrences c where c.store_id = s.id and c.status in ('aberta', 'em_analise'))
  ));
end;
$$;

create or replace function public.admin_set_store_published(p_code text, p_published boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('lojas', 'editar');
  update stores set published = p_published where code = p_code;
  if not found then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- p: [{ kind, amount, note? }] substitui todas as regras da loja.
create or replace function public.admin_set_store_pay_rules(p_code text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  r jsonb;
  v_pos int := 0;
begin
  perform _require_perm('lojas', 'editar');
  select id into v_store from stores where code = p_code;
  if v_store is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 20 then
    raise exception 'Regras inválidas.' using errcode = 'P0001';
  end if;
  delete from store_pay_rules where store_id = v_store;
  for r in select value from jsonb_array_elements(p) loop
    v_pos := v_pos + 1;
    if (r ->> 'kind') = 'percentual_frete' and (r ->> 'amount')::numeric > 100 then
      raise exception 'Percentual acima de 100%%.' using errcode = 'P0001';
    end if;
    insert into store_pay_rules (store_id, kind, amount, note, sort_order)
    values (v_store, r ->> 'kind', (r ->> 'amount')::numeric, nullif(btrim(coalesce(r ->> 'note', '')), ''), v_pos);
  end loop;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception 'Confira as regras: tipo e valor (zero ou mais).' using errcode = 'P0001';
end;
$$;

-- Registra (ou corrige) o pagamento do mês. Comprovante já enviado ao bucket.
create or replace function public.admin_register_payout(p_code text, p_month date, p_amount numeric,
  p_paid_at date, p_receipt text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  perform _require_perm('lojas', 'editar');
  select id into v_store from stores where code = p_code;
  if v_store is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
  if p_month is null or p_paid_at is null or p_amount is null or p_amount < 0 then
    raise exception 'Informe o mês, o valor e a data do pagamento.' using errcode = 'P0001';
  end if;
  if p_receipt is not null and p_receipt not like 'payouts/' || v_store || '/%' then
    raise exception 'Comprovante inválido.' using errcode = 'P0001';
  end if;
  insert into store_payouts (store_id, month, amount_brl, paid_at, receipt_path, note, created_by)
  values (v_store, date_trunc('month', p_month)::date, round(p_amount, 2), p_paid_at, p_receipt,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (store_id, month) do update set amount_brl = excluded.amount_brl, paid_at = excluded.paid_at,
    receipt_path = coalesce(excluded.receipt_path, store_payouts.receipt_path), note = excluded.note;
end;
$$;

-- Convite por link para a loja (lojas que já operam ganham acesso por aqui).
create or replace function public.admin_store_invite(p_code text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_token text := _new_token();
begin
  perform _require_perm('lojas', 'editar');
  select id into v_store from stores where code = p_code;
  if v_store is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
  if p_role not in ('responsavel', 'funcionario') then
    raise exception 'Papel inválido.' using errcode = 'P0001';
  end if;
  insert into store_invites (token, store_id, role, created_by) values (v_token, v_store, p_role, auth.uid());
  return v_token;
end;
$$;

create or replace function public.admin_set_store_member(p_code text, p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('lojas', 'editar');
  update store_members m set active = p_active
    from stores s where s.id = m.store_id and s.code = p_code and m.user_id = p_user;
  if not found then
    raise exception 'Acesso não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

-- Ranking por loja no período (dias de Brasília, inclusive).
create or replace function public.admin_partner_performance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := (p_from)::timestamp at time zone 'America/Sao_Paulo';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  perform _require_perm('desempenho', 'ver');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'code', s.code, 'name', s.name, 'isPickupPoint', s.is_pickup_point, 'published', s.published,
      'collected', (select count(distinct so.order_id) from route_stop_orders so
         join route_stops st on st.id = so.stop_id join routes ro on ro.id = st.route_id
         where st.store_id = s.id and ro.kind = 'coleta' and so.result = 'coletado'
           and st.done_at >= v_start and st.done_at < v_end),
      'pickedUp', (select count(*) from order_pickups op join orders o on o.id = op.order_id
         where o.destination_store_id = s.id and op.used_at >= v_start and op.used_at < v_end),
      'avgHoursToPickup', (select round((avg(extract(epoch from op.used_at - op.available_at)) / 3600)::numeric, 1)
         from order_pickups op join orders o on o.id = op.order_id
         where o.destination_store_id = s.id and op.used_at >= v_start and op.used_at < v_end),
      'failedStops', (select count(*) from route_stops st where st.store_id = s.id
         and st.status = 'nao_realizada' and st.done_at >= v_start and st.done_at < v_end),
      'occurrences', (select count(*) from occurrences c where c.store_id = s.id
         and c.created_at >= v_start and c.created_at < v_end),
      'guardExpired', (select count(*) from order_pickups op join orders o on o.id = op.order_id
         where o.destination_store_id = s.id and op.guard_until >= v_start and op.guard_until < v_end
           and coalesce(op.used_at, now()) > op.guard_until)
    )) order by s.name)
    from stores s
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Área da loja
-- ---------------------------------------------------------------------------
create or replace function public.my_stores()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name, 'role', m.role,
    'isPickupPoint', s.is_pickup_point, 'partnerKind', s.partner_kind, 'published', s.published)
    order by s.name), '[]'::jsonb)
  from store_members m join stores s on s.id = m.store_id
  where m.user_id = auth.uid() and m.active;
$$;

create or replace function public.store_dashboard(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code);
  v_month timestamptz := _month_start((now() at time zone 'America/Sao_Paulo')::date);
  f jsonb := _store_finance(v_store);
begin
  return jsonb_build_object(
    'stored', (select count(*) from orders o join order_pickups op on op.order_id = o.id
       where o.destination_store_id = v_store and o.status = 'active'
         and o.delivery_stage = 'disponivel-para-retirada' and op.used_at is null),
    'guardExpired', (select count(*) from orders o join order_pickups op on op.order_id = o.id
       where o.destination_store_id = v_store and o.status = 'active'
         and o.delivery_stage = 'disponivel-para-retirada' and op.used_at is null and op.guard_until < now()),
    'toCollect', (select count(distinct o.id) from orders o join order_origin_stores oos on oos.order_id = o.id
       where oos.store_id = v_store and o.status = 'active'
         and o.delivery_stage in ('aguardando-coleta', 'em-transporte-coleta')
         and not exists (select 1 from route_stop_orders so join route_stops st on st.id = so.stop_id
           join routes ro on ro.id = st.route_id
           where so.order_id = o.id and st.store_id = v_store and ro.kind = 'coleta' and so.result = 'coletado')),
    'pickupsMonth', (select count(*) from orders o join order_pickups op on op.order_id = o.id
       where o.destination_store_id = v_store and op.used_at >= v_month),
    'openOccurrences', (select count(*) from occurrences c where c.store_id = v_store and c.status in ('aberta', 'em_analise')),
    'next', f -> 'next',
    'monthTotal', f -> 'current' -> 'total'
  );
end;
$$;

-- Pedidos que a T1 vai buscar na loja, com os itens para separar.
create or replace function public.store_collections(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code);
begin
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'orderId', o.id,
      'customerFirstName', split_part(btrim(pr.name), ' ', 1),
      'stage', o.delivery_stage,
      'estimatedPickupDate', o.estimated_pickup_date,
      'routeDay', (select ro.day from route_stop_orders so join route_stops st on st.id = so.stop_id
         join routes ro on ro.id = st.route_id
         where so.order_id = o.id and st.store_id = v_store and ro.kind = 'coleta'
           and ro.status in ('aguardando', 'em_andamento') and so.result is null limit 1),
      'cards', (select coalesce(jsonb_agg(jsonb_build_object('name', ci.card_name, 'game', ci.game,
          'otherGame', ci.other_game, 'quantity', ci.quantity)), '[]'::jsonb)
         from pedido_groups g join pedido_card_items ci on ci.group_id = g.id
         where g.store_id = v_store and (g.order_id = o.id or exists (select 1 from store_charges sc
           where sc.id = g.store_charge_id and sc.order_id = o.id and sc.status = 'paid'))),
      'accessories', (select coalesce(jsonb_agg(jsonb_build_object('kind', ai.accessory,
          'other', ai.other_accessory, 'quantity', ai.quantity)), '[]'::jsonb)
         from pedido_groups g join pedido_accessory_items ai on ai.group_id = g.id
         where g.store_id = v_store and (g.order_id = o.id or exists (select 1 from store_charges sc
           where sc.id = g.store_charge_id and sc.order_id = o.id and sc.status = 'paid')))
    )) order by o.estimated_pickup_date nulls last, o.created_at)
    from orders o
    join order_origin_stores oos on oos.order_id = o.id and oos.store_id = v_store
    left join profiles pr on pr.id = o.user_id
    where o.status = 'active' and o.delivery_stage in ('aguardando-coleta', 'em-transporte-coleta')
      and not exists (select 1 from route_stop_orders so join route_stops st on st.id = so.stop_id
        join routes ro on ro.id = st.route_id
        where so.order_id = o.id and st.store_id = v_store and ro.kind = 'coleta' and so.result = 'coletado')
  ), '[]'::jsonb);
end;
$$;

-- Ponto de retirada: pacotes guardados e retiradas dos últimos 60 dias.
create or replace function public.store_pickups(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code);
begin
  return jsonb_build_object(
    'stored', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('orderId', o.id,
        'customerFirstName', split_part(btrim(pr.name), ' ', 1),
        'availableAt', op.available_at, 'guardUntil', op.guard_until)) order by op.guard_until nulls last)
      from orders o join order_pickups op on op.order_id = o.id left join profiles pr on pr.id = o.user_id
      where o.destination_store_id = v_store and o.status = 'active'
        and o.delivery_stage = 'disponivel-para-retirada' and op.used_at is null), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('orderId', o.id,
        'customerFirstName', split_part(btrim(pr.name), ' ', 1)))
      from orders o left join profiles pr on pr.id = o.user_id
      where o.destination_store_id = v_store and o.status = 'active'
        and o.delivery_stage = 'em-transporte-retirada'), '[]'::jsonb),
    'pickedUp', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('orderId', o.id,
        'customerFirstName', split_part(btrim(pr.name), ' ', 1),
        'availableAt', op.available_at, 'pickedUpAt', op.used_at)) order by op.used_at desc)
      from orders o join order_pickups op on op.order_id = o.id left join profiles pr on pr.id = o.user_id
      where o.destination_store_id = v_store and op.used_at > now() - interval '60 days'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.store_finance(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code);
begin
  return _store_finance(v_store);
end;
$$;

create or replace function public.store_occurrences(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code);
begin
  perform _occ_autoclose();
  return coalesce((
    select jsonb_agg(_occ_json(c.id, 'store', true) order by c.created_at desc)
    from occurrences c
    where c.store_id = v_store and (c.status <> 'encerrada' or c.created_at > now() - interval '90 days')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.store_members_list(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code, true);
begin
  return jsonb_build_object(
    'members', _store_members_json(v_store),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('token', i.token, 'role', i.role,
      'expiresAt', i.expires_at) order by i.created_at desc)
      from store_invites i where i.store_id = v_store and i.used_at is null and i.revoked_at is null
        and i.expires_at > now()), '[]'::jsonb)
  );
end;
$$;

create or replace function public.store_invite_member(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code, true);
  v_token text := _new_token();
begin
  if (select count(*) from store_invites where store_id = v_store and used_at is null
      and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'Muitos convites em aberto. Use ou espere vencer os anteriores.' using errcode = 'P0001';
  end if;
  insert into store_invites (token, store_id, role, created_by) values (v_token, v_store, 'funcionario', auth.uid());
  return v_token;
end;
$$;

create or replace function public.store_set_member_active(p_code text, p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := _store_member_id(p_code, true);
begin
  if p_user = auth.uid() then
    raise exception 'Você não pode desativar o seu próprio acesso.' using errcode = 'P0001';
  end if;
  update store_members set active = p_active where store_id = v_store and user_id = p_user and role = 'funcionario';
  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.store_invite_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('found', true, 'storeName', s.name, 'role', i.role,
      'valid', i.used_at is null and i.revoked_at is null and i.expires_at > now())
    from store_invites i join stores s on s.id = i.store_id where i.token = p_token
  ), jsonb_build_object('found', false));
$$;

create or replace function public.accept_store_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i store_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Entre ou crie sua conta para aceitar o convite.' using errcode = 'P0001';
  end if;
  select * into i from store_invites where token = p_token for update;
  if not found or i.revoked_at is not null then
    raise exception 'Convite inválido.' using errcode = 'P0001';
  end if;
  if i.used_at is not null then
    raise exception 'Este convite já foi usado.' using errcode = 'P0001';
  end if;
  if i.expires_at < now() then
    raise exception 'Este convite expirou. Peça um novo.' using errcode = 'P0001';
  end if;
  insert into store_members (store_id, user_id, role) values (i.store_id, auth.uid(), i.role)
    on conflict (store_id, user_id) do update set active = true,
      role = case when excluded.role = 'responsavel' then 'responsavel' else store_members.role end;
  update store_invites set used_at = now(), used_by = auth.uid() where token = p_token;
  return jsonb_build_object('storeCode', (select code from stores where id = i.store_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Ocorrências: a loja vê e comenta as ligadas a ela
-- ---------------------------------------------------------------------------
alter table occurrence_updates drop constraint occurrence_updates_author_kind_check;
alter table occurrence_updates add constraint occurrence_updates_author_kind_check
  check (author_kind in ('admin', 'driver', 'customer', 'store', 'system'));
alter table occurrence_attachments drop constraint occurrence_attachments_author_kind_check;
alter table occurrence_attachments add constraint occurrence_attachments_author_kind_check
  check (author_kind in ('admin', 'driver', 'customer', 'store'));

create or replace function public._occ_role(p_occ uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into c from occurrences where id = p_occ;
  if not found then
    return null;
  end if;
  if has_perm('ocorrencias', 'ver') then
    return 'admin';
  end if;
  if c.order_id is not null and exists (select 1 from orders where id = c.order_id and user_id = auth.uid()) then
    return 'customer';
  end if;
  if c.store_id is not null and exists (select 1 from store_members m
      where m.store_id = c.store_id and m.user_id = auth.uid() and m.active) then
    return 'store';
  end if;
  if _my_driver_id() is not null and (c.opened_by = auth.uid() or exists (
    select 1 from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
    where s.id = c.stop_id and t.driver_id = _my_driver_id())) then
    return 'driver';
  end if;
  return null;
end;
$$;


-- ---------------------------------------------------------------------------
-- 12. Página do QR: confirmar a retirada exige a conta da loja de destino
--     (ou admin com permissão de pedidos, como plano B)
-- ---------------------------------------------------------------------------
create or replace function public._can_confirm_pickup(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from orders o join store_members m on m.store_id = o.destination_store_id
            where o.id = p_order and m.user_id = auth.uid() and m.active)
    or has_perm('pedidos', 'editar'));
$$;

create or replace function public.pickup_lookup(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_driver_can boolean := false;
begin
  select p.*, o.id as oid, o.status, o.delivery_stage, s.name as store_name,
         split_part(btrim(pr.name), ' ', 1) as first_name
    into r
    from order_pickups p
    join orders o on o.id = p.order_id
    join stores s on s.id = o.destination_store_id
    left join profiles pr on pr.id = o.user_id
    where p.package_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if auth.uid() is not null and _my_driver_id() is not null and r.status = 'active'
     and r.delivery_stage = 'em-transporte-retirada' then
    v_driver_can := exists (
      select 1 from route_stop_orders so
      join route_stops s on s.id = so.stop_id
      join routes ro on ro.id = s.route_id
      join trips t on t.id = ro.trip_id
      where so.order_id = r.oid and so.result is null and ro.kind = 'entrega'
        and t.driver_id = _my_driver_id() and t.status = 'em_andamento');
  end if;
  return jsonb_build_object(
    'found', true,
    'orderCode', upper(left(r.oid::text, 8)),
    'storeName', r.store_name,
    'customerFirstName', r.first_name,
    'state', case
      when r.used_at is not null or r.status = 'completed' then 'done'
      when r.status = 'cancelled' then 'cancelled'
      when r.status = 'active' and r.delivery_stage = 'disponivel-para-retirada' then 'ready'
      else 'not_ready' end,
    'lockedUntil', case when r.locked_until > now() then r.locked_until end,
    'attemptsLeft', 5 - r.failed_attempts,
    'driverCanDeliver', v_driver_can,
    'loggedIn', auth.uid() is not null,
    'canConfirm', _can_confirm_pickup(r.oid)
  );
end;
$$;

create or replace function public.pickup_confirm(p_token text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup order_pickups%rowtype;
  v_order orders%rowtype;
  v_left int;
  v_member boolean;
begin
  select * into v_pickup from order_pickups where package_token = p_token for update;
  if not found then
    raise exception 'Este QR não é de um pacote da T1 Express.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = v_pickup.order_id for update;
  if not _can_confirm_pickup(v_order.id) then
    raise exception 'Entre com a conta da loja de retirada para confirmar.' using errcode = 'P0001';
  end if;
  if v_pickup.used_at is not null or v_order.status = 'completed' then
    raise exception 'Este pedido já foi retirado.' using errcode = 'P0001';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Este pedido foi cancelado. Não entregue o pacote.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'active' or v_order.delivery_stage is distinct from 'disponivel-para-retirada' then
    raise exception 'Este pedido ainda não está liberado para retirada.' using errcode = 'P0001';
  end if;
  if v_pickup.locked_until > now() then
    raise exception 'Muitas tentativas erradas. Tente de novo em % minuto(s).',
      ceil(extract(epoch from (v_pickup.locked_until - now())) / 60)::int using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_code), '') <> v_pickup.pickup_code then
    v_left := 5 - (v_pickup.failed_attempts + 1);
    if v_left <= 0 then
      update order_pickups set failed_attempts = 0, locked_until = now() + interval '15 minutes'
        where order_id = v_pickup.order_id;
      return jsonb_build_object('ok', false, 'locked', true, 'attemptsLeft', 0);
    end if;
    update order_pickups set failed_attempts = failed_attempts + 1, locked_until = null
      where order_id = v_pickup.order_id;
    return jsonb_build_object('ok', false, 'locked', false, 'attemptsLeft', v_left);
  end if;

  v_member := exists (select 1 from store_members m where m.store_id = v_order.destination_store_id
    and m.user_id = auth.uid() and m.active);
  perform set_config('t1.actor', case when v_member then 'store' else 'admin' end, true);
  update order_pickups set used_at = now(), failed_attempts = 0, locked_until = null
    where order_id = v_pickup.order_id;
  update orders set status = 'completed', completed_at = now() where id = v_order.id;
  insert into custody_events (order_id, action, store_id, responsible_name, note)
  values (v_order.id, 'retirado_pelo_cliente', v_order.destination_store_id,
          coalesce((select name from profiles where id = auth.uid()), 'Loja de retirada'),
          case when v_member then 'Retirada confirmada pela loja com o código do cliente.'
               else 'Retirada confirmada pela equipe T1 com o código do cliente.' end);
  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------------
-- 13. Bucket privado partner-docs: "onboarding/<id>/..." e "payouts/<loja>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-docs', 'partner-docs', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public._can_upload_onboarding_path(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from partner_onboardings o where o.id::text = p_id and o.user_id = auth.uid()
    and o.status in ('aguardando_preenchimento', 'pendencia'));
$$;

create or replace function public._can_read_partner_path(p_folder text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_folder
    when 'onboarding' then has_any_perm(array['kyc', 'lojas'], 'ver')
      or exists (select 1 from partner_onboardings o where o.id::text = p_id and o.user_id = auth.uid())
    when 'payouts' then has_perm('lojas', 'ver')
      or exists (select 1 from store_members m where m.store_id::text = p_id and m.user_id = auth.uid() and m.active)
    else false end;
$$;

create policy "partner docs upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'partner-docs' and (
      ((storage.foldername(name))[1] = 'onboarding' and public._can_upload_onboarding_path((storage.foldername(name))[2]))
      or ((storage.foldername(name))[1] = 'payouts' and public.has_perm('lojas', 'editar'))
    )
  );
create policy "partner docs read" on storage.objects
  for select to authenticated using (
    bucket_id = 'partner-docs'
    and public._can_read_partner_path((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
create policy "partner docs delete own draft" on storage.objects
  for delete to authenticated using (
    bucket_id = 'partner-docs' and (storage.foldername(name))[1] = 'onboarding'
    and public._can_upload_onboarding_path((storage.foldername(name))[2])
  );

-- ---------------------------------------------------------------------------
-- 14. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _new_token(),
  _valid_cpf(text),
  _valid_cnpj(text),
  _nth_business_day(date, int),
  _store_member_id(text, boolean),
  _onb_log(uuid, text, text, text),
  _onboarding_missing(uuid),
  _month_start(date),
  _store_statement(uuid, date),
  _store_finance(uuid),
  _onboarding_json(uuid, boolean),
  _onboarding_of_token(text, boolean),
  _store_members_json(uuid),
  _can_confirm_pickup(uuid),
  admin_start_onboarding(uuid),
  admin_onboardings(),
  admin_onboarding(uuid),
  admin_renew_onboarding_link(uuid),
  admin_review_document(uuid, text, text),
  admin_set_onboarding_status(uuid, text, text),
  admin_store_profile(text),
  admin_set_store_published(text, boolean),
  admin_set_store_pay_rules(text, jsonb),
  admin_register_payout(text, date, numeric, date, text, text),
  admin_store_invite(text, text),
  admin_set_store_member(text, uuid, boolean),
  admin_partner_performance(date, date),
  onboarding_preview(text),
  onboarding_by_token(text),
  onboarding_save(text, jsonb),
  onboarding_add_document(text, text, text, text, text),
  onboarding_remove_document(text, uuid),
  onboarding_submit(text),
  my_stores(),
  store_dashboard(text),
  store_collections(text),
  store_pickups(text),
  store_finance(text),
  store_occurrences(text),
  store_members_list(text),
  store_invite_member(text),
  store_set_member_active(text, uuid, boolean),
  store_invite_preview(text),
  accept_store_invite(text)
from public, anon, authenticated;

-- Usadas nas policies do Storage.
revoke all on function _can_upload_onboarding_path(text), _can_read_partner_path(text, text) from public, anon;
grant execute on function _can_upload_onboarding_path(text), _can_read_partner_path(text, text) to authenticated;

grant execute on function onboarding_preview(text), store_invite_preview(text) to anon, authenticated;
grant execute on function
  admin_start_onboarding(uuid),
  admin_onboardings(),
  admin_onboarding(uuid),
  admin_renew_onboarding_link(uuid),
  admin_review_document(uuid, text, text),
  admin_set_onboarding_status(uuid, text, text),
  admin_store_profile(text),
  admin_set_store_published(text, boolean),
  admin_set_store_pay_rules(text, jsonb),
  admin_register_payout(text, date, numeric, date, text, text),
  admin_store_invite(text, text),
  admin_set_store_member(text, uuid, boolean),
  admin_partner_performance(date, date),
  onboarding_by_token(text),
  onboarding_save(text, jsonb),
  onboarding_add_document(text, text, text, text, text),
  onboarding_remove_document(text, uuid),
  onboarding_submit(text),
  my_stores(),
  store_dashboard(text),
  store_collections(text),
  store_pickups(text),
  store_finance(text),
  store_occurrences(text),
  store_members_list(text),
  store_invite_member(text),
  store_set_member_active(text, uuid, boolean),
  accept_store_invite(text)
to authenticated;
