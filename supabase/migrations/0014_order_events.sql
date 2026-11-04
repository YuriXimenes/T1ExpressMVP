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
