-- TESTE da 0022 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. Gerado de migrations/0022_finance.sql + tests/0022_finance_test.sql.

begin;

-- Backoffice, entrega 8A: financeiro (despesas com aprovação, repasses de lojas e
-- equipe, reembolsos a clientes, sinistros e painel). Precisa da 0014 a 0021.
-- Ver rollback/0022_down.sql.
--
-- Repasse do mês (pago no 5º dia útil do mês seguinte): loja pelo extrato da
-- 0020; entregador = custo real das viagens concluídas + fixo mensal + avulsos;
-- funcionário/prestador = fixo mensal + avulsos. As resoluções "reembolso" e
-- "sinistro" das ocorrências passam a gerar o item a pagar e o sinistro.

-- ---------------------------------------------------------------------------
-- 1. Despesas
-- ---------------------------------------------------------------------------
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  grp text not null check (grp in ('operacao', 'pessoal', 'administrativo', 'comercial')),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  active boolean not null default true,
  sort int not null default 100,
  unique (grp, name)
);

insert into expense_categories (grp, name, sort) values
  ('operacao', 'Combustível avulso', 10), ('operacao', 'Manutenção de veículo', 20),
  ('operacao', 'Embalagem e etiquetas', 30), ('operacao', 'Estacionamento e pedágio', 40),
  ('operacao', 'Outros da operação', 90),
  ('pessoal', 'Salários', 10), ('pessoal', 'Freelas e diárias', 20), ('pessoal', 'Benefícios', 30),
  ('pessoal', 'Outros de pessoal', 90),
  ('administrativo', 'Aluguel', 10), ('administrativo', 'Contador', 20),
  ('administrativo', 'Sistemas e assinaturas', 30), ('administrativo', 'Taxas bancárias', 40),
  ('administrativo', 'Impostos', 50), ('administrativo', 'Outros administrativos', 90),
  ('comercial', 'Anúncios', 10), ('comercial', 'Eventos', 20), ('comercial', 'Brindes', 30),
  ('comercial', 'Outros comerciais', 90);

create sequence expense_number_seq start 1001;

create table expenses (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('expense_number_seq'),
  category_id uuid not null references expense_categories(id),
  description text not null check (char_length(btrim(description)) between 3 and 300),
  amount_brl numeric(12,2) not null check (amount_brl > 0),
  competence date not null,
  due_date date,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'paga')),
  trip_id uuid references trips(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  store_id uuid references stores(id) on delete set null,
  member_id uuid references team_members(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (coalesce(char_length(review_note), 0) <= 500),
  paid_at date,
  receipt_path text check (coalesce(char_length(receipt_path), 0) <= 300),
  note text check (coalesce(char_length(note), 0) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence expense_number_seq owned by expenses.number;
create index expenses_competence_idx on expenses (competence);
create index expenses_status_idx on expenses (status);

-- Notas e recibos da despesa no bucket finance-docs ("expenses/<id>/...").
create table expense_files (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  name text check (coalesce(char_length(name), 0) <= 160),
  mime text check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index expense_files_expense_idx on expense_files (expense_id);

-- ---------------------------------------------------------------------------
-- 2. Repasses da equipe
-- ---------------------------------------------------------------------------
create table team_adjustments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_brl numeric(10,2) not null check (amount_brl <> 0),
  description text not null check (char_length(btrim(description)) between 3 and 200),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index team_adjustments_member_idx on team_adjustments (member_id, month);

create table team_payouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_brl numeric(10,2) not null check (amount_brl >= 0),
  paid_at date not null,
  receipt_path text check (coalesce(char_length(receipt_path), 0) <= 300),
  note text check (coalesce(char_length(note), 0) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (member_id, month)
);

-- ---------------------------------------------------------------------------
-- 3. Reembolsos a clientes (resolução "reembolso" de ocorrência)
-- ---------------------------------------------------------------------------
create table customer_refunds (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid references occurrences(id) on delete set null,
  resolution_id uuid unique references occurrence_resolutions(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  amount_brl numeric(10,2) not null check (amount_brl > 0),
  status text not null default 'a_pagar' check (status in ('a_pagar', 'pago', 'cancelado')),
  paid_at date,
  receipt_path text check (coalesce(char_length(receipt_path), 0) <= 300),
  note text check (coalesce(char_length(note), 0) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Sinistros
-- ---------------------------------------------------------------------------
create sequence claim_number_seq start 1001;

-- items: [{ "kind": "card" | "accessory", "itemId": uuid, "qty": int }]
create table claims (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('claim_number_seq'),
  order_id uuid not null references orders(id) on delete cascade,
  occurrence_id uuid references occurrences(id) on delete set null,
  resolution_id uuid unique references occurrence_resolutions(id) on delete set null,
  description text check (coalesce(char_length(description), 0) <= 2000),
  items jsonb not null default '[]'::jsonb,
  declared_amount numeric(12,2) not null default 0 check (declared_amount >= 0),
  coverage_brl numeric(12,2) not null default 0,
  suggested_amount numeric(12,2) not null default 0,
  approved_amount numeric(12,2) check (approved_amount >= 0),
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'aprovado', 'pago', 'negado')),
  decision_note text check (coalesce(char_length(decision_note), 0) <= 1000),
  paid_at date,
  receipt_path text check (coalesce(char_length(receipt_path), 0) <= 300),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter sequence claim_number_seq owned by claims.number;
create index claims_order_idx on claims (order_id);
create index claims_status_idx on claims (status);

create table claim_events (
  id bigint generated always as identity primary key,
  claim_id uuid not null references claims(id) on delete cascade,
  kind text not null check (kind in ('aberto', 'itens', 'status', 'pago', 'nota')),
  note text check (coalesce(char_length(note), 0) <= 1000),
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index claim_events_claim_idx on claim_events (claim_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. Acesso (admin lê direto; escrita só pelas funções)
-- ---------------------------------------------------------------------------
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table expense_files enable row level security;
alter table team_adjustments enable row level security;
alter table team_payouts enable row level security;
alter table customer_refunds enable row level security;
alter table claims enable row level security;
alter table claim_events enable row level security;

create policy "staff read expense categories" on expense_categories for select using (has_perm('despesas', 'ver'));
create policy "staff read expenses" on expenses for select using (has_perm('despesas', 'ver'));
create policy "staff read expense files" on expense_files for select using (has_perm('despesas', 'ver'));
create policy "staff read team adjustments" on team_adjustments for select using (has_perm('repasses', 'ver'));
create policy "staff read team payouts" on team_payouts for select using (has_perm('repasses', 'ver'));
create policy "staff read refunds" on customer_refunds for select using (has_any_perm(array['repasses', 'ocorrencias'], 'ver'));
create policy "staff read claims" on claims for select using (has_any_perm(array['sinistros', 'ocorrencias'], 'ver'));
create policy "staff read claim events" on claim_events for select using (has_perm('sinistros', 'ver'));

revoke insert, update, delete on expense_categories, expenses, expense_files, team_adjustments,
  team_payouts, customer_refunds, claims, claim_events from anon, authenticated;
revoke select on expense_categories, expenses, expense_files, team_adjustments,
  team_payouts, customer_refunds, claims, claim_events from anon;

-- ---------------------------------------------------------------------------
-- 6. Cálculos
-- ---------------------------------------------------------------------------
-- Repasse da pessoa da Equipe no mês: viagens (entregador) + fixo + avulsos.
create or replace function public._team_statement(p_member uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_start timestamptz := _month_start(v_month);
  v_end timestamptz := _month_start((v_month + interval '1 month')::date);
  v_trips int; v_trip_cost numeric; v_fixed numeric; v_adj numeric;
  p team_payouts%rowtype;
begin
  select count(*), coalesce(sum(actual_driver_cost), 0) into v_trips, v_trip_cost
    from trips where driver_id = p_member and status = 'concluida'
      and finished_at >= v_start and finished_at < v_end;
  select coalesce(sum(amount_brl), 0) into v_fixed
    from team_pay_rules where member_id = p_member and kind = 'fixo_mensal';
  select coalesce(sum(amount_brl), 0) into v_adj
    from team_adjustments where member_id = p_member and month = v_month;
  select * into p from team_payouts where member_id = p_member and month = v_month;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'trips', v_trips, 'tripCost', round(v_trip_cost, 2), 'fixed', round(v_fixed, 2),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'amount', a.amount_brl,
      'description', a.description) order by a.created_at)
      from team_adjustments a where a.member_id = p_member and a.month = v_month), '[]'::jsonb),
    'adjustmentsTotal', round(v_adj, 2),
    'total', round(v_trip_cost + v_fixed + v_adj, 2),
    'payout', case when p.id is null then null else jsonb_build_object(
      'amount', p.amount_brl, 'paidAt', p.paid_at, 'receiptPath', p.receipt_path, 'note', p.note) end
  );
end;
$$;

-- Valor declarado de um item afetado (unit: preço × qtd; total: proporcional).
create or replace function public._claim_declared(p_items jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_total numeric := 0;
  v_price numeric; v_mode price_mode; v_qty int; v_k int;
begin
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_k := (it ->> 'qty')::int;
    if it ->> 'kind' = 'card' then
      select price, price_mode, quantity into v_price, v_mode, v_qty from pedido_card_items where id = (it ->> 'itemId')::uuid;
    else
      select price, price_mode, quantity into v_price, v_mode, v_qty from pedido_accessory_items where id = (it ->> 'itemId')::uuid;
    end if;
    if v_price is null or v_k is null or v_k < 1 or v_k > v_qty then
      raise exception 'Item do sinistro inválido.' using errcode = 'P0001';
    end if;
    v_total := v_total + case when v_mode = 'total' then v_price * v_k / v_qty else v_price * v_k end;
    v_price := null;
  end loop;
  return round(v_total, 2);
end;
$$;

create or replace function public._claim_log(p_claim uuid, p_kind text, p_note text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into claim_events (claim_id, kind, note, actor_id)
  values (p_claim, p_kind, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  update claims set updated_at = clock_timestamp() where id = p_claim;
$$;

-- Resoluções da ocorrência viram o item a pagar ("reembolso") ou o sinistro.
create or replace function public._occ_resolution_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
  o orders%rowtype;
  v_claim uuid;
begin
  select * into c from occurrences where id = new.occurrence_id;
  if c.order_id is null then
    return new;
  end if;
  select * into o from orders where id = c.order_id;
  if new.kind = 'reembolso' and new.amount_brl > 0 then
    insert into customer_refunds (occurrence_id, resolution_id, order_id, user_id, amount_brl, note)
    values (c.id, new.id, c.order_id, o.user_id, new.amount_brl, new.note);
  elsif new.kind = 'sinistro' then
    insert into claims (order_id, occurrence_id, resolution_id, description, declared_amount, coverage_brl,
                        suggested_amount, created_by)
    values (c.order_id, c.id, new.id, c.description, coalesce(new.amount_brl, 0), o.insurance_coverage_brl,
            least(coalesce(new.amount_brl, 0), o.insurance_coverage_brl), auth.uid())
    returning id into v_claim;
    perform _claim_log(v_claim, 'aberto', 'Aberto pela ocorrência OC-' || c.number);
  end if;
  return new;
end;
$$;

create trigger occurrence_resolutions_finance
  after insert on occurrence_resolutions
  for each row execute function _occ_resolution_finance();

-- ---------------------------------------------------------------------------
-- 7. Despesas: funções
-- ---------------------------------------------------------------------------
create or replace function public.admin_expenses(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('despesas', 'ver');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', e.id, 'number', e.number, 'categoryId', e.category_id, 'categoryName', c.name, 'group', c.grp,
      'description', e.description, 'amount', e.amount_brl, 'competence', e.competence, 'dueDate', e.due_date,
      'status', e.status, 'tripId', e.trip_id, 'orderId', e.order_id,
      'storeCode', s.code, 'storeName', s.name, 'memberId', e.member_id, 'memberName', tm.name,
      'createdBy', e.created_by, 'createdByName', cb.name, 'reviewedByName', rb.name,
      'reviewedAt', e.reviewed_at, 'reviewNote', e.review_note, 'paidAt', e.paid_at,
      'receiptPath', e.receipt_path, 'note', e.note, 'createdAt', e.created_at,
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'name', f.name,
        'mime', f.mime) order by f.created_at) from expense_files f where f.expense_id = e.id), '[]'::jsonb)
    )) order by e.competence desc, e.number desc)
    from expenses e
    join expense_categories c on c.id = e.category_id
    left join stores s on s.id = e.store_id
    left join team_members tm on tm.id = e.member_id
    left join profiles cb on cb.id = e.created_by
    left join profiles rb on rb.id = e.reviewed_by
    where e.competence between p_from and p_to
  ), '[]'::jsonb);
end;
$$;

-- p: { grp, name, active, sort }
create or replace function public.admin_upsert_expense_category(p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  perform _require_perm('despesas', 'editar');
  if p_id is null then
    insert into expense_categories (grp, name, active, sort)
    values (p ->> 'grp', btrim(p ->> 'name'), coalesce((p ->> 'active')::boolean, true), coalesce((p ->> 'sort')::int, 100))
    returning id into v_id;
  else
    update expense_categories set name = btrim(p ->> 'name'),
      active = coalesce((p ->> 'active')::boolean, active), sort = coalesce((p ->> 'sort')::int, sort)
      where id = p_id;
    if not found then
      raise exception 'Categoria não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe uma categoria com esse nome no grupo.' using errcode = 'P0001';
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'Confira o grupo e o nome da categoria.' using errcode = 'P0001';
end;
$$;

-- Lança ou edita (enquanto pendente ou recusada). Editar uma recusada volta para pendente.
-- p: { categoryId, description, amount, competence, dueDate?, tripId?, orderId?, storeCode?, memberId?, note? }
create or replace function public.admin_save_expense(p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e expenses%rowtype;
  v_id uuid := p_id;
  v_store uuid;
begin
  if p_id is null then
    perform _require_perm('despesas', 'criar');
  else
    select * into e from expenses where id = p_id for update;
    if not found then
      raise exception 'Despesa não encontrada.' using errcode = 'P0001';
    end if;
    if e.status not in ('pendente', 'recusada') then
      raise exception 'Despesa aprovada ou paga não pode ser editada.' using errcode = 'P0001';
    end if;
    if e.created_by is distinct from auth.uid() then
      perform _require_perm('despesas', 'editar');
    else
      perform _require_perm('despesas', 'criar');
    end if;
  end if;
  if not exists (select 1 from expense_categories where id = (p ->> 'categoryId')::uuid and active) then
    raise exception 'Escolha uma categoria ativa.' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'storeCode', '') is not null then
    select id into v_store from stores where code = p ->> 'storeCode';
  end if;
  if p_id is null then
    insert into expenses (category_id, description, amount_brl, competence, due_date, trip_id, order_id,
                          store_id, member_id, note, created_by)
    values ((p ->> 'categoryId')::uuid, btrim(p ->> 'description'), round((p ->> 'amount')::numeric, 2),
            (p ->> 'competence')::date, nullif(p ->> 'dueDate', '')::date, nullif(p ->> 'tripId', '')::uuid,
            nullif(p ->> 'orderId', '')::uuid, v_store, nullif(p ->> 'memberId', '')::uuid,
            nullif(btrim(coalesce(p ->> 'note', '')), ''), auth.uid())
    returning id into v_id;
  else
    update expenses set category_id = (p ->> 'categoryId')::uuid, description = btrim(p ->> 'description'),
      amount_brl = round((p ->> 'amount')::numeric, 2), competence = (p ->> 'competence')::date,
      due_date = nullif(p ->> 'dueDate', '')::date, trip_id = nullif(p ->> 'tripId', '')::uuid,
      order_id = nullif(p ->> 'orderId', '')::uuid, store_id = v_store,
      member_id = nullif(p ->> 'memberId', '')::uuid, note = nullif(btrim(coalesce(p ->> 'note', '')), ''),
      status = 'pendente', reviewed_by = null, reviewed_at = null, review_note = null, updated_at = now()
      where id = p_id;
  end if;
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Confira o valor e as datas da despesa.' using errcode = 'P0001';
  when check_violation or not_null_violation then
    raise exception 'Preencha descrição (3 letras ou mais), valor maior que zero e competência.' using errcode = 'P0001';
end;
$$;

-- Aprovar ou recusar: precisa de "editar" e, salvo Administrador, não pode ser quem lançou.
create or replace function public.admin_review_expense(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e expenses%rowtype;
begin
  perform _require_perm('despesas', 'editar');
  select * into e from expenses where id = p_id for update;
  if not found then
    raise exception 'Despesa não encontrada.' using errcode = 'P0001';
  end if;
  if e.status <> 'pendente' then
    raise exception 'Só despesas pendentes são analisadas.' using errcode = 'P0001';
  end if;
  if e.created_by = auth.uid() and not is_full_admin() then
    raise exception 'Outra pessoa precisa aprovar a despesa que você lançou.' using errcode = 'P0001';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;
  update expenses set status = case when p_approve then 'aprovada' else 'recusada' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), ''),
    updated_at = now()
    where id = p_id;
end;
$$;

create or replace function public.admin_pay_expense(p_id uuid, p_paid_at date, p_receipt text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('despesas', 'editar');
  if p_paid_at is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;
  if p_receipt is not null and p_receipt not like 'expenses/' || p_id || '/%' then
    raise exception 'Comprovante inválido.' using errcode = 'P0001';
  end if;
  update expenses set status = 'paga', paid_at = p_paid_at,
    receipt_path = coalesce(p_receipt, receipt_path), updated_at = now()
    where id = p_id and status = 'aprovada';
  if not found then
    raise exception 'Só despesas aprovadas podem ser pagas.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_delete_expense(p_id uuid)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('despesas', 'excluir');
  if not exists (select 1 from expenses where id = p_id and status in ('pendente', 'recusada')) then
    raise exception 'Só despesas pendentes ou recusadas podem ser apagadas.' using errcode = 'P0001';
  end if;
  return query select path from expense_files where expense_id = p_id
    union all select receipt_path from expenses where id = p_id and receipt_path is not null;
  delete from expenses where id = p_id;
end;
$$;

create or replace function public.admin_add_expense_file(p_id uuid, p_path text, p_name text, p_mime text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform _require_perm('despesas', 'criar');
  if not exists (select 1 from expenses where id = p_id) then
    raise exception 'Despesa não encontrada.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path not like 'expenses/' || p_id || '/%' or p_path like '%..%' then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  insert into expense_files (expense_id, path, name, mime, created_by)
  values (p_id, p_path, left(p_name, 160), p_mime, auth.uid())
  returning id into v_id;
  return v_id;
exception
  when check_violation then
    raise exception 'Envie foto ou PDF.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Repasses: funções
-- ---------------------------------------------------------------------------
-- Tudo o que se paga referente ao mês: lojas, equipe e clientes.
create or replace function public.admin_payouts_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  perform _require_perm('repasses', 'ver');
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'dueDate', _nth_business_day((v_month + interval '1 month')::date, 5),
    'stores', coalesce((
      select jsonb_agg(x.j order by x.name) from (
        select s.name, jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
          'statement', _store_statement(s.id, v_month)) as j
        from stores s
        where s.is_pickup_point and (exists (select 1 from store_pay_rules r where r.store_id = s.id)
          or exists (select 1 from store_payouts sp where sp.store_id = s.id and sp.month = v_month))
      ) x), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(x.j order by x.name) from (
        select tm.name, jsonb_build_object('id', tm.id, 'name', tm.name, 'kind', tm.kind, 'status', tm.status,
          'pixKey', tm.pix_key, 'statement', _team_statement(tm.id, v_month)) as j
        from team_members tm
        where tm.status = 'ativo'
          or exists (select 1 from team_payouts tp where tp.member_id = tm.id and tp.month = v_month)
          or exists (select 1 from trips t where t.driver_id = tm.id and t.status = 'concluida'
                       and t.finished_at >= _month_start(v_month)
                       and t.finished_at < _month_start((v_month + interval '1 month')::date))
      ) x), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(x.j order by x.created_at) from (
        select r.created_at, jsonb_strip_nulls(jsonb_build_object('kind', 'reembolso', 'id', r.id,
          'orderId', r.order_id, 'occurrenceId', r.occurrence_id,
          'occurrenceNumber', (select number from occurrences where id = r.occurrence_id),
          'customerName', p.name, 'customerEmail', p.email, 'amount', r.amount_brl, 'status', r.status,
          'paidAt', r.paid_at, 'receiptPath', r.receipt_path, 'createdAt', r.created_at)) as j
        from customer_refunds r left join profiles p on p.id = r.user_id
        where r.status = 'a_pagar' or (r.status = 'pago' and date_trunc('month', r.paid_at)::date = v_month)
        union all
        select c.created_at, jsonb_strip_nulls(jsonb_build_object('kind', 'sinistro', 'id', c.id,
          'number', c.number, 'orderId', c.order_id, 'occurrenceId', c.occurrence_id,
          'customerName', p.name, 'customerEmail', p.email, 'amount', c.approved_amount, 'status', c.status,
          'paidAt', c.paid_at, 'receiptPath', c.receipt_path, 'createdAt', c.created_at))
        from claims c join orders o on o.id = c.order_id left join profiles p on p.id = o.user_id
        where c.status = 'aprovado' or (c.status = 'pago' and date_trunc('month', c.paid_at)::date = v_month)
      ) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_add_team_adjustment(p_member uuid, p_month date, p_amount numeric, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform _require_perm('repasses', 'editar');
  if exists (select 1 from team_payouts where member_id = p_member and month = date_trunc('month', p_month)::date) then
    raise exception 'Este mês já foi pago. Lance o ajuste no mês seguinte.' using errcode = 'P0001';
  end if;
  insert into team_adjustments (member_id, month, amount_brl, description, created_by)
  values (p_member, date_trunc('month', p_month)::date, round(p_amount, 2), btrim(p_description), auth.uid())
  returning id into v_id;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'Informe um valor diferente de zero e a descrição.' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_remove_team_adjustment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('repasses', 'editar');
  delete from team_adjustments a where a.id = p_id and not exists (
    select 1 from team_payouts tp where tp.member_id = a.member_id and tp.month = a.month);
  if not found then
    raise exception 'Ajuste não encontrado ou mês já pago.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_register_team_payout(p_member uuid, p_month date, p_amount numeric,
  p_paid_at date, p_receipt text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('repasses', 'editar');
  if p_month is null or p_paid_at is null or p_amount is null or p_amount < 0 then
    raise exception 'Informe o mês, o valor e a data do pagamento.' using errcode = 'P0001';
  end if;
  if p_receipt is not null and p_receipt not like 'team/' || p_member || '/%' then
    raise exception 'Comprovante inválido.' using errcode = 'P0001';
  end if;
  insert into team_payouts (member_id, month, amount_brl, paid_at, receipt_path, note, created_by)
  values (p_member, date_trunc('month', p_month)::date, round(p_amount, 2), p_paid_at, p_receipt,
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (member_id, month) do update set amount_brl = excluded.amount_brl, paid_at = excluded.paid_at,
    receipt_path = coalesce(excluded.receipt_path, team_payouts.receipt_path), note = excluded.note;
exception
  when foreign_key_violation then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
end;
$$;

-- Pagamento de loja pela tela de Repasses (mesma regra de admin_register_payout, área repasses).
create or replace function public.admin_finance_store_payout(p_code text, p_month date, p_amount numeric,
  p_paid_at date, p_receipt text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  perform _require_perm('repasses', 'editar');
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

create or replace function public.admin_pay_refund(p_id uuid, p_paid_at date, p_receipt text default null,
  p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('repasses', 'editar');
  if p_paid_at is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;
  if p_receipt is not null and p_receipt not like 'refunds/' || p_id || '/%' then
    raise exception 'Comprovante inválido.' using errcode = 'P0001';
  end if;
  update customer_refunds set status = 'pago', paid_at = p_paid_at, receipt_path = coalesce(p_receipt, receipt_path),
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
    where id = p_id and status = 'a_pagar';
  if not found then
    raise exception 'Reembolso não encontrado ou já pago.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_cancel_refund(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('repasses', 'editar');
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;
  update customer_refunds set status = 'cancelado', note = btrim(p_reason) where id = p_id and status = 'a_pagar';
  if not found then
    raise exception 'Reembolso não encontrado ou já pago.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Sinistros: funções
-- ---------------------------------------------------------------------------
create or replace function public._claim_json(p_claim uuid, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', c.id, 'number', c.number, 'orderId', c.order_id, 'occurrenceId', c.occurrence_id,
    'occurrenceNumber', oc.number, 'description', c.description, 'items', c.items,
    'declaredAmount', c.declared_amount, 'coverage', c.coverage_brl, 'suggestedAmount', c.suggested_amount,
    'approvedAmount', c.approved_amount, 'status', c.status, 'decisionNote', c.decision_note,
    'paidAt', c.paid_at, 'receiptPath', c.receipt_path, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'customerName', p.name, 'customerEmail', p.email,
    'insuranceOptedIn', o.insurance_opted_in, 'itemsTotal', o.items_total_brl,
    'orderItems', case when p_full then coalesce((
      select jsonb_agg(x.j) from (
        select jsonb_build_object('kind', 'card', 'itemId', ci.id, 'label', ci.card_name, 'store', s.name,
          'quantity', ci.quantity, 'unitValue', case when ci.price_mode = 'total' then round(ci.price / ci.quantity, 2) else ci.price end) as j
        from pedido_groups g join pedido_card_items ci on ci.group_id = g.id join stores s on s.id = g.store_id
        where g.order_id = c.order_id or g.store_charge_id in (select id from store_charges where order_id = c.order_id and status = 'paid')
        union all
        select jsonb_build_object('kind', 'accessory', 'itemId', ai.id,
          'label', case when ai.accessory = 'outro' then coalesce(ai.other_accessory, 'Acessório') else ai.accessory::text end,
          'store', s.name, 'quantity', ai.quantity,
          'unitValue', case when ai.price_mode = 'total' then round(ai.price / ai.quantity, 2) else ai.price end)
        from pedido_groups g join pedido_accessory_items ai on ai.group_id = g.id join stores s on s.id = g.store_id
        where g.order_id = c.order_id or g.store_charge_id in (select id from store_charges where order_id = c.order_id and status = 'paid')
      ) x), '[]'::jsonb) end,
    'events', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('kind', e.kind, 'note', e.note, 'actorName', pr.name,
        'createdAt', e.created_at)) order by e.created_at, e.id)
      from claim_events e left join profiles pr on pr.id = e.actor_id where e.claim_id = c.id), '[]'::jsonb) end
  ))
  from claims c
  join orders o on o.id = c.order_id
  left join profiles p on p.id = o.user_id
  left join occurrences oc on oc.id = c.occurrence_id
  where c.id = p_claim;
$$;

create or replace function public.admin_claims()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('sinistros', 'ver');
  return coalesce((select jsonb_agg(_claim_json(id, false) order by created_at desc) from claims), '[]'::jsonb);
end;
$$;

create or replace function public.admin_claim(p_claim uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('sinistros', 'ver');
  if not exists (select 1 from claims where id = p_claim) then
    raise exception 'Sinistro não encontrado.' using errcode = 'P0001';
  end if;
  return _claim_json(p_claim, true);
end;
$$;

-- Abrir direto pelo pedido (sem ocorrência).
create or replace function public.admin_open_claim(p_order uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders%rowtype;
  v_id uuid;
begin
  perform _require_perm('sinistros', 'criar');
  select * into o from orders where id = p_order;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 5 then
    raise exception 'Descreva o que aconteceu.' using errcode = 'P0001';
  end if;
  insert into claims (order_id, description, coverage_brl, created_by)
  values (p_order, btrim(p_description), o.insurance_coverage_brl, auth.uid())
  returning id into v_id;
  perform _claim_log(v_id, 'aberto', 'Aberto pelo pedido');
  return v_id;
end;
$$;

-- Itens afetados: recalcula o declarado e a sugestão (menor entre declarado e cobertura).
create or replace function public.admin_set_claim_items(p_claim uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c claims%rowtype;
  v_declared numeric;
  it jsonb;
begin
  perform _require_perm('sinistros', 'editar');
  select * into c from claims where id = p_claim for update;
  if not found then
    raise exception 'Sinistro não encontrado.' using errcode = 'P0001';
  end if;
  if c.status in ('pago', 'negado') then
    raise exception 'Sinistro encerrado.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Itens inválidos.' using errcode = 'P0001';
  end if;
  -- Cada item precisa ser deste pedido.
  for it in select value from jsonb_array_elements(p_items) loop
    if not exists (
      select 1 from pedido_groups g
      left join pedido_card_items ci on ci.group_id = g.id and it ->> 'kind' = 'card' and ci.id = (it ->> 'itemId')::uuid
      left join pedido_accessory_items ai on ai.group_id = g.id and it ->> 'kind' = 'accessory' and ai.id = (it ->> 'itemId')::uuid
      where (g.order_id = c.order_id or g.store_charge_id in (select id from store_charges where order_id = c.order_id))
        and coalesce(ci.id, ai.id) is not null) then
      raise exception 'Item que não é deste pedido.' using errcode = 'P0001';
    end if;
  end loop;
  v_declared := _claim_declared(p_items);
  update claims set items = p_items, declared_amount = v_declared,
    suggested_amount = least(v_declared, coverage_brl)
    where id = p_claim;
  perform _claim_log(p_claim, 'itens', jsonb_array_length(p_items) || ' item(ns) · declarado R$ ' || v_declared);
exception
  when invalid_text_representation then
    raise exception 'Itens inválidos.' using errcode = 'P0001';
end;
$$;

-- em_analise | aprovado (com valor) | negado (com motivo) | aberto
create or replace function public.admin_set_claim_status(p_claim uuid, p_status text, p_amount numeric default null,
  p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c claims%rowtype;
begin
  perform _require_perm('sinistros', 'editar');
  select * into c from claims where id = p_claim for update;
  if not found then
    raise exception 'Sinistro não encontrado.' using errcode = 'P0001';
  end if;
  if c.status in ('pago', 'negado') then
    raise exception 'Sinistro encerrado.' using errcode = 'P0001';
  end if;
  if p_status not in ('aberto', 'em_analise', 'aprovado', 'negado') then
    raise exception 'Situação inválida.' using errcode = 'P0001';
  end if;
  if p_status = 'aprovado' and (p_amount is null or p_amount <= 0) then
    raise exception 'Informe o valor aprovado da indenização.' using errcode = 'P0001';
  end if;
  if p_status = 'negado' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Informe o motivo da negativa.' using errcode = 'P0001';
  end if;
  update claims set status = p_status,
    approved_amount = case when p_status = 'aprovado' then round(p_amount, 2) else null end,
    decision_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), decision_note)
    where id = p_claim;
  perform _claim_log(p_claim, 'status',
    p_status || case when p_status = 'aprovado' then ' · R$ ' || round(p_amount, 2) else '' end
    || coalesce(' · ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
end;
$$;

create or replace function public.admin_pay_claim(p_claim uuid, p_paid_at date, p_receipt text default null,
  p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('sinistros', 'editar');
  if p_paid_at is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;
  if p_receipt is not null and p_receipt not like 'claims/' || p_claim || '/%' then
    raise exception 'Comprovante inválido.' using errcode = 'P0001';
  end if;
  update claims set status = 'pago', paid_at = p_paid_at, receipt_path = coalesce(p_receipt, receipt_path)
    where id = p_claim and status = 'aprovado';
  if not found then
    raise exception 'Só sinistros aprovados podem ser pagos.' using errcode = 'P0001';
  end if;
  perform _claim_log(p_claim, 'pago', p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Painel financeiro (por mês, horário de Brasília)
-- ---------------------------------------------------------------------------
create or replace function public._finance_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_start timestamptz := _month_start(v_month);
  v_end timestamptz := _month_start((v_month + interval '1 month')::date);
  v_freight numeric; v_insurance numeric; v_discount numeric; v_charges numeric;
  v_fuel numeric; v_stores numeric; v_team numeric; v_claims numeric; v_refunds numeric;
  v_exp jsonb; v_exp_total numeric;
  v_revenue numeric; v_costs numeric;
begin
  select coalesce(sum(freight_after_discount_brl), 0), coalesce(sum(insurance_extra_cost_brl), 0),
         coalesce(sum(coupon_discount_brl), 0)
    into v_freight, v_insurance, v_discount
    from orders where paid_at >= v_start and paid_at < v_end and status <> 'cancelled';
  select coalesce(sum(amount_brl), 0) into v_charges
    from store_charges where status = 'paid' and paid_at >= v_start and paid_at < v_end;
  select coalesce(sum(actual_fuel_cost), 0) into v_fuel
    from trips where status = 'concluida' and finished_at >= v_start and finished_at < v_end;
  select coalesce(sum((_store_statement(id, v_month) ->> 'total')::numeric), 0) into v_stores
    from stores where is_pickup_point and exists (select 1 from store_pay_rules r where r.store_id = stores.id);
  select coalesce(sum((_team_statement(id, v_month) ->> 'total')::numeric), 0) into v_team from team_members;
  select coalesce(sum(approved_amount), 0) into v_claims
    from claims where status = 'pago' and paid_at >= v_month and paid_at < (v_month + interval '1 month')::date;
  select coalesce(sum(amount_brl), 0) into v_refunds
    from customer_refunds where status = 'pago' and paid_at >= v_month and paid_at < (v_month + interval '1 month')::date;
  select coalesce(jsonb_object_agg(g.grp, g.total), '{}'::jsonb), coalesce(sum(g.total), 0)
    into v_exp, v_exp_total
    from (select c.grp, sum(e.amount_brl) as total from expenses e join expense_categories c on c.id = e.category_id
          where e.status in ('aprovada', 'paga') and e.competence >= v_month
            and e.competence < (v_month + interval '1 month')::date
          group by c.grp) g;
  v_revenue := v_freight + v_insurance + v_charges;
  v_costs := v_fuel + v_stores + v_team + v_exp_total + v_claims + v_refunds;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'revenue', jsonb_build_object('freight', round(v_freight, 2), 'insurance', round(v_insurance, 2),
      'storeCharges', round(v_charges, 2), 'discounts', round(v_discount, 2), 'total', round(v_revenue, 2)),
    'costs', jsonb_build_object('fuel', round(v_fuel, 2), 'stores', round(v_stores, 2), 'team', round(v_team, 2),
      'expenses', v_exp, 'expensesTotal', round(v_exp_total, 2), 'claims', round(v_claims, 2),
      'refunds', round(v_refunds, 2), 'total', round(v_costs, 2)),
    'margin', round(v_revenue - v_costs, 2),
    'marginPct', case when v_revenue > 0 then round((v_revenue - v_costs) / v_revenue * 100, 1) end
  );
end;
$$;

create or replace function public.admin_finance_overview(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_prev date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date;
  v_hist jsonb := '[]'::jsonb;
begin
  if not has_any_perm(array['despesas', 'repasses', 'sinistros', 'dashboard'], 'ver') then
    perform _require_perm('repasses', 'ver');
  end if;
  for i in reverse 5..0 loop
    v_hist := v_hist || _finance_month((v_month - make_interval(months => i))::date);
  end loop;
  return jsonb_build_object(
    'month', _finance_month(v_month),
    'history', v_hist,
    'payables', jsonb_build_object(
      'closedMonth', to_char(v_prev, 'YYYY-MM'),
      'dueDate', _nth_business_day((v_prev + interval '1 month')::date, 5),
      'stores', round(coalesce((select sum((_store_statement(s.id, v_prev) ->> 'total')::numeric) from stores s
         where s.is_pickup_point and not exists (select 1 from store_payouts sp where sp.store_id = s.id and sp.month = v_prev)
           and exists (select 1 from store_pay_rules r where r.store_id = s.id)), 0), 2),
      'team', round(coalesce((select sum((_team_statement(tm.id, v_prev) ->> 'total')::numeric) from team_members tm
         where not exists (select 1 from team_payouts tp where tp.member_id = tm.id and tp.month = v_prev)), 0), 2),
      'expenses', round(coalesce((select sum(amount_brl) from expenses where status = 'aprovada'), 0), 2),
      'claims', round(coalesce((select sum(approved_amount) from claims where status = 'aprovado'), 0), 2),
      'refunds', round(coalesce((select sum(amount_brl) from customer_refunds where status = 'a_pagar'), 0), 2),
      'pendingExpenses', (select count(*) from expenses where status = 'pendente'),
      'openClaims', (select count(*) from claims where status in ('aberto', 'em_analise'))
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Ocorrência mostra o andamento do reembolso e do sinistro
-- ---------------------------------------------------------------------------
create or replace function public._occ_json(p_occ uuid, p_role text, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', c.id,
    'number', c.number,
    'typeId', c.type_id,
    'typeName', t.name,
    'systemKind', t.system_kind,
    'orderId', c.order_id,
    'storeCode', s.code,
    'storeName', s.name,
    'tripId', c.trip_id,
    'stopId', c.stop_id,
    'openedKind', c.opened_kind,
    'openedByName', case when p_role = 'admin' or c.opened_kind = 'customer' then op.name end,
    'description', c.description,
    'status', c.status,
    'assigneeId', case when p_role = 'admin' then c.assignee_id end,
    'assigneeName', case when p_role = 'admin' then asg.name end,
    'dueAt', c.due_at,
    'resolvedAt', c.resolved_at,
    'autoCloseAt', c.auto_close_at,
    'closedAt', c.closed_at,
    'lat', case when p_role in ('admin', 'driver') then c.lat end,
    'lng', case when p_role in ('admin', 'driver') then c.lng end,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at,
    'refunds', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('amount', rf.amount_brl, 'status', rf.status,
        'paidAt', rf.paid_at)) order by rf.created_at)
      from customer_refunds rf where rf.occurrence_id = c.id), '[]'::jsonb) end,
    'claims', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', cl.id, 'number', cl.number, 'status', cl.status,
        'approvedAmount', cl.approved_amount, 'paidAt', cl.paid_at)) order by cl.created_at)
      from claims cl where cl.occurrence_id = c.id), '[]'::jsonb) end,
    'updates', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', u.id, 'kind', u.kind, 'body', u.body, 'from', u.from_value, 'to', u.to_value,
        'internal', u.internal, 'authorKind', u.author_kind,
        'authorName', case when p_role = 'admin' or u.author_kind <> 'admin' then au.name end,
        'createdAt', u.created_at)) order by u.created_at, u.id)
      from occurrence_updates u left join profiles au on au.id = u.author_id
      where u.occurrence_id = c.id and (p_role = 'admin' or not u.internal)), '[]'::jsonb) end,
    'attachments', case when p_full then coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'mime', a.mime,
        'authorKind', a.author_kind, 'createdAt', a.created_at) order by a.created_at)
      from occurrence_attachments a where a.occurrence_id = c.id), '[]'::jsonb) end,
    'resolutions', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'kind', r.kind,
        'amountBrl', r.amount_brl, 'couponCode', r.coupon_code,
        'couponType', (select cp.type from coupons cp where cp.code = r.coupon_code), 'newGuardUntil', r.new_guard_until,
        'note', case when p_role = 'admin' then r.note end, 'createdAt', r.created_at)) order by r.created_at)
      from occurrence_resolutions r where r.occurrence_id = c.id), '[]'::jsonb) end
  ))
  from occurrences c
  join occurrence_types t on t.id = c.type_id
  left join stores s on s.id = c.store_id
  left join profiles op on op.id = c.opened_by
  left join profiles asg on asg.id = c.assignee_id
  where c.id = p_occ;
$$;

-- ---------------------------------------------------------------------------
-- 12. Bucket privado finance-docs: expenses/, team/, refunds/, claims/
--     (comprovante de loja continua em partner-docs, pasta payouts/)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-docs', 'finance-docs', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public._finance_folder_area(p_folder text)
returns text
language sql
immutable
as $$
  select case p_folder when 'expenses' then 'despesas' when 'team' then 'repasses'
    when 'refunds' then 'repasses' when 'claims' then 'sinistros' end;
$$;

create policy "finance docs upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'finance-docs' and public._finance_folder_area((storage.foldername(name))[1]) is not null
    and (public.has_perm(public._finance_folder_area((storage.foldername(name))[1]), 'criar')
         or public.has_perm(public._finance_folder_area((storage.foldername(name))[1]), 'editar'))
  );
create policy "finance docs read" on storage.objects
  for select to authenticated using (
    bucket_id = 'finance-docs' and public._finance_folder_area((storage.foldername(name))[1]) is not null
    and public.has_perm(public._finance_folder_area((storage.foldername(name))[1]), 'ver')
  );
create policy "finance docs delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'finance-docs' and (storage.foldername(name))[1] = 'expenses'
    and public.has_perm('despesas', 'excluir')
  );
-- Pagamento de loja pela tela de Repasses: comprovante em partner-docs/payouts.
create policy "finance staff upload store receipts" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'partner-docs' and (storage.foldername(name))[1] = 'payouts' and public.has_perm('repasses', 'editar')
  );
create policy "finance staff read store receipts" on storage.objects
  for select to authenticated using (
    bucket_id = 'partner-docs' and (storage.foldername(name))[1] = 'payouts' and public.has_perm('repasses', 'ver')
  );

-- ---------------------------------------------------------------------------
-- 13. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _team_statement(uuid, date),
  _claim_declared(jsonb),
  _claim_log(uuid, text, text),
  _occ_resolution_finance(),
  admin_expenses(date, date),
  admin_upsert_expense_category(uuid, jsonb),
  admin_save_expense(uuid, jsonb),
  admin_review_expense(uuid, boolean, text),
  admin_pay_expense(uuid, date, text),
  admin_delete_expense(uuid),
  admin_add_expense_file(uuid, text, text, text),
  admin_payouts_month(date),
  admin_add_team_adjustment(uuid, date, numeric, text),
  admin_remove_team_adjustment(uuid),
  admin_register_team_payout(uuid, date, numeric, date, text, text),
  admin_finance_store_payout(text, date, numeric, date, text, text),
  admin_pay_refund(uuid, date, text, text),
  admin_cancel_refund(uuid, text),
  _claim_json(uuid, boolean),
  admin_claims(),
  admin_claim(uuid),
  admin_open_claim(uuid, text),
  admin_set_claim_items(uuid, jsonb),
  admin_set_claim_status(uuid, text, numeric, text),
  admin_pay_claim(uuid, date, text, text),
  _finance_month(date),
  admin_finance_overview(date)
from public, anon, authenticated;

revoke all on function _finance_folder_area(text) from public, anon;
grant execute on function _finance_folder_area(text) to authenticated;

grant execute on function
  admin_expenses(date, date),
  admin_upsert_expense_category(uuid, jsonb),
  admin_save_expense(uuid, jsonb),
  admin_review_expense(uuid, boolean, text),
  admin_pay_expense(uuid, date, text),
  admin_delete_expense(uuid),
  admin_add_expense_file(uuid, text, text, text),
  admin_payouts_month(date),
  admin_add_team_adjustment(uuid, date, numeric, text),
  admin_remove_team_adjustment(uuid),
  admin_register_team_payout(uuid, date, numeric, date, text, text),
  admin_finance_store_payout(text, date, numeric, date, text, text),
  admin_pay_refund(uuid, date, text, text),
  admin_cancel_refund(uuid, text),
  admin_claims(),
  admin_claim(uuid),
  admin_open_claim(uuid, text),
  admin_set_claim_items(uuid, jsonb),
  admin_set_claim_status(uuid, text, numeric, text),
  admin_pay_claim(uuid, date, text, text),
  admin_finance_overview(date)
to authenticated;

-- Teste da 0022_finance.sql. Roda DEPOIS da migração, na MESMA transação,
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
  v_a uuid := gen_random_uuid();    -- Administrador
  v_l uuid := gen_random_uuid();    -- só lança despesas (criar)
  v_ap uuid := gen_random_uuid();   -- aprova despesas (criar + editar)
  v_c uuid := gen_random_uuid();    -- cliente
  v_role_l uuid; v_role_ap uuid;
  v_driver uuid; v_trip uuid;
  v_cat uuid; v_exp uuid; v_exp2 uuid;
  v_dest text; v_s1 text;
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  x uuid; y uuid;
  v_occ uuid; v_refund uuid; v_claim uuid; v_item uuid;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas, perfis e pedido de teste (somem no fim) -----------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_l, v_ap, v_c]) u;
  insert into staff_roles (name) values ('Lança despesas') returning id into v_role_l;
  insert into staff_role_permissions (role_id, area, can_view, can_create) values (v_role_l, 'despesas', true, true);
  insert into staff_roles (name) values ('Aprova despesas') returning id into v_role_ap;
  insert into staff_role_permissions (role_id, area, can_view, can_create, can_edit) values (v_role_ap, 'despesas', true, true, true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_l, v_role_l), (v_ap, v_role_ap);
  insert into team_members (name, kind) values ('Entregador Financeiro', 'entregador') returning id into v_driver;
  insert into team_pay_rules (member_id, kind, amount_brl) values (v_driver, 'fixo_mensal', 1500), (v_driver, 'por_parada', 5);
  insert into trips (day, driver_id, status, finished_at, actual_driver_cost, actual_fuel_cost)
  values (current_date, v_driver, 'concluida', now(), 80, 20) returning id into v_trip;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta X', 'game', 'magic', 'price', 40, 'priceMode', 'unit', 'quantity', 2))))));
  y := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta Y', 'game', 'magic', 'price', 5, 'priceMode', 'unit', 'quantity', 1))))));
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y);
  perform _t_as(v_c);
  perform pay_order(x, 'pix');

  -- 2. Despesas: lançar, aprovar (outra pessoa), pagar ------------------------------------
  perform _t_as(null);
  select id into v_cat from expense_categories where name = 'Embalagem e etiquetas';
  perform _t_check('categorias iniciais nos 4 grupos', (select count(distinct grp) = 4 from expense_categories));
  perform _t_as(v_l);
  v_exp := admin_save_expense(null, jsonb_build_object('categoryId', v_cat, 'description', 'Caixas de papelão',
    'amount', 120.5, 'competence', v_month));
  perform _t_as(null);
  perform _t_check('despesa nasce pendente', (select status = 'pendente' and amount_brl = 120.50 from expenses where id = v_exp));
  perform _t_as(v_l);
  perform _t_err('quem só lança não aprova', format('select admin_review_expense(%L, true)', v_exp), 'não permite');
  perform _t_err('despesa sem valor', format('select admin_save_expense(null, %L::jsonb)',
    jsonb_build_object('categoryId', v_cat, 'description', 'X teste', 'amount', 0, 'competence', v_month)), 'valor');
  perform _t_as(v_ap);
  v_exp2 := admin_save_expense(null, jsonb_build_object('categoryId', v_cat, 'description', 'Fita adesiva',
    'amount', 30, 'competence', v_month));
  perform _t_err('quem lançou não aprova a própria', format('select admin_review_expense(%L, true)', v_exp2), 'Outra pessoa');
  perform _t_err('recusa sem motivo', format('select admin_review_expense(%L, false)', v_exp), 'motivo');
  perform _t_err('pagar antes de aprovar', format('select admin_pay_expense(%L, current_date)', v_exp), 'aprovadas');
  perform admin_review_expense(v_exp, true);
  perform admin_pay_expense(v_exp, current_date);
  perform _t_as(null);
  perform _t_check('aprovada por outra pessoa e paga',
    (select status = 'paga' and reviewed_by = v_ap and paid_at = current_date from expenses where id = v_exp));
  perform _t_as(v_l);
  perform _t_err('paga não é editada', format('select admin_save_expense(%L, %L::jsonb)', v_exp,
    jsonb_build_object('categoryId', v_cat, 'description', 'Mudou', 'amount', 1, 'competence', v_month)), 'não pode ser editada');
  perform _t_as(v_a);
  perform admin_review_expense(v_exp2, true);
  perform _t_check('Administrador aprova a própria? (lançada por outro: ok)', (select status = 'aprovada' from expenses where id = v_exp2));

  -- 3. Repasse da equipe: viagens + fixo + avulsos ------------------------------------------
  perform _t_as(null);
  r := _team_statement(v_driver, v_month);
  perform _t_check('repasse = viagens 80 + fixo 1500 (regras por viagem não somam de novo)',
    (r ->> 'tripCost')::numeric = 80 and (r ->> 'fixed')::numeric = 1500 and (r ->> 'total')::numeric = 1580, r::text);
  perform _t_as(v_a);
  perform admin_add_team_adjustment(v_driver, v_month, 50, 'Diária extra');
  perform _t_as(null);
  perform _t_check('avulso entra no total',
    ((_team_statement(v_driver, v_month)) ->> 'total')::numeric = 1630);
  perform _t_as(v_a);
  r := admin_payouts_month(v_month);
  perform _t_check('mês de repasses lista a pessoa com o valor',
    exists (select 1 from jsonb_array_elements(r -> 'team') e where (e ->> 'id')::uuid = v_driver
            and (e -> 'statement' ->> 'total')::numeric = 1630), (r -> 'team')::text);
  perform _t_as(null);
  perform _t_check('vencimento no 5º dia útil do mês seguinte',
    (r ->> 'dueDate')::date = _nth_business_day((v_month + interval '1 month')::date, 5));
  perform _t_as(v_a);
  perform admin_register_team_payout(v_driver, v_month, 1630, current_date, null, 'Pix');
  perform _t_err('avulso em mês já pago', format('select admin_add_team_adjustment(%L, %L, 10, %L)', v_driver, v_month, 'Bônus'),
    'já foi pago');
  perform _t_as(null);
  perform _t_check('pagamento registrado', ((_team_statement(v_driver, v_month)) -> 'payout' ->> 'amount')::numeric = 1630);
  perform _t_as(v_a);

  -- 4. Reembolso a partir da ocorrência ---------------------------------------------------
  r := admin_open_occurrence(jsonb_build_object('typeId', (select id from occurrence_types where name = 'Carta faltando'),
    'orderId', x, 'description', 'Faltou uma carta X'));
  v_occ := (r ->> 'id')::uuid;
  perform admin_add_resolution(v_occ, '{"kind": "reembolso", "amountBrl": 30}');
  perform _t_as(null);
  select id into v_refund from customer_refunds where occurrence_id = v_occ;
  perform _t_check('resolução "reembolso" cria o item a pagar', v_refund is not null
    and (select status = 'a_pagar' and amount_brl = 30 and user_id = v_c from customer_refunds where id = v_refund));
  perform _t_as(v_a);
  perform _t_check('reembolso aparece em Clientes',
    exists (select 1 from jsonb_array_elements(admin_payouts_month(v_month) -> 'customers') e where (e ->> 'id')::uuid = v_refund));
  perform admin_pay_refund(v_refund, current_date);
  perform _t_as(v_c);
  r := (select e from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ);
  perform _t_check('cliente vê o reembolso pago', r -> 'refunds' -> 0 ->> 'status' = 'pago', r::text);

  -- 5. Sinistro a partir da ocorrência ------------------------------------------------------
  perform _t_as(v_a);
  perform admin_add_resolution(v_occ, '{"kind": "sinistro", "amountBrl": 500}');
  perform _t_as(null);
  select id into v_claim from claims where occurrence_id = v_occ;
  perform _t_check('resolução "sinistro" cria o sinistro; sugestão limitada à cobertura',
    (select status = 'aberto' and declared_amount = 500 and suggested_amount = coverage_brl and coverage_brl = 100
     from claims where id = v_claim));
  select ci.id into v_item from pedido_groups g join pedido_card_items ci on ci.group_id = g.id where g.order_id = x;
  perform _t_as(v_a);
  perform admin_set_claim_items(v_claim, jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'qty', 1)));
  perform _t_as(null);
  perform _t_check('itens afetados: declarado 1 × R$ 40 e sugestão = menor valor',
    (select declared_amount = 40 and suggested_amount = 40 from claims where id = v_claim));
  perform _t_as(v_a);
  perform _t_err('item de outro pedido', format('select admin_set_claim_items(%L, %L::jsonb)', v_claim,
    jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId',
      (select ci.id from pedido_groups g join pedido_card_items ci on ci.group_id = g.id where g.order_id = y), 'qty', 1))),
    'não é deste pedido');
  perform _t_err('quantidade maior que a do pedido', format('select admin_set_claim_items(%L, %L::jsonb)', v_claim,
    jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'qty', 3))), 'inválido');
  perform _t_err('aprovar sem valor', format('select admin_set_claim_status(%L, %L)', v_claim, 'aprovado'), 'valor');
  perform admin_set_claim_status(v_claim, 'aprovado', 40);
  perform _t_check('aprovado aparece em Clientes',
    exists (select 1 from jsonb_array_elements(admin_payouts_month(v_month) -> 'customers') e where (e ->> 'id')::uuid = v_claim));
  perform admin_pay_claim(v_claim, current_date);
  perform _t_err('sinistro pago não muda', format('select admin_set_claim_status(%L, %L, null, %L)', v_claim, 'negado', 'teste'),
    'encerrado');
  perform _t_as(v_c);
  r := (select e from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ);
  perform _t_check('cliente vê o sinistro pago com o valor',
    r -> 'claims' -> 0 ->> 'status' = 'pago' and (r -> 'claims' -> 0 ->> 'approvedAmount')::numeric = 40, r::text);
  perform _t_as(v_a);
  perform _t_check('abrir sinistro direto pelo pedido', admin_open_claim(y, 'Pacote molhado na chuva') is not null);
  r := admin_claim(v_claim);
  perform _t_check('detalhe do sinistro traz os itens do pedido e o histórico',
    jsonb_array_length(r -> 'orderItems') = 1 and jsonb_array_length(r -> 'events') >= 4, r::text);

  -- 6. Painel -----------------------------------------------------------------------------
  r := admin_finance_overview(v_month);
  perform _t_check('painel: receita inclui o frete do pedido pago no mês',
    (r -> 'month' -> 'revenue' ->> 'freight')::numeric >= (select freight_after_discount_brl from orders where id = x), r::text);
  perform _t_check('painel: custos com combustível, equipe, despesas, sinistro e reembolso',
    (r -> 'month' -> 'costs' ->> 'fuel')::numeric >= 20 and (r -> 'month' -> 'costs' ->> 'team')::numeric >= 1630
    and (r -> 'month' -> 'costs' -> 'expenses' ->> 'operacao')::numeric >= 150.5
    and (r -> 'month' -> 'costs' ->> 'claims')::numeric >= 40 and (r -> 'month' -> 'costs' ->> 'refunds')::numeric >= 30);
  perform _t_check('painel: margem = receita − custos e 6 meses de histórico',
    (r -> 'month' ->> 'margin')::numeric = (r -> 'month' -> 'revenue' ->> 'total')::numeric - (r -> 'month' -> 'costs' ->> 'total')::numeric
    and jsonb_array_length(r -> 'history') = 6);
  perform _t_as(v_c);
  perform _t_err('cliente não vê o financeiro', 'select admin_expenses(current_date - 30, current_date)', 'Acesso restrito');
  perform _t_as(v_l);
  perform _t_err('perfil só de despesas não vê repasses', format('select admin_payouts_month(%L)', v_month), 'não permite');

  -- 7. Resultado: o erro abaixo é de propósito e desfaz TUDO ---------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
