-- TESTE da 0014 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. Gerado de migrations/0014_order_events.sql + tests/0014_order_events_test.sql.

begin;

-- Backoffice, entrega 2: linha do tempo dos pedidos + mover pedido pelo Kanban.
-- Ver supabase/migrations/rollback/0014_down.sql.
--
-- Todo evento é gravado por GATILHO (orders, store_charges, support_tickets),
-- venha a mudança de onde vier: cliente pagando, admin pelo painel, funções
-- antigas. Nenhuma tela precisa lembrar de registrar o histórico.
--
-- Quem fez: a função do admin marca a transação com set_config('t1.actor',
-- 'admin', true) e passa o motivo em 't1.reason'. Sem a marca, vale o dono do
-- pedido (cliente), um admin mexendo em pedido alheio (funções antigas) ou
-- "sistema" quando não há usuário (SQL Editor).
--
-- Aditiva: as funções antigas (advance_delivery_stage, admin_complete_order,
-- admin_cancel_order) continuam iguais, então o site já publicado não quebra.

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  -- clock_timestamp(), e não now(): uma ação gera vários eventos na mesma
  -- transação (pagar loja extra = itens + seguro + pagamento) e a ordem importa.
  created_at timestamptz not null default clock_timestamp(),
  actor_id uuid references profiles(id) on delete set null,
  actor_kind text not null,
  kind text not null,
  from_value text,
  to_value text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  -- Reconstruído das datas que o banco já tinha, para pedidos anteriores a esta migração.
  backfilled boolean not null default false,
  constraint order_events_actor_kind_check check (actor_kind in ('customer', 'admin', 'system')),
  constraint order_events_kind_check check (kind in (
    'created', 'paid', 'stage_changed', 'completed', 'cancelled',
    'items_added', 'insurance_changed',
    'store_charge_created', 'store_charge_paid',
    'ticket_opened', 'ticket_resolved', 'ticket_reopened'
  )),
  constraint order_events_reason_length_check check (coalesce(char_length(reason), 0) <= 500)
);

create index order_events_order_idx on order_events (order_id, created_at);
create index order_events_created_idx on order_events (created_at desc);
create index order_events_actor_idx on order_events (actor_id);

alter table order_events enable row level security;
create policy "admins read all order events" on order_events for select using (is_admin());
revoke insert, update, delete on order_events from anon, authenticated;
revoke select on order_events from anon;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'admin' then
    actor_kind := 'admin';
  elsif actor_id is null then
    actor_kind := 'system';
  elsif actor_id = p_owner then
    actor_kind := 'customer';
  elsif is_admin() then
    actor_kind := 'admin';
  else
    actor_kind := 'system';
  end if;
end;
$$;

create or replace function public._log_order_event(
  p_order uuid, p_owner uuid, p_kind text,
  p_from text default null, p_to text default null,
  p_details jsonb default '{}'::jsonb, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from _order_event_actor(p_owner);
  insert into order_events (order_id, actor_id, actor_kind, kind, from_value, to_value, reason, details)
  values (
    p_order, a.actor_id, a.actor_kind, p_kind, p_from, p_to,
    coalesce(p_reason, nullif(current_setting('t1.reason', true), '')),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Gatilhos
-- ---------------------------------------------------------------------------
-- create_order (e add_store_charge) inserem a linha e logo depois a atualizam
-- na MESMA transação, com os totais calculados. Esse update não é uma mudança:
-- ele só completa o registro de criação. Reconhecemos o caso porque
-- created_at (default now()) é igual ao now() da transação.

create or replace function public._orders_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  if tg_op = 'INSERT' then
    perform _log_order_event(new.id, new.user_id, 'created', null, new.status::text,
      jsonb_build_object('amountDueBRL', new.amount_due_brl, 'itemsTotalBRL', new.items_total_brl));
    return new;
  end if;

  if old.created_at = now() then
    v_snapshot := jsonb_build_object(
      'amountDueBRL', new.amount_due_brl,
      'itemsTotalBRL', new.items_total_brl,
      'insuranceCoverageBRL', new.insurance_coverage_brl,
      'insuranceExtraCostBRL', new.insurance_extra_cost_brl
    );
    update order_events set details = details || v_snapshot
      where order_id = new.id and kind = 'created';
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending-payment' and new.status = 'active' then
      perform _log_order_event(new.id, new.user_id, 'paid', old.status::text, new.delivery_stage::text,
        jsonb_build_object('amountDueBRL', new.amount_due_brl, 'paymentMethod', new.payment_method));
    elsif new.status = 'completed' then
      perform _log_order_event(new.id, new.user_id, 'completed',
        coalesce(old.delivery_stage::text, old.status::text), 'completed');
    elsif new.status = 'cancelled' then
      perform _log_order_event(new.id, new.user_id, 'cancelled',
        case when old.status = 'active' then old.delivery_stage::text else old.status::text end,
        'cancelled', '{}'::jsonb,
        coalesce(nullif(current_setting('t1.reason', true), ''), new.cancel_reason));
    end if;
  elsif new.delivery_stage is distinct from old.delivery_stage then
    perform _log_order_event(new.id, new.user_id, 'stage_changed',
      old.delivery_stage::text, new.delivery_stage::text);
  end if;

  if new.items_total_brl is distinct from old.items_total_brl then
    perform _log_order_event(new.id, new.user_id, 'items_added',
      old.items_total_brl::text, new.items_total_brl::text);
  end if;
  if new.insurance_coverage_brl is distinct from old.insurance_coverage_brl
     or new.insurance_extra_cost_brl is distinct from old.insurance_extra_cost_brl then
    perform _log_order_event(new.id, new.user_id, 'insurance_changed',
      old.insurance_coverage_brl::text, new.insurance_coverage_brl::text,
      jsonb_build_object(
        'fromExtraCostBRL', old.insurance_extra_cost_brl,
        'toExtraCostBRL', new.insurance_extra_cost_brl
      ));
  end if;
  return new;
end;
$$;

create trigger orders_log_events
  after insert or update on orders
  for each row execute function _orders_log_events();

create or replace function public._store_charges_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_details jsonb;
begin
  select user_id into v_owner from orders where id = new.order_id;
  v_details := jsonb_build_object(
    'chargeId', new.id,
    'amountBRL', new.amount_brl,
    'itemsTotalAddedBRL', new.items_total_added_brl,
    'insuranceUpgradeCoverageBRL', new.insurance_upgrade_coverage_brl,
    'storeCodes', coalesce((
      select jsonb_agg(s.code order by s.code)
      from store_charge_stores scs join stores s on s.id = scs.store_id
      where scs.charge_id = new.id
    ), '[]'::jsonb)
  );

  if tg_op = 'INSERT' then
    perform _log_order_event(new.order_id, v_owner, 'store_charge_created', null, new.amount_brl::text, v_details);
    return new;
  end if;

  if old.created_at = now() then
    update order_events set to_value = new.amount_brl::text, details = v_details
      where order_id = new.order_id and kind = 'store_charge_created'
        and details ->> 'chargeId' = new.id::text;
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'paid' then
    perform _log_order_event(new.order_id, v_owner, 'store_charge_paid', null, new.amount_brl::text,
      v_details || jsonb_build_object('paymentMethod', new.payment_method));
  end if;
  return new;
end;
$$;

create trigger store_charges_log_events
  after insert or update on store_charges
  for each row execute function _store_charges_log_events();

create or replace function public._support_tickets_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from orders where id = new.order_id;
  if tg_op = 'INSERT' then
    perform _log_order_event(new.order_id, v_owner, 'ticket_opened', null, null,
      jsonb_build_object('ticketId', new.id, 'subject', new.subject));
  elsif new.resolved is distinct from old.resolved then
    perform _log_order_event(new.order_id, v_owner,
      case when new.resolved then 'ticket_resolved' else 'ticket_reopened' end, null, null,
      jsonb_build_object('ticketId', new.id, 'subject', new.subject));
  end if;
  return new;
end;
$$;

create trigger support_tickets_log_events
  after insert or update on support_tickets
  for each row execute function _support_tickets_log_events();

-- ---------------------------------------------------------------------------
-- 4. Mover pedido (Kanban e detalhe do pedido)
-- ---------------------------------------------------------------------------
-- Mesmas regras de src/lib/admin/order-moves.ts:
--   próxima etapa / concluir a partir da retirada → motivo opcional;
--   voltar ou pular etapa, concluir antes da retirada, cancelar → motivo obrigatório;
--   aguardando pagamento só pode ser cancelado; concluído e cancelado são finais.
create or replace function public.admin_move_order(p_order uuid, p_target text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stages text[] := array['aguardando-coleta', 'em-transporte', 'disponivel-para-retirada'];
  v_from int;
  v_to int;
begin
  perform _require_admin();
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'O motivo é longo demais.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Este pedido já está finalizado.' using errcode = 'P0001';
  end if;

  perform set_config('t1.actor', 'admin', true);
  perform set_config('t1.reason', coalesce(v_reason, ''), true);

  if p_target = 'cancelled' then
    if v_reason is null then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    update orders set status = 'cancelled', cancel_reason = v_reason where id = p_order;
    return;
  end if;

  if v_order.status = 'pending-payment' then
    raise exception 'O pedido ainda não foi pago: ele só pode ser cancelado.' using errcode = 'P0001';
  end if;

  if p_target = 'completed' then
    if v_order.delivery_stage is distinct from 'disponivel-para-retirada' and v_reason is null then
      raise exception 'Informe o motivo para concluir antes da retirada.' using errcode = 'P0001';
    end if;
    update orders set status = 'completed', completed_at = now() where id = p_order;
    return;
  end if;

  v_to := array_position(v_stages, p_target);
  if v_to is null then
    raise exception 'Destino inválido.' using errcode = 'P0001';
  end if;
  v_from := array_position(v_stages, v_order.delivery_stage::text);
  if v_to = v_from then
    raise exception 'O pedido já está nessa etapa.' using errcode = 'P0001';
  end if;
  if v_to <> v_from + 1 and v_reason is null then
    raise exception 'Informe o motivo para voltar ou pular etapas.' using errcode = 'P0001';
  end if;
  update orders set delivery_stage = p_target::delivery_stage where id = p_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------
revoke all on function
  _order_event_actor(uuid),
  _log_order_event(uuid, uuid, text, text, text, jsonb, text),
  _orders_log_events(),
  _store_charges_log_events(),
  _support_tickets_log_events(),
  admin_move_order(uuid, text, text)
from public, anon, authenticated;

grant execute on function admin_move_order(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Pedidos que já existiam: reconstrói a linha do tempo com as datas que o
--    banco tinha. Mudanças de etapa anteriores não foram guardadas em lugar
--    nenhum e ficam de fora (a tela avisa).
-- ---------------------------------------------------------------------------
insert into order_events (order_id, created_at, actor_id, actor_kind, kind, to_value, details, backfilled)
select id, created_at, user_id, 'customer', 'created', 'pending-payment',
  jsonb_build_object(
    'amountDueBRL', amount_due_brl, 'itemsTotalBRL', items_total_brl,
    'insuranceCoverageBRL', insurance_coverage_brl, 'insuranceExtraCostBRL', insurance_extra_cost_brl
  ), true
from orders;

insert into order_events (order_id, created_at, actor_id, actor_kind, kind, from_value, to_value, details, backfilled)
select id, paid_at, user_id, 'customer', 'paid', 'pending-payment', 'aguardando-coleta',
  jsonb_build_object('amountDueBRL', amount_due_brl, 'paymentMethod', payment_method), true
from orders where paid_at is not null;

-- Quem concluiu (cliente ou admin) não ficou registrado.
insert into order_events (order_id, created_at, actor_kind, kind, to_value, backfilled)
select id, completed_at, 'system', 'completed', 'completed', true
from orders where status = 'completed' and completed_at is not null;

-- Só o admin cancela, mas a data não ficou registrada: entra logo depois do
-- último fato conhecido, marcado como "data desconhecida".
insert into order_events (order_id, created_at, actor_kind, kind, to_value, reason, details, backfilled)
select id, coalesce(paid_at, created_at), 'admin', 'cancelled', 'cancelled', cancel_reason,
  jsonb_build_object('timeUnknown', true), true
from orders where status = 'cancelled';

insert into order_events (order_id, created_at, actor_id, actor_kind, kind, to_value, details, backfilled)
select sc.order_id, sc.created_at, o.user_id, 'customer', 'store_charge_created', sc.amount_brl::text,
  jsonb_build_object('chargeId', sc.id, 'amountBRL', sc.amount_brl,
    'itemsTotalAddedBRL', sc.items_total_added_brl,
    'insuranceUpgradeCoverageBRL', sc.insurance_upgrade_coverage_brl,
    'storeCodes', coalesce((
      select jsonb_agg(s.code order by s.code)
      from store_charge_stores scs join stores s on s.id = scs.store_id
      where scs.charge_id = sc.id
    ), '[]'::jsonb)), true
from store_charges sc join orders o on o.id = sc.order_id;

insert into order_events (order_id, created_at, actor_id, actor_kind, kind, to_value, details, backfilled)
select sc.order_id, sc.paid_at, o.user_id, 'customer', 'store_charge_paid', sc.amount_brl::text,
  jsonb_build_object('chargeId', sc.id, 'amountBRL', sc.amount_brl, 'paymentMethod', sc.payment_method,
    'storeCodes', coalesce((
      select jsonb_agg(s.code order by s.code)
      from store_charge_stores scs join stores s on s.id = scs.store_id
      where scs.charge_id = sc.id
    ), '[]'::jsonb)), true
from store_charges sc join orders o on o.id = sc.order_id
where sc.status = 'paid' and sc.paid_at is not null;

insert into order_events (order_id, created_at, actor_id, actor_kind, kind, details, backfilled)
select t.order_id, t.created_at, o.user_id, 'customer', 'ticket_opened',
  jsonb_build_object('ticketId', t.id, 'subject', t.subject), true
from support_tickets t join orders o on o.id = t.order_id;

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
