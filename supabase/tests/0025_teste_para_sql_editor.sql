-- TESTE da 0025 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. A 0024 precisa estar aplicada.
-- Gerado de migrations/0025_system.sql + tests/0025_system_test.sql.

begin;

-- Entrega 10: Sistema e notificações.
--   1. Auditoria: tudo o que a EQUIPE (is_admin) cria, altera ou exclui no backoffice,
--      com antes e depois, quem, quando e o motivo (t1.reason). Dados sensíveis mascarados.
--   2. Sino: avisos calculados na hora por permissão (admin_notifications) + "lido".
--   3. Erros do site, do admin e do servidor (app_errors), agrupados, e saúde do sistema.
-- Precisa da 0024. Ver rollback/0025_down.sql.

-- Versão do banco que o site espera (Integrações avisa se estiver atrasada).
create or replace function public._schema_version()
returns text
language sql
immutable
as $$ select '0025'::text; $$;

-- ---------------------------------------------------------------------------
-- 1. Auditoria
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,
  area text not null,
  table_name text not null,
  record_id text,
  record_label text,
  action text not null check (action in ('criou', 'alterou', 'excluiu')),
  changes jsonb not null default '{}'::jsonb,
  reason text
);
create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index audit_log_area_idx on audit_log (area, created_at desc);
create index audit_log_record_idx on audit_log (table_name, record_id);

-- Ninguém lê ou altera por fora (nem a equipe): só admin_audit lê.
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;

-- Valor guardado na auditoria: campo sensível vira "•••"; texto longo é cortado.
create or replace function public._audit_value(p_key text, p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_value is null or p_value = 'null'::jsonb then 'null'::jsonb
    when p_key ~* '(^|_)(pix|bank|banco|agency|agencia|account|conta|cpf|cnpj|document|token|password|senha)(_|$)'
         or p_key in ('data', 'payout') then to_jsonb('•••'::text)
    when jsonb_typeof(p_value) = 'string' and char_length(p_value #>> '{}') > 300
      then to_jsonb(left(p_value #>> '{}', 300) || '…')
    when jsonb_typeof(p_value) in ('object', 'array') and char_length(p_value::text) > 1000
      then to_jsonb('(conteúdo longo)'::text)
    else p_value end;
$$;

-- Nome legível do registro (nome, código, número ou o pedido a que pertence).
create or replace function public._audit_label(p_table text, j jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order text := coalesce(j ->> 'order_id', case when p_table = 'orders' then j ->> 'id' end);
begin
  return case
    when p_table in ('orders', 'order_item_checks', 'order_photos', 'custody_events', 'order_pickups',
                     'store_charges', 'route_stop_orders', 'customer_refunds') and v_order is not null
      then 'Pedido #' || upper(left(v_order, 8))
    when p_table = 'occurrences' then 'OC-' || (j ->> 'number')
    when p_table in ('occurrence_resolutions', 'occurrence_attachments')
      then (select 'OC-' || number from occurrences where id = (j ->> 'occurrence_id')::uuid)
    when p_table = 'claims' then 'SN-' || (j ->> 'number')
    when p_table = 'coupons' then j ->> 'code'
    when p_table = 'expenses' then coalesce(j ->> 'description', 'Despesa')
    when p_table = 'freight_routes'
      then (select name from stores where id = (j ->> 'origin_store_id')::uuid) || ' → '
           || (select name from stores where id = (j ->> 'destination_store_id')::uuid)
    when p_table = 'pricing_versions'
      then 'Preço a partir de ' || to_char((j ->> 'effective_from')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    when p_table in ('partner_leads', 'store_suggestions') then j ->> 'store_name'
    when p_table = 'support_tickets' then j ->> 'subject'
    when p_table in ('admins', 'customer_credits')
      then (select name from profiles where id = coalesce(j ->> 'user_id', j ->> 'id')::uuid)
    when p_table = 'staff_role_permissions'
      then (select name from staff_roles where id = (j ->> 'role_id')::uuid) || ' · ' || (j ->> 'area')
    when p_table in ('staff_invites', 'store_invites') then coalesce(j ->> 'email', 'Convite')
    when p_table in ('team_pay_rules', 'team_adjustments', 'team_payouts')
      then (select name from team_members where id = (j ->> 'member_id')::uuid)
    when p_table in ('store_pay_rules', 'store_payouts', 'store_partner_profiles', 'store_members',
                     'store_closures', 'route_stops')
      then (select name from stores where id = (j ->> 'store_id')::uuid)
    when p_table = 'trips' then 'Viagem de ' || to_char((j ->> 'day')::date, 'DD/MM/YYYY')
    when p_table = 'routes' then 'Rota de ' || (j ->> 'kind') || ' ' || to_char((j ->> 'day')::date, 'DD/MM/YYYY')
    when p_table = 'fuel_prices' then 'Combustível ' || to_char((j ->> 'day')::date, 'DD/MM/YYYY')
    when p_table = 'partner_onboardings' then 'Cadastro de parceiro'
    when p_table = 'ops_settings' then 'Configurações da operação'
    else coalesce(j ->> 'name', j ->> 'label', j ->> 'code', j ->> 'description', j ->> 'kind')
  end;
exception
  when others then
    return null;
end;
$$;

-- Gatilho genérico. TG_ARGV[0] = área; TG_ARGV[1] = colunas da chave (separadas por vírgula).
create or replace function public._audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  j jsonb;
  k text;
  v_changes jsonb := '{}'::jsonb;
  v_action text;
  v_id text;
  v_uid uuid := auth.uid();
begin
  -- Só a equipe: cliente, loja, entregador e o sistema não entram.
  if v_uid is null or not is_admin() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); j := v_new; v_action := 'criou';
    for k in select key from jsonb_each(v_new) where value <> 'null'::jsonb loop
      if k not in ('id', 'created_at', 'updated_at') then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('new', _audit_value(k, v_new -> k)));
      end if;
    end loop;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); j := v_new; v_action := 'alterou';
    for k in select key from jsonb_each(v_new) loop
      if k not in ('updated_at', 'created_at') and (v_old -> k) is distinct from (v_new -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object(
          'old', _audit_value(k, v_old -> k), 'new', _audit_value(k, v_new -> k)));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  else
    v_old := to_jsonb(old); j := v_old; v_action := 'excluiu';
    for k in select key from jsonb_each(v_old) where value <> 'null'::jsonb loop
      if k not in ('id', 'created_at', 'updated_at') then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', _audit_value(k, v_old -> k)));
      end if;
    end loop;
  end if;

  if tg_argv[1] = 'token' then
    v_id := left(j ->> 'token', 6) || '…';
  else
    select string_agg(coalesce(j ->> btrim(c), ''), ':') into v_id
      from unnest(string_to_array(coalesce(tg_argv[1], 'id'), ',')) c;
  end if;

  insert into audit_log (actor_id, actor_name, area, table_name, record_id, record_label, action, changes, reason)
  values (v_uid, (select name from profiles where id = v_uid), tg_argv[0], tg_table_name, v_id,
          _audit_label(tg_table_name, j), v_action, v_changes,
          nullif(btrim(coalesce(current_setting('t1.reason', true), '')), ''));
  return null;
end;
$$;

-- Liga o gatilho nas tabelas que a equipe altera (tabela, área, chave).
do $$
declare
  t text[];
begin
  foreach t slice 1 in array array[
    ['stores', 'lojas', 'id'],
    ['freight_routes', 'comparador', 'id'],
    ['carrier_flat_rates', 'comparador', 'carrier'],
    ['comparison_carriers', 'comparativo', 'id'],
    ['comparison_rows', 'comparativo', 'id'],
    ['comparison_values', 'comparativo', 'row_id,carrier_id'],
    ['coupons', 'cupons', 'code'],
    ['pricing_versions', 'precos', 'id'],
    ['orders', 'pedidos', 'id'],
    ['store_charges', 'pedidos', 'id'],
    ['order_item_checks', 'pedidos', 'id'],
    ['order_photos', 'pedidos', 'id'],
    ['custody_events', 'pedidos', 'id'],
    ['order_pickups', 'pontos', 'order_id'],
    ['support_tickets', 'chamados', 'id'],
    ['partner_leads', 'formularios', 'id'],
    ['store_suggestions', 'formularios', 'id'],
    ['admins', 'pessoas', 'user_id'],
    ['staff_roles', 'pessoas', 'id'],
    ['staff_role_permissions', 'pessoas', 'role_id,area'],
    ['staff_invites', 'pessoas', 'token'],
    ['team_members', 'pessoas', 'id'],
    ['team_pay_rules', 'pessoas', 'id'],
    ['vehicles', 'coletas', 'id'],
    ['fuel_prices', 'coletas', 'day'],
    ['ops_settings', 'coletas', 'id'],
    ['store_closures', 'coletas', 'store_id,day'],
    ['trips', 'coletas', 'id'],
    ['routes', 'coletas', 'id'],
    ['route_stops', 'coletas', 'id'],
    ['route_stop_orders', 'coletas', 'stop_id,order_id'],
    ['occurrence_types', 'ocorrencias', 'id'],
    ['occurrences', 'ocorrencias', 'id'],
    ['occurrence_resolutions', 'ocorrencias', 'id'],
    ['occurrence_attachments', 'ocorrencias', 'id'],
    ['store_partner_profiles', 'lojas', 'store_id'],
    ['partner_onboardings', 'kyc', 'id'],
    ['partner_documents', 'kyc', 'id'],
    ['store_members', 'lojas', 'store_id,user_id'],
    ['store_invites', 'lojas', 'token'],
    ['store_pay_rules', 'repasses', 'id'],
    ['store_payouts', 'repasses', 'id'],
    ['team_adjustments', 'repasses', 'id'],
    ['team_payouts', 'repasses', 'id'],
    ['customer_refunds', 'repasses', 'id'],
    ['expense_categories', 'despesas', 'id'],
    ['expenses', 'despesas', 'id'],
    ['expense_files', 'despesas', 'id'],
    ['claims', 'sinistros', 'id'],
    ['customer_credits', 'usuarios', 'id']
  ] loop
    execute format('drop trigger if exists %I on %I', t[1] || '_audit', t[1]);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function _audit(%L, %L)',
                   t[1] || '_audit', t[1], t[2], t[3]);
  end loop;
end;
$$;

-- Leitura da auditoria. p: { from?, to? (AAAA-MM-DD), actorId?, area?, action?, q?, before? (id) }
create or replace function public.admin_audit(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := nullif(p ->> 'from', '')::date;
  v_to date := nullif(p ->> 'to', '')::date;
  v_actor uuid := nullif(p ->> 'actorId', '')::uuid;
  v_area text := nullif(p ->> 'area', '');
  v_action text := nullif(p ->> 'action', '');
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_before bigint := nullif(p ->> 'before', '')::bigint;
  v_items jsonb;
  v_last bigint;
  v_n int;
begin
  perform _require_perm('auditoria', 'ver');
  select coalesce(jsonb_agg(x.j order by x.id desc), '[]'::jsonb), min(x.id), count(*)
    into v_items, v_last, v_n
  from (
    select a.id, jsonb_strip_nulls(jsonb_build_object('id', a.id, 'at', a.created_at, 'actorId', a.actor_id,
      'actorName', a.actor_name, 'area', a.area, 'table', a.table_name, 'recordId', a.record_id,
      'recordLabel', a.record_label, 'action', a.action, 'changes', a.changes, 'reason', a.reason)) as j
    from audit_log a
    where (v_before is null or a.id < v_before)
      and (v_from is null or (a.created_at at time zone 'America/Sao_Paulo')::date >= v_from)
      and (v_to is null or (a.created_at at time zone 'America/Sao_Paulo')::date <= v_to)
      and (v_actor is null or a.actor_id = v_actor)
      and (v_area is null or a.area = v_area)
      and (v_action is null or a.action = v_action)
      and (v_q is null or a.record_label ilike '%' || v_q || '%' or a.record_id ilike '%' || v_q || '%'
           or a.actor_name ilike '%' || v_q || '%' or a.reason ilike '%' || v_q || '%'
           or a.changes::text ilike '%' || v_q || '%')
    order by a.id desc
    limit 100
  ) x;
  return jsonb_build_object(
    'items', v_items,
    'nextBefore', case when v_n = 100 then v_last end,
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', d.actor_id, 'name', d.actor_name) order by d.actor_name)
      from (select distinct on (actor_id) actor_id, actor_name from audit_log
            where actor_id is not null order by actor_id, created_at desc) d), '[]'::jsonb));
exception
  when invalid_text_representation or invalid_datetime_format then
    raise exception 'Confira os filtros.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Sino de notificações (calculado na hora; só o "lido" fica guardado)
-- ---------------------------------------------------------------------------
create table admin_notification_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  read_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table admin_notification_reads enable row level security;
revoke all on admin_notification_reads from anon, authenticated;

create or replace function public.admin_notifications()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v jsonb := '[]'::jsonb;
  v_prev date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date;
  v_due date;
  v_n int;
  v_total numeric;
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;

  -- Operação ------------------------------------------------------------------------
  if has_perm('ocorrencias', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'key', 'occ_due:' || o.id || ':' || case when o.due_at < now() then 'vencida' else 'vence' end,
        'category', 'operacao', 'severity', 'alta',
        'title', 'OC-' || o.number || case when o.due_at < now() then ' com prazo vencido' else ' vence em menos de 24 h' end,
        'detail', t.name, 'href', '/admin/pedidos/ocorrencias/' || o.id, 'at', o.due_at) as x
      from occurrences o join occurrence_types t on t.id = o.type_id
      where o.status in ('aberta', 'em_analise') and o.due_at < now() + interval '24 hours'
      order by o.due_at limit 20) s), '[]'::jsonb);
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'occ:' || o.id || ':aberta', 'category', 'operacao', 'severity', 'media',
        'title', 'Ocorrência OC-' || o.number || ' aberta', 'detail', t.name,
        'href', '/admin/pedidos/ocorrencias/' || o.id, 'at', o.created_at) as x
      from occurrences o join occurrence_types t on t.id = o.type_id
      where o.status = 'aberta' and o.due_at >= now() + interval '24 hours'
      order by o.created_at desc limit 20) s), '[]'::jsonb);
  end if;
  if has_perm('coletas', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'central:' || o.id, 'category', 'operacao', 'severity', 'media',
        'title', 'Pedido #' || upper(left(o.id::text, 8)) || ' parado na central',
        'detail', 'Recebido há mais de 1 dia, sem viagem de entrega', 'href', '/admin/pedidos/' || o.id,
        'at', e.at) as x
      from orders o
      cross join lateral (select max(created_at) as at from order_events
                          where order_id = o.id and kind = 'stage_changed' and to_value = 'recebido-na-central') e
      where o.status = 'active' and o.delivery_stage = 'recebido-na-central'
        and coalesce(e.at, o.paid_at) < now() - interval '1 day'
        and not exists (select 1 from route_stop_orders rso join route_stops rs on rs.id = rso.stop_id
                        join routes r on r.id = rs.route_id
                        where rso.order_id = o.id and r.kind = 'entrega' and r.status <> 'cancelada')
      order by e.at limit 20) s), '[]'::jsonb);
  end if;

  -- Financeiro ------------------------------------------------------------------------
  if has_perm('despesas', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'exp:' || e.id, 'category', 'financeiro', 'severity', 'media',
        'title', 'Despesa aguardando aprovação',
        'detail', e.description || ' · R$ ' || replace(to_char(e.amount_brl, 'FM999999990.00'), '.', ','),
        'href', '/admin/financeiro/despesas', 'at', e.created_at) as x
      from expenses e where e.status = 'pendente' order by e.created_at desc limit 20) s), '[]'::jsonb);
  end if;
  if has_perm('repasses', 'ver') then
    select count(*), coalesce(sum(total), 0) into v_n, v_total from (
      select (_store_statement(s.id, v_prev) ->> 'total')::numeric as total from stores s
      where s.is_pickup_point and exists (select 1 from store_pay_rules r where r.store_id = s.id)
        and not exists (select 1 from store_payouts p where p.store_id = s.id and p.month = v_prev)
      union all
      select (_team_statement(tm.id, v_prev) ->> 'total')::numeric from team_members tm
      where not exists (select 1 from team_payouts p where p.member_id = tm.id and p.month = v_prev)
    ) x where total > 0;
    if v_n > 0 then
      v_due := _nth_business_day((v_prev + interval '1 month')::date, 5);
      v := v || jsonb_build_array(jsonb_build_object(
        'key', 'payouts:' || to_char(v_prev, 'YYYY-MM') || ':' || v_n, 'category', 'financeiro',
        'severity', case when (now() at time zone 'America/Sao_Paulo')::date > v_due then 'alta' else 'media' end,
        'title', v_n || ' repasse(s) de ' || to_char(v_prev, 'MM/YYYY') || ' a pagar',
        'detail', 'R$ ' || replace(to_char(v_total, 'FM999999990.00'), '.', ',') || ' · vence em ' || to_char(v_due, 'DD/MM'),
        'href', '/admin/financeiro/despesas', 'at', v_due));
    end if;
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'refund:' || r.id, 'category', 'financeiro', 'severity', 'media',
        'title', 'Reembolso a pagar', 'detail', coalesce(p.name, 'Cliente') || ' · R$ '
          || replace(to_char(r.amount_brl, 'FM999999990.00'), '.', ','),
        'href', '/admin/financeiro/despesas', 'at', r.created_at) as x
      from customer_refunds r left join profiles p on p.id = r.user_id
      where r.status = 'a_pagar' order by r.created_at desc limit 20) s), '[]'::jsonb);
  end if;
  if has_perm('sinistros', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'claim:' || c.id || ':' || c.status, 'category', 'financeiro',
        'severity', case when c.status = 'aprovado' then 'alta' else 'media' end,
        'title', 'Sinistro SN-' || c.number || case when c.status = 'aprovado' then ' aprovado, a pagar' else ' para analisar' end,
        'detail', left(coalesce(c.description, ''), 80), 'href', '/admin/financeiro/sinistros/' || c.id,
        'at', coalesce(c.updated_at, c.created_at)) as x
      from claims c where c.status in ('aberto', 'em_analise', 'aprovado')
      order by c.created_at desc limit 20) s), '[]'::jsonb);
  end if;

  -- Parceiros e formulários -----------------------------------------------------------
  if has_perm('kyc', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'kyc:' || o.id || ':' || coalesce(o.submitted_at::text, ''), 'category', 'parceiros',
        'severity', 'media', 'title', 'Cadastro de parceiro para analisar',
        'detail', coalesce(l.store_name, 'Novo parceiro'), 'href', '/admin/parceiros/kyc/' || o.id,
        'at', coalesce(o.submitted_at, o.updated_at)) as x
      from partner_onboardings o left join partner_leads l on l.id = o.lead_id
      where o.status = 'em_analise' order by o.submitted_at desc nulls last limit 20) s), '[]'::jsonb);
  end if;
  if has_perm('formularios', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'lead:' || l.id, 'category', 'parceiros', 'severity', 'info',
        'title', 'Novo interessado em parceria', 'detail', l.store_name || ' · ' || l.city,
        'href', '/admin/formularios', 'at', l.created_at) as x
      from partner_leads l where not l.contacted order by l.created_at desc limit 20) s), '[]'::jsonb);
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'sugg:' || s2.id, 'category', 'parceiros', 'severity', 'info',
        'title', 'Nova sugestão de loja', 'detail', s2.store_name,
        'href', '/admin/formularios', 'at', s2.created_at) as x
      from store_suggestions s2 where not s2.contacted order by s2.created_at desc limit 20) s), '[]'::jsonb);
  end if;

  -- Clientes e plataforma -------------------------------------------------------------
  if has_any_perm(array['chamados', 'pedidos'], 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'ticket:' || t.id, 'category', 'clientes', 'severity', 'media',
        'title', 'Chamado de suporte em aberto', 'detail', t.subject,
        'href', '/admin/pedidos/' || t.order_id, 'at', t.created_at) as x
      from support_tickets t where not t.resolved order by t.created_at desc limit 20) s), '[]'::jsonb);
  end if;
  if has_perm('pedidos', 'ver') then
    v := v || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('key', 'unpaid:' || o.id, 'category', 'clientes', 'severity', 'info',
        'title', 'Pedido #' || upper(left(o.id::text, 8)) || ' sem pagamento há mais de 48 h',
        'detail', coalesce(p.name, 'Cliente') || ' · R$ ' || replace(to_char(o.amount_due_brl, 'FM999999990.00'), '.', ','),
        'href', '/admin/pedidos/' || o.id, 'at', o.created_at) as x
      from orders o left join profiles p on p.id = o.user_id
      where o.status = 'pending-payment' and o.created_at < now() - interval '48 hours'
      order by o.created_at desc limit 20) s), '[]'::jsonb);
  end if;
  if has_any_perm(array['comparador', 'indicadores'], 'ver') then
    select count(distinct (oid, s.destination_store_id)) into v_n
    from freight_simulations s cross join lateral unnest(s.origin_store_ids) oid
    where s.quote_failed and s.created_at > now() - interval '7 days'
      and not exists (select 1 from freight_routes r where r.origin_store_id = oid
                      and r.destination_store_id = s.destination_store_id);
    if v_n > 0 then
      v := v || jsonb_build_array(jsonb_build_object('key', 'cmp_fail:' || v_n, 'category', 'clientes',
        'severity', 'alta', 'title', v_n || ' rota(s) sem preço fizeram simulação falhar',
        'detail', 'Clientes não conseguiram calcular o frete nos últimos 7 dias',
        'href', case when has_perm('indicadores', 'ver') then '/admin/plataforma/indicadores#comparador'
                     else '/admin/plataforma/comparador' end,
        'at', now()));
    end if;
  end if;

  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(i || jsonb_build_object('read', r.key is not null)
        order by case i ->> 'severity' when 'alta' then 0 when 'media' then 1 else 2 end, (i ->> 'at') desc)
      from jsonb_array_elements(v) i
      left join admin_notification_reads r on r.user_id = v_uid and r.key = i ->> 'key'), '[]'::jsonb),
    'unread', (select count(*) from jsonb_array_elements(v) i
               where not exists (select 1 from admin_notification_reads r where r.user_id = v_uid and r.key = i ->> 'key')));
end;
$$;

create or replace function public.admin_mark_notifications(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;
  insert into admin_notification_reads (user_id, key)
  select auth.uid(), k from unnest(p_keys[1:500]) k where k is not null and char_length(k) <= 200
  on conflict do nothing;
  -- Lidos antigos não servem mais (os avisos já foram resolvidos).
  delete from admin_notification_reads where user_id = auth.uid() and read_at < now() - interval '90 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Erros e saúde do sistema
-- ---------------------------------------------------------------------------
create table app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null check (source in ('site', 'admin', 'server')),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 4000),
  path text check (char_length(path) <= 300),
  user_agent text check (char_length(user_agent) <= 300),
  last_user_id uuid references profiles(id) on delete set null,
  occurrences int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'aberto' check (status in ('aberto', 'resolvido')),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  reopened boolean not null default false
);
create index app_errors_last_seen_idx on app_errors (status, last_seen desc);
alter table app_errors enable row level security;
revoke all on app_errors from anon, authenticated;

-- Grava um erro (site, admin ou servidor). Liberado a visitante; nunca dá erro.
-- p: { source, message, stack?, path?, userAgent? }
create or replace function public.log_client_error(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := p ->> 'source';
  v_msg text := left(btrim(coalesce(p ->> 'message', '')), 500);
  v_stack text := left(p ->> 'stack', 4000);
  v_frame text;
  v_fp text;
begin
  if v_source not in ('site', 'admin', 'server') or v_msg = '' then
    return;
  end if;
  -- Ruído conhecido: extensões do navegador e mensagens sem informação.
  if v_msg ~* '(^script error\.?$|resizeobserver loop|chrome-extension://|moz-extension://|safari-extension://|destination stream closed early|^next_redirect|^next_not_found)'
     or coalesce(v_stack, '') ~* '(chrome-extension://|moz-extension://|safari-extension://)' then
    return;
  end if;
  -- Impressão digital: origem + mensagem sem números + 1º trecho da pilha sem linha/coluna.
  v_frame := regexp_replace(coalesce((regexp_match(coalesce(v_stack, ''), E'\\n\\s*at ([^\\n]+)'))[1], ''),
                            ':[0-9]+(:[0-9]+)?', '', 'g');
  v_fp := md5(v_source || '|' || regexp_replace(v_msg, '[0-9]+', '#', 'g') || '|' || left(v_frame, 200));

  update app_errors set occurrences = least(occurrences + 1, 1000000000), last_seen = now(),
         path = coalesce(left(p ->> 'path', 300), path), user_agent = coalesce(left(p ->> 'userAgent', 300), user_agent),
         last_user_id = coalesce(auth.uid(), last_user_id),
         reopened = reopened or status = 'resolvido',
         status = 'aberto'
    where fingerprint = v_fp;
  if found then
    return;
  end if;
  -- Enxurrada de erros diferentes: no máximo 200 novos por hora.
  if (select count(*) from app_errors where first_seen > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into app_errors (fingerprint, source, message, stack, path, user_agent, last_user_id)
  values (v_fp, v_source, v_msg, v_stack, left(p ->> 'path', 300), left(p ->> 'userAgent', 300), auth.uid())
  on conflict (fingerprint) do update set occurrences = app_errors.occurrences + 1, last_seen = now();
exception
  when others then
    return;
end;
$$;

create or replace function public.admin_errors(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('integracoes', 'ver');
  return coalesce((select jsonb_agg(x.j order by x.open desc, x.last_seen desc) from (
    select e.status = 'aberto' as open, e.last_seen, jsonb_strip_nulls(jsonb_build_object(
      'id', e.id, 'source', e.source, 'message', e.message, 'stack', e.stack, 'path', e.path,
      'userAgent', e.user_agent, 'occurrences', e.occurrences, 'firstSeen', e.first_seen,
      'lastSeen', e.last_seen, 'status', e.status, 'resolvedAt', e.resolved_at,
      'resolvedByName', pr.name, 'reopened', e.reopened)) as j
    from app_errors e left join profiles pr on pr.id = e.resolved_by
    where p_status is null or e.status = p_status
    order by e.status = 'aberto' desc, e.last_seen desc
    limit 300) x), '[]'::jsonb);
end;
$$;

create or replace function public.admin_resolve_error(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('integracoes', 'editar');
  update app_errors set status = 'resolvido', resolved_at = now(), resolved_by = auth.uid(), reopened = false
    where id = p_id;
  if not found then
    raise exception 'Erro não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

-- Saúde: banco respondendo, versão do banco, arquivos e números do sistema.
create or replace function public.system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('integracoes', 'ver');
  return jsonb_build_object(
    'dbTime', now(),
    'schemaVersion', _schema_version(),
    'buckets', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from storage.buckets),
    'openErrors', (select count(*) from app_errors where status = 'aberto'),
    'errors24h', (select coalesce(sum(occurrences), 0) from app_errors where last_seen > now() - interval '24 hours'),
    'auditToday', (select count(*) from audit_log
                   where (created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'simulations7d', (select count(*) from freight_simulations where created_at > now() - interval '7 days'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _schema_version(),
  _audit_value(text, jsonb),
  _audit_label(text, jsonb),
  _audit(),
  admin_audit(jsonb),
  admin_notifications(),
  admin_mark_notifications(text[]),
  log_client_error(jsonb),
  admin_errors(text),
  admin_resolve_error(uuid),
  system_health()
from public, anon, authenticated;

grant execute on function log_client_error(jsonb) to anon, authenticated;
grant execute on function
  admin_audit(jsonb),
  admin_notifications(),
  admin_mark_notifications(text[]),
  admin_errors(text),
  admin_resolve_error(uuid),
  system_health()
to authenticated;

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
