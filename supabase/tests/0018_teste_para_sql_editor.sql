-- TESTE da 0018 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. Gerado de migrations/0018_points_occurrences.sql + tests/0018_points_occurrences_test.sql.

begin;

-- Backoffice, entrega 6: pontos de retirada (pacotes guardados, prazo de guarda,
-- horário, capacidade e retiradas) e ocorrências (tipos editáveis, abertura
-- pelo admin, entregador, cliente ou sistema; linha do tempo, anexos e
-- resoluções). Precisa da 0014 a 0017. Ver rollback/0018_down.sql.
--
-- Sem agendador: o encerramento automático (3 dias úteis depois de resolvida) e
-- a ocorrência de "prazo de guarda vencido" são gravados pelas funções de
-- leitura do admin e nas próximas ações sobre ocorrências.

-- ---------------------------------------------------------------------------
-- 1. Linha do tempo do pedido: tipos novos e autor "sistema" explícito
-- ---------------------------------------------------------------------------
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened',
  'items_checked', 'custody',
  'route', 'stop_failed',
  'occurrence', 'pickup_deadline'
));

create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'system' then
    actor_id := null;
    actor_kind := 'system';
  elsif current_setting('t1.actor', true) = 'store' then
    actor_id := null;
    actor_kind := 'store';
  elsif current_setting('t1.actor', true) = 'driver' then
    actor_kind := 'driver';
  elsif current_setting('t1.actor', true) = 'admin' then
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

-- ---------------------------------------------------------------------------
-- 2. Dias úteis (seg a sex, sem os feriados de operating-calendar.ts)
-- ---------------------------------------------------------------------------
create or replace function public._easter(p_year int)
returns date
language plpgsql
immutable
as $$
declare
  a int := p_year % 19; b int := p_year / 100; c int := p_year % 100;
  d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

create or replace function public._is_holiday(p_day date)
returns boolean
language sql
immutable
as $$
  select to_char(p_day, 'MM-DD') in ('01-01', '01-20', '04-21', '04-23', '05-01', '09-07',
                                     '10-12', '11-02', '11-15', '11-20', '12-25')
    or p_day in (_easter(extract(year from p_day)::int) - 48, _easter(extract(year from p_day)::int) - 47,
                 _easter(extract(year from p_day)::int) - 2, _easter(extract(year from p_day)::int) + 60);
$$;

-- Mesmo horário (de Brasília), n dias úteis depois.
create or replace function public._add_business_days(p_at timestamptz, p_days int)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_local timestamp := p_at at time zone 'America/Sao_Paulo';
  v_day date := v_local::date;
  v_n int := 0;
begin
  while v_n < p_days loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 and not _is_holiday(v_day) then
      v_n := v_n + 1;
    end if;
  end loop;
  return (v_day + v_local::time) at time zone 'America/Sao_Paulo';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Pontos de retirada
-- ---------------------------------------------------------------------------
alter table stores add column pickup_hours jsonb not null default '{}'::jsonb;
alter table stores add column pickup_capacity int check (pickup_capacity between 1 and 10000);
alter table stores add column guard_days int not null default 7 check (guard_days between 1 and 90);

alter table order_pickups add column available_at timestamptz;
alter table order_pickups add column guard_until timestamptz;

-- Pacotes que já estão no ponto: a data vem da linha do tempo.
update order_pickups p set
  available_at = coalesce((
    select max(e.created_at) from order_events e
    where e.order_id = p.order_id and e.kind = 'stage_changed' and e.to_value = 'disponivel-para-retirada'
  ), now())
from orders o
where o.id = p.order_id and o.status = 'active' and o.delivery_stage = 'disponivel-para-retirada';
update order_pickups p set guard_until = p.available_at + make_interval(days => s.guard_days)
from orders o join stores s on s.id = o.destination_store_id
where o.id = p.order_id and p.available_at is not null;

create or replace function public._orders_mark_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delivery_stage = 'disponivel-para-retirada' and old.delivery_stage is distinct from new.delivery_stage then
    update order_pickups set
      available_at = now(),
      guard_until = now() + make_interval(days => (select guard_days from stores where id = new.destination_store_id))
    where order_id = new.id;
  end if;
  return new;
end;
$$;

create trigger orders_mark_available
  after update of delivery_stage on orders
  for each row execute function _orders_mark_available();

-- ---------------------------------------------------------------------------
-- 4. Ocorrências
-- ---------------------------------------------------------------------------
create table occurrence_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text check (coalesce(char_length(description), 0) <= 300),
  active boolean not null default true,
  driver_can boolean not null default false,
  customer_can boolean not null default false,
  -- Aberto pelo próprio banco: conferencia | loja_fechada | guarda_vencida.
  system_kind text unique check (system_kind in ('conferencia', 'loja_fechada', 'guarda_vencida')),
  deadline_hours int not null default 168 check (deadline_hours between 1 and 8760),
  requires_photo boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

insert into occurrence_types (name, driver_can, customer_can, system_kind, requires_photo, sort) values
  ('Pacote danificado', true, true, null, true, 10),
  ('Carta faltando', false, true, null, false, 20),
  ('Divergência na conferência', false, false, 'conferencia', false, 30),
  ('Loja fechada', true, false, 'loja_fechada', false, 40),
  ('Cliente não retirou no prazo', false, false, 'guarda_vencida', false, 50),
  ('Extravio / pedido não encontrado', true, false, null, false, 60),
  ('Atraso', false, true, null, false, 70),
  ('Furto', true, false, null, false, 80);

create sequence occurrence_number_seq start 1001;

create table occurrences (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('occurrence_number_seq'),
  type_id uuid not null references occurrence_types(id),
  order_id uuid references orders(id) on delete cascade,
  store_id uuid references stores(id),
  trip_id uuid references trips(id) on delete set null,
  stop_id uuid references route_stops(id) on delete set null,
  opened_by uuid references profiles(id) on delete set null,
  opened_kind text not null check (opened_kind in ('admin', 'driver', 'customer', 'system')),
  description text not null check (char_length(btrim(description)) between 3 and 2000),
  status text not null default 'aberta' check (status in ('aberta', 'em_analise', 'resolvida', 'encerrada')),
  assignee_id uuid references profiles(id) on delete set null,
  due_at timestamptz not null,
  resolved_at timestamptz,
  auto_close_at timestamptz,
  closed_at timestamptz,
  lat double precision,
  lng double precision,
  -- Evita abrir a mesma ocorrência automática duas vezes enquanto ela não encerra.
  dedupe_key text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter sequence occurrence_number_seq owned by occurrences.number;
create index occurrences_status_idx on occurrences (status);
create index occurrences_order_idx on occurrences (order_id);
create index occurrences_stop_idx on occurrences (stop_id);
create unique index occurrences_dedupe_idx on occurrences (dedupe_key) where status <> 'encerrada';

create table occurrence_updates (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references occurrences(id) on delete cascade,
  kind text not null check (kind in ('opened', 'comment', 'status', 'assign', 'resolution', 'attachment', 'reopened')),
  body text check (coalesce(char_length(body), 0) <= 2000),
  from_value text,
  to_value text,
  -- Nota interna: só o admin vê.
  internal boolean not null default false,
  author_id uuid references profiles(id) on delete set null,
  author_kind text not null check (author_kind in ('admin', 'driver', 'customer', 'system')),
  created_at timestamptz not null default clock_timestamp()
);
create index occurrence_updates_occ_idx on occurrence_updates (occurrence_id, created_at);

-- Arquivos no bucket order-photos, em "occurrences/<ocorrência>/<arquivo>".
create table occurrence_attachments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references occurrences(id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  name text check (coalesce(char_length(name), 0) <= 160),
  mime text check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  created_by uuid references profiles(id) on delete set null,
  author_kind text not null check (author_kind in ('admin', 'driver', 'customer')),
  created_at timestamptz not null default clock_timestamp()
);
create index occurrence_attachments_occ_idx on occurrence_attachments (occurrence_id);

-- Reembolso, crédito e sinistro ficam registrados aqui; o pagamento é da
-- entrega 8 (Financeiro). O cupom é criado na tabela coupons.
create table occurrence_resolutions (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references occurrences(id) on delete cascade,
  kind text not null check (kind in ('reembolso', 'sinistro', 'reenvio', 'devolucao_loja', 'credito',
                                     'cupom', 'prorrogacao_guarda', 'sem_acao')),
  amount_brl numeric(10,2) check (amount_brl >= 0),
  coupon_code text references coupons(code),
  new_guard_until timestamptz,
  note text check (coalesce(char_length(note), 0) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index occurrence_resolutions_occ_idx on occurrence_resolutions (occurrence_id);

-- Leitura: tipos para qualquer pessoa logada (o cliente escolhe na lista);
-- o resto só o admin direto, e cliente/entregador pelas funções.
alter table occurrence_types enable row level security;
alter table occurrences enable row level security;
alter table occurrence_updates enable row level security;
alter table occurrence_attachments enable row level security;
alter table occurrence_resolutions enable row level security;

create policy "logged read occurrence types" on occurrence_types for select to authenticated using (true);
create policy "staff read occurrences" on occurrences for select using (has_perm('ocorrencias', 'ver'));
create policy "staff read occurrence updates" on occurrence_updates for select using (has_perm('ocorrencias', 'ver'));
create policy "staff read occurrence attachments" on occurrence_attachments for select using (has_perm('ocorrencias', 'ver'));
create policy "staff read occurrence resolutions" on occurrence_resolutions for select using (has_perm('ocorrencias', 'ver'));

revoke insert, update, delete on occurrence_types, occurrences, occurrence_updates,
  occurrence_attachments, occurrence_resolutions from anon, authenticated;
revoke select on occurrence_types, occurrences, occurrence_updates,
  occurrence_attachments, occurrence_resolutions from anon;

-- ---------------------------------------------------------------------------
-- 5. Helpers das ocorrências
-- ---------------------------------------------------------------------------
-- Papel de quem está logado nesta ocorrência: admin | customer | driver | null.
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
  if _my_driver_id() is not null and (c.opened_by = auth.uid() or exists (
    select 1 from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
    where s.id = c.stop_id and t.driver_id = _my_driver_id())) then
    return 'driver';
  end if;
  return null;
end;
$$;

-- Usada na policy do Storage (o segundo pedaço do caminho é o id em texto).
create or replace function public._can_see_occurrence_path(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from occurrences where id::text = p_id and _occ_role(id) is not null);
$$;

create or replace function public._occ_log(p_occ uuid, p_kind text, p_body text, p_from text, p_to text,
  p_internal boolean, p_author_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into occurrence_updates (occurrence_id, kind, body, from_value, to_value, internal, author_id, author_kind)
  values (p_occ, p_kind, nullif(btrim(coalesce(p_body, '')), ''), p_from, p_to, p_internal,
          case when p_author_kind = 'system' then null else auth.uid() end, p_author_kind);
  update occurrences set updated_at = clock_timestamp() where id = p_occ;
$$;

-- Evento "ocorrência" na linha do tempo do pedido (se houver pedido).
create or replace function public._occ_order_event(p_occ uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select c.order_id, c.number, t.name as type_name, o.user_id
    into r
    from occurrences c join occurrence_types t on t.id = c.type_id
    left join orders o on o.id = c.order_id
    where c.id = p_occ;
  if r.order_id is null then
    return;
  end if;
  perform _log_order_event(r.order_id, r.user_id, 'occurrence', null, p_action,
    jsonb_build_object('occurrenceId', p_occ, 'number', r.number, 'type', r.type_name), p_reason);
end;
$$;

create or replace function public._occ_create(p_type uuid, p_kind text, p_order uuid, p_store uuid,
  p_trip uuid, p_stop uuid, p_description text, p_lat double precision default null,
  p_lng double precision default null, p_dedupe text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_hours int;
  v_prev text := current_setting('t1.actor', true);
begin
  select deadline_hours into v_hours from occurrence_types where id = p_type;
  insert into occurrences (type_id, order_id, store_id, trip_id, stop_id, opened_by, opened_kind,
                           description, due_at, lat, lng, dedupe_key)
  values (p_type, p_order, p_store, p_trip, p_stop,
          case when p_kind = 'system' then null else auth.uid() end, p_kind,
          btrim(p_description), now() + make_interval(hours => v_hours), p_lat, p_lng, p_dedupe)
  on conflict (dedupe_key) where status <> 'encerrada' do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  insert into occurrence_updates (occurrence_id, kind, to_value, author_id, author_kind)
  values (v_id, 'opened', 'aberta', case when p_kind = 'system' then null else auth.uid() end, p_kind);
  if p_kind = 'system' then
    perform set_config('t1.actor', 'system', true);
  end if;
  perform _occ_order_event(v_id, 'aberta');
  perform set_config('t1.actor', coalesce(v_prev, ''), true);
  return v_id;
end;
$$;

create or replace function public._occ_system_type(p_kind text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from occurrence_types where system_kind = p_kind and active;
$$;

-- Resolvidas há 3 dias úteis passam a encerradas.
create or replace function public._occ_autoclose()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prev text := current_setting('t1.actor', true);
begin
  for v_id in
    update occurrences set status = 'encerrada', closed_at = now(), updated_at = clock_timestamp()
    where status = 'resolvida' and auto_close_at <= now()
    returning id
  loop
    insert into occurrence_updates (occurrence_id, kind, body, from_value, to_value, author_kind)
    values (v_id, 'status', 'Encerrada automaticamente 3 dias úteis após a resolução.', 'resolvida', 'encerrada', 'system');
    perform set_config('t1.actor', 'system', true);
    perform _occ_order_event(v_id, 'encerrada');
  end loop;
  perform set_config('t1.actor', coalesce(v_prev, ''), true);
end;
$$;

-- Pacotes com prazo de guarda vencido ganham a ocorrência automática.
create or replace function public._occ_sync_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid := _occ_system_type('guarda_vencida');
  r record;
begin
  if v_type is null then
    return;
  end if;
  for r in
    select o.id, o.destination_store_id, p.guard_until
    from order_pickups p join orders o on o.id = p.order_id
    where o.status = 'active' and o.delivery_stage = 'disponivel-para-retirada'
      and p.used_at is null and p.guard_until < now()
      and not exists (select 1 from occurrences c
                      where c.dedupe_key = 'guarda:' || o.id and c.status <> 'encerrada')
  loop
    perform _occ_create(v_type, 'system', r.id, r.destination_store_id, null, null,
      'Prazo de guarda vencido em ' || to_char(r.guard_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
        || '. O cliente ainda não retirou o pacote.',
      null, null, 'guarda:' || r.id);
  end loop;
end;
$$;

create or replace function public._occ_maintain()
returns void
language sql
security definer
set search_path = public
as $$
  select _occ_autoclose();
  select _occ_sync_guard();
$$;

-- Conferência com diferença: ocorrência automática.
create or replace function public._occ_on_items_checked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid := _occ_system_type('conferencia');
  v_div int := coalesce((new.details ->> 'divergent')::int, 0);
begin
  if new.kind = 'items_checked' and v_div > 0 and v_type is not null then
    perform _occ_create(v_type, 'system', new.order_id,
      (select destination_store_id from orders where id = new.order_id), null, null,
      v_div || ' item(ns) com quantidade diferente do esperado na conferência.',
      null, null, 'conf:' || new.order_id);
  end if;
  return new;
end;
$$;

create trigger order_events_items_checked_occurrence
  after insert on order_events
  for each row when (new.kind = 'items_checked')
  execute function _occ_on_items_checked();

-- Parada não realizada por loja fechada: ocorrência automática ligada à loja.
create or replace function public._occ_on_stop_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid := _occ_system_type('loja_fechada');
begin
  if new.status = 'nao_realizada' and new.reason = 'loja_fechada'
     and old.status is distinct from new.status and v_type is not null then
    perform _occ_create(v_type, 'system', null, new.store_id,
      (select trip_id from routes where id = new.route_id), new.id,
      'Loja fechada na parada de ' || (select name from stores where id = new.store_id)
        || coalesce('. ' || new.note, '') || '.',
      new.lat, new.lng, 'stop:' || new.id);
  end if;
  return new;
end;
$$;

create trigger route_stops_closed_occurrence
  after update of status on route_stops
  for each row execute function _occ_on_stop_closed();

-- Ocorrência em JSON. O admin vê notas internas e nomes; os outros não.
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
-- 6. Ocorrências: admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_occurrences(p_order uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_order is not null then
    if not has_any_perm(array['ocorrencias', 'pedidos'], 'ver') then
      perform _require_perm('ocorrencias', 'ver');
    end if;
  else
    perform _require_perm('ocorrencias', 'ver');
  end if;
  perform _occ_maintain();
  return coalesce((
    select jsonb_agg(_occ_json(c.id, 'admin', false) order by c.created_at desc)
    from occurrences c where p_order is null or c.order_id = p_order
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_occurrence(p_occ uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('ocorrencias', 'ver');
  perform _occ_maintain();
  if not exists (select 1 from occurrences where id = p_occ) then
    raise exception 'Ocorrência não encontrada.' using errcode = 'P0001';
  end if;
  return _occ_json(p_occ, 'admin', true);
end;
$$;

-- Resumo para as abas, o Dashboard e o menu.
create or replace function public.admin_occurrence_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_any_perm(array['ocorrencias', 'pontos', 'dashboard'], 'ver') then
    perform _require_perm('ocorrencias', 'ver');
  end if;
  perform _occ_maintain();
  return jsonb_build_object(
    'aberta', (select count(*) from occurrences where status = 'aberta'),
    'emAnalise', (select count(*) from occurrences where status = 'em_analise'),
    'resolvida', (select count(*) from occurrences where status = 'resolvida'),
    'encerrada', (select count(*) from occurrences where status = 'encerrada'),
    'overdue', (select count(*) from occurrences where status in ('aberta', 'em_analise') and due_at < now()),
    'guardExpired', (
      select count(*) from order_pickups p join orders o on o.id = p.order_id
      where o.status = 'active' and o.delivery_stage = 'disponivel-para-retirada'
        and p.used_at is null and p.guard_until < now())
  );
end;
$$;

-- Quem pode ser responsável: usuários do admin ativos.
create or replace function public.admin_occurrence_assignees()
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('ocorrencias', 'ver');
  return query
    select p.id, p.name from admins a join profiles p on p.id = a.user_id
    where a.status = 'ativo' order by p.name;
end;
$$;

-- p: { typeId, orderId?, storeCode?, description }
create or replace function public.admin_open_occurrence(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid := nullif(p ->> 'typeId', '')::uuid;
  v_order uuid := nullif(p ->> 'orderId', '')::uuid;
  v_store uuid;
  v_id uuid;
begin
  perform _require_perm('ocorrencias', 'criar');
  if not exists (select 1 from occurrence_types where id = v_type and active) then
    raise exception 'Escolha um tipo de ocorrência ativo.' using errcode = 'P0001';
  end if;
  if v_order is not null and not exists (select 1 from orders where id = v_order) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if nullif(p ->> 'storeCode', '') is not null then
    select id into v_store from stores where code = p ->> 'storeCode';
    if v_store is null then
      raise exception 'Loja não encontrada.' using errcode = 'P0001';
    end if;
  elsif v_order is not null then
    select destination_store_id into v_store from orders where id = v_order;
  end if;
  if char_length(btrim(coalesce(p ->> 'description', ''))) < 3 then
    raise exception 'Descreva a ocorrência.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  v_id := _occ_create(v_type, 'admin', v_order, v_store, null, null, p ->> 'description');
  return jsonb_build_object('id', v_id, 'number', (select number from occurrences where id = v_id));
exception
  when invalid_text_representation then
    raise exception 'Dados da ocorrência inválidos.' using errcode = 'P0001';
end;
$$;

-- p: { status?, assigneeId? (presente = muda; vazio = tira), comment?, internal? }
create or replace function public.admin_update_occurrence(p_occ uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
  v_status text := nullif(p ->> 'status', '');
  v_assignee uuid;
  v_comment text := nullif(btrim(coalesce(p ->> 'comment', '')), '');
begin
  perform _require_perm('ocorrencias', 'editar');
  perform _occ_maintain();
  select * into c from occurrences where id = p_occ for update;
  if not found then
    raise exception 'Ocorrência não encontrada.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);

  if p ? 'assigneeId' then
    v_assignee := nullif(p ->> 'assigneeId', '')::uuid;
    if v_assignee is not null and not exists (select 1 from admins where user_id = v_assignee and status = 'ativo') then
      raise exception 'Responsável inválido.' using errcode = 'P0001';
    end if;
    if v_assignee is distinct from c.assignee_id then
      update occurrences set assignee_id = v_assignee where id = p_occ;
      perform _occ_log(p_occ, 'assign', null, (select name from profiles where id = c.assignee_id),
        (select name from profiles where id = v_assignee), true, 'admin');
    end if;
  end if;

  if v_status is not null and v_status <> c.status then
    if v_status not in ('aberta', 'em_analise', 'resolvida', 'encerrada') then
      raise exception 'Status inválido.' using errcode = 'P0001';
    end if;
    if c.status = 'encerrada' then
      raise exception 'Ocorrência encerrada: use "Reabrir".' using errcode = 'P0001';
    end if;
    update occurrences set
      status = v_status,
      resolved_at = case when v_status in ('resolvida', 'encerrada') then coalesce(c.resolved_at, now()) end,
      auto_close_at = case when v_status = 'resolvida' then _add_business_days(now(), 3) end,
      closed_at = case when v_status = 'encerrada' then now() end
    where id = p_occ;
    perform _occ_log(p_occ, 'status', null, c.status, v_status, false, 'admin');
    if v_status in ('resolvida', 'encerrada') then
      perform _occ_order_event(p_occ, v_status);
    end if;
  end if;

  if v_comment is not null then
    perform _occ_log(p_occ, 'comment', v_comment, null, null, coalesce((p ->> 'internal')::boolean, false), 'admin');
  end if;
exception
  when invalid_text_representation then
    raise exception 'Dados inválidos.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_reopen_occurrence(p_occ uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
begin
  perform _require_perm('ocorrencias', 'editar');
  select * into c from occurrences where id = p_occ for update;
  if not found or c.status not in ('resolvida', 'encerrada') then
    raise exception 'Só ocorrências resolvidas ou encerradas podem ser reabertas.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo para reabrir.' using errcode = 'P0001';
  end if;
  if c.dedupe_key is not null and exists (
    select 1 from occurrences where dedupe_key = c.dedupe_key and status <> 'encerrada' and id <> p_occ) then
    raise exception 'Já existe outra ocorrência aberta para o mesmo caso.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  update occurrences set status = 'aberta', resolved_at = null, auto_close_at = null, closed_at = null
    where id = p_occ;
  perform _occ_log(p_occ, 'reopened', p_reason, c.status, 'aberta', false, 'admin');
  perform _occ_order_event(p_occ, 'reaberta', p_reason);
end;
$$;

-- p: { kind, amountBrl?, couponType? ('percent' | 'flat'), newGuardDate? (AAAA-MM-DD), note? }
create or replace function public.admin_add_resolution(p_occ uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
  v_kind text := p ->> 'kind';
  v_amount numeric := nullif(p ->> 'amountBrl', '')::numeric;
  v_coupon text;
  v_guard timestamptz;
  v_label text;
begin
  perform _require_perm('ocorrencias', 'editar');
  select * into c from occurrences where id = p_occ for update;
  if not found then
    raise exception 'Ocorrência não encontrada.' using errcode = 'P0001';
  end if;
  if c.status = 'encerrada' then
    raise exception 'Ocorrência encerrada: reabra para adicionar resoluções.' using errcode = 'P0001';
  end if;
  if v_kind is null or v_kind not in ('reembolso', 'sinistro', 'reenvio', 'devolucao_loja', 'credito',
                                      'cupom', 'prorrogacao_guarda', 'sem_acao') then
    raise exception 'Tipo de resolução inválido.' using errcode = 'P0001';
  end if;
  if v_kind in ('reembolso', 'sinistro', 'credito', 'cupom') and (v_amount is null or v_amount <= 0) then
    raise exception 'Informe o valor.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);

  if v_kind = 'cupom' then
    if coalesce(p ->> 'couponType', 'flat') not in ('percent', 'flat') then
      raise exception 'Tipo de cupom inválido.' using errcode = 'P0001';
    end if;
    if p ->> 'couponType' = 'percent' and v_amount > 100 then
      raise exception 'Percentual acima de 100%%.' using errcode = 'P0001';
    end if;
    v_coupon := 'OC' || c.number || upper(left(replace(gen_random_uuid()::text, '-', ''), 4));
    insert into coupons (code, type, value, label, active)
    values (v_coupon, coalesce(p ->> 'couponType', 'flat')::coupon_type, v_amount,
            'Ocorrência OC-' || c.number, true);
  elsif v_kind = 'prorrogacao_guarda' then
    if c.order_id is null or not exists (select 1 from order_pickups where order_id = c.order_id) then
      raise exception 'Esta ocorrência não tem pacote com prazo de guarda.' using errcode = 'P0001';
    end if;
    v_guard := ((nullif(p ->> 'newGuardDate', '')::date + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second';
    if v_guard is null or v_guard <= now() then
      raise exception 'Escolha uma nova data de prazo no futuro.' using errcode = 'P0001';
    end if;
    update order_pickups set guard_until = v_guard where order_id = c.order_id;
    perform _log_order_event(c.order_id, (select user_id from orders where id = c.order_id), 'pickup_deadline',
      null, to_char(v_guard at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
      jsonb_build_object('occurrenceId', p_occ), 'Prorrogado pela ocorrência OC-' || c.number);
  end if;

  insert into occurrence_resolutions (occurrence_id, kind, amount_brl, coupon_code, new_guard_until, note, created_by)
  values (p_occ, v_kind, case when v_kind in ('reembolso', 'sinistro', 'credito', 'cupom') then v_amount end,
          v_coupon, v_guard, nullif(btrim(coalesce(p ->> 'note', '')), ''), auth.uid());
  v_label := case v_kind
    when 'reembolso' then 'Reembolso' when 'sinistro' then 'Sinistro' when 'reenvio' then 'Reenvio'
    when 'devolucao_loja' then 'Devolução à loja' when 'credito' then 'Crédito' when 'cupom' then 'Cupom'
    when 'prorrogacao_guarda' then 'Prazo de retirada prorrogado' else 'Sem ação' end;
  perform _occ_log(p_occ, 'resolution', v_label || coalesce(' · ' || v_coupon, ''), null, v_kind, false, 'admin');
  return jsonb_build_object('couponCode', v_coupon);
exception
  when invalid_text_representation or invalid_datetime_format then
    raise exception 'Dados da resolução inválidos.' using errcode = 'P0001';
end;
$$;

-- p: { name, description?, active, driverCan, customerCan, deadlineHours, requiresPhoto, sort }
create or replace function public.admin_upsert_occurrence_type(p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  perform _require_perm('ocorrencias', case when p_id is null then 'criar' else 'editar' end);
  if char_length(btrim(coalesce(p ->> 'name', ''))) < 2 then
    raise exception 'Informe o nome do tipo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from occurrence_types where lower(name) = lower(btrim(p ->> 'name'))
             and id is distinct from p_id) then
    raise exception 'Já existe um tipo com esse nome.' using errcode = 'P0001';
  end if;
  if coalesce((p ->> 'deadlineHours')::int, 168) not between 1 and 8760 then
    raise exception 'Prazo entre 1 hora e 365 dias.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into occurrence_types (name, description, active, driver_can, customer_can, deadline_hours, requires_photo, sort)
    values (btrim(p ->> 'name'), nullif(btrim(coalesce(p ->> 'description', '')), ''),
            coalesce((p ->> 'active')::boolean, true), coalesce((p ->> 'driverCan')::boolean, false),
            coalesce((p ->> 'customerCan')::boolean, false), coalesce((p ->> 'deadlineHours')::int, 168),
            coalesce((p ->> 'requiresPhoto')::boolean, false), coalesce((p ->> 'sort')::int, 100))
    returning id into v_id;
  else
    update occurrence_types set
      name = btrim(p ->> 'name'),
      description = nullif(btrim(coalesce(p ->> 'description', '')), ''),
      active = coalesce((p ->> 'active')::boolean, active),
      driver_can = coalesce((p ->> 'driverCan')::boolean, driver_can),
      customer_can = coalesce((p ->> 'customerCan')::boolean, customer_can),
      deadline_hours = coalesce((p ->> 'deadlineHours')::int, deadline_hours),
      requires_photo = coalesce((p ->> 'requiresPhoto')::boolean, requires_photo),
      sort = coalesce((p ->> 'sort')::int, sort)
    where id = p_id;
    if not found then
      raise exception 'Tipo não encontrado.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation then
    raise exception 'Dados do tipo inválidos.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Ocorrências: cliente e entregador
-- ---------------------------------------------------------------------------
create or replace function public.my_order_occurrences(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from orders where id = p_order and user_id = auth.uid()) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  perform _occ_autoclose();
  return coalesce((
    select jsonb_agg(_occ_json(c.id, 'customer', true) order by c.created_at desc)
    from occurrences c where c.order_id = p_order
  ), '[]'::jsonb);
end;
$$;

create or replace function public.customer_open_occurrence(p_order uuid, p_type uuid, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o orders%rowtype;
  v_id uuid;
begin
  select * into o from orders where id = p_order and user_id = auth.uid();
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if o.status not in ('active', 'completed') then
    raise exception 'Este pedido não aceita ocorrências.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from occurrence_types where id = p_type and active and customer_can) then
    raise exception 'Escolha um dos tipos da lista.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Conte o que aconteceu (pelo menos 10 letras).' using errcode = 'P0001';
  end if;
  if (select count(*) from occurrences where order_id = p_order and opened_kind = 'customer'
      and status in ('aberta', 'em_analise')) >= 5 then
    raise exception 'Este pedido já tem ocorrências abertas. Acompanhe por elas.' using errcode = 'P0001';
  end if;
  v_id := _occ_create(p_type, 'customer', p_order, o.destination_store_id, null, null, left(p_description, 2000));
  return jsonb_build_object('id', v_id, 'number', (select number from occurrences where id = v_id));
end;
$$;

create or replace function public.driver_my_occurrences()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if _my_driver_id() is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  perform _occ_autoclose();
  return coalesce((
    select jsonb_agg(_occ_json(c.id, 'driver', true) order by c.created_at desc)
    from occurrences c
    where c.created_at > now() - interval '60 days' and (c.opened_by = auth.uid() or exists (
      select 1 from route_stops s join routes r on r.id = s.route_id join trips t on t.id = r.trip_id
      where s.id = c.stop_id and t.driver_id = _my_driver_id()))
  ), '[]'::jsonb);
end;
$$;

-- p: { typeId, stopId, orderId?, description, lat?, lng? }
create or replace function public.driver_open_occurrence(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid := nullif(p ->> 'typeId', '')::uuid;
  v_stop uuid := nullif(p ->> 'stopId', '')::uuid;
  v_order uuid := nullif(p ->> 'orderId', '')::uuid;
  s record;
  v_id uuid;
begin
  if _my_driver_id() is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from occurrence_types where id = v_type and active and driver_can) then
    raise exception 'Escolha um dos tipos da lista.' using errcode = 'P0001';
  end if;
  select st.id, st.store_id, ro.trip_id into s
    from route_stops st join routes ro on ro.id = st.route_id join trips t on t.id = ro.trip_id
    where st.id = v_stop and t.driver_id = _my_driver_id() and t.status <> 'cancelada';
  if s.id is null then
    raise exception 'Parada não encontrada nas suas viagens.' using errcode = 'P0001';
  end if;
  if v_order is not null and not exists (select 1 from route_stop_orders where stop_id = v_stop and order_id = v_order) then
    raise exception 'Este pedido não está nesta parada.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p ->> 'description', ''))) < 3 then
    raise exception 'Descreva o que aconteceu.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'driver', true);
  v_id := _occ_create(v_type, 'driver', v_order, s.store_id, s.trip_id, v_stop, left(p ->> 'description', 2000),
    nullif(p ->> 'lat', '')::double precision, nullif(p ->> 'lng', '')::double precision);
  return jsonb_build_object('id', v_id, 'number', (select number from occurrences where id = v_id));
exception
  when invalid_text_representation then
    raise exception 'Dados da ocorrência inválidos.' using errcode = 'P0001';
end;
$$;

-- Comentário público de quem está envolvido (cliente, entregador ou admin).
create or replace function public.occurrence_comment(p_occ uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := _occ_role(p_occ);
begin
  if v_role is null then
    raise exception 'Ocorrência não encontrada.' using errcode = 'P0001';
  end if;
  if v_role = 'admin' and not has_perm('ocorrencias', 'editar') then
    raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
  end if;
  if (select status from occurrences where id = p_occ) = 'encerrada' then
    raise exception 'Esta ocorrência está encerrada.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then
    raise exception 'Escreva a mensagem.' using errcode = 'P0001';
  end if;
  perform _occ_log(p_occ, 'comment', left(p_body, 2000), null, null, false, v_role);
end;
$$;

-- O arquivo já foi enviado para "occurrences/<id>/..."; aqui só registramos.
create or replace function public.occurrence_add_attachment(p_occ uuid, p_path text, p_name text, p_mime text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := _occ_role(p_occ);
  v_id uuid;
begin
  if v_role is null then
    raise exception 'Ocorrência não encontrada.' using errcode = 'P0001';
  end if;
  if v_role = 'admin' and not has_perm('ocorrencias', 'editar') then
    raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path not like 'occurrences/' || p_occ || '/%' or p_path like '%..%' then
    raise exception 'Arquivo inválido.' using errcode = 'P0001';
  end if;
  if (select count(*) from occurrence_attachments where occurrence_id = p_occ) >= 20 then
    raise exception 'Limite de 20 anexos por ocorrência.' using errcode = 'P0001';
  end if;
  insert into occurrence_attachments (occurrence_id, path, name, mime, created_by, author_kind)
  values (p_occ, p_path, left(p_name, 160), p_mime, auth.uid(), v_role)
  returning id into v_id;
  perform _occ_log(p_occ, 'attachment', left(p_name, 160), null, null, false, v_role);
  return v_id;
exception
  when check_violation then
    raise exception 'Tipo de arquivo não aceito (use foto ou PDF).' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Pontos de retirada (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_pickup_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pontos', 'ver');
  perform _occ_maintain();
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'code', s.code, 'name', s.name, 'address', s.address, 'neighborhood', s.neighborhood, 'city', s.city,
      'hours', s.pickup_hours, 'capacity', s.pickup_capacity, 'guardDays', s.guard_days,
      'stored', k.stored, 'expired', k.expired, 'dueToday', k.due_today,
      'pickups30d', w.pickups, 'avgHoursToPickup30d', w.avg_hours
    )) order by s.pickup_sort_order nulls last, s.name)
    from stores s
    cross join lateral (
      select count(*) as stored,
             count(*) filter (where p.guard_until < now()) as expired,
             count(*) filter (where p.guard_until >= now()
               and (p.guard_until at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date) as due_today
      from orders o join order_pickups p on p.order_id = o.id
      where o.destination_store_id = s.id and o.status = 'active'
        and o.delivery_stage = 'disponivel-para-retirada' and p.used_at is null
    ) k
    cross join lateral (
      select count(*) as pickups,
             round((avg(extract(epoch from p.used_at - p.available_at)) / 3600)::numeric, 1) as avg_hours
      from orders o join order_pickups p on p.order_id = o.id
      where o.destination_store_id = s.id and p.used_at > now() - interval '30 days'
    ) w
    where s.is_pickup_point
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_point_packages(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pontos', 'ver');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'orderId', o.id,
      'customerName', coalesce(nullif(btrim(pr.name), ''), pr.email),
      'availableAt', p.available_at,
      'guardUntil', p.guard_until,
      'openOccurrenceId', (select c.id from occurrences c where c.order_id = o.id
                             and c.status in ('aberta', 'em_analise') order by c.created_at desc limit 1)
    )) order by p.guard_until nulls last)
    from orders o
    join stores s on s.id = o.destination_store_id
    join order_pickups p on p.order_id = o.id
    left join profiles pr on pr.id = o.user_id
    where s.code = p_code and o.status = 'active'
      and o.delivery_stage = 'disponivel-para-retirada' and p.used_at is null
  ), '[]'::jsonb);
end;
$$;

-- Retiradas no período (dias de Brasília, inclusive).
create or replace function public.admin_point_pickups(p_code text, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pontos', 'ver');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'orderId', o.id,
      'customerName', coalesce(nullif(btrim(pr.name), ''), pr.email),
      'availableAt', p.available_at,
      'pickedUpAt', p.used_at
    )) order by p.used_at desc)
    from orders o
    join stores s on s.id = o.destination_store_id
    join order_pickups p on p.order_id = o.id
    left join profiles pr on pr.id = o.user_id
    where s.code = p_code and p.used_at is not null
      and (p.used_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ), '[]'::jsonb);
end;
$$;

-- p: { hours: { "0".."6": "10:00–19:00" | "" }, capacity: int | null, guardDays: int }
create or replace function public.admin_update_pickup_point(p_code text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours jsonb := coalesce(p -> 'hours', '{}'::jsonb);
  k text;
begin
  perform _require_perm('pontos', 'editar');
  if not exists (select 1 from stores where code = p_code and is_pickup_point) then
    raise exception 'Ponto de retirada não encontrado.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_hours) <> 'object' then
    raise exception 'Horários inválidos.' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(v_hours) loop
    if k not in ('0', '1', '2', '3', '4', '5', '6') or jsonb_typeof(v_hours -> k) <> 'string'
       or char_length(v_hours ->> k) > 40 then
      raise exception 'Horários inválidos.' using errcode = 'P0001';
    end if;
  end loop;
  select coalesce(jsonb_object_agg(key, btrim(value)), '{}'::jsonb) into v_hours
    from jsonb_each_text(v_hours) where btrim(value) <> '';
  if nullif(p ->> 'capacity', '') is not null and (p ->> 'capacity')::int not between 1 and 10000 then
    raise exception 'Capacidade entre 1 e 10.000 pacotes.' using errcode = 'P0001';
  end if;
  if coalesce((p ->> 'guardDays')::int, 7) not between 1 and 90 then
    raise exception 'Prazo de guarda entre 1 e 90 dias.' using errcode = 'P0001';
  end if;
  update stores set
    pickup_hours = v_hours,
    pickup_capacity = nullif(p ->> 'capacity', '')::int,
    guard_days = coalesce((p ->> 'guardDays')::int, guard_days)
  where code = p_code;
exception
  when invalid_text_representation then
    raise exception 'Dados do ponto inválidos.' using errcode = 'P0001';
end;
$$;

-- Prorroga o prazo de guarda de um pacote (até o fim do dia escolhido).
create or replace function public.admin_extend_guard(p_order uuid, p_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard timestamptz := ((p_date + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second';
begin
  perform _require_perm('pontos', 'editar');
  if not exists (
    select 1 from orders o join order_pickups p on p.order_id = o.id
    where o.id = p_order and o.status = 'active' and o.delivery_stage = 'disponivel-para-retirada' and p.used_at is null) then
    raise exception 'Este pacote não está aguardando retirada.' using errcode = 'P0001';
  end if;
  if p_date is null or v_guard <= now() then
    raise exception 'Escolha uma data no futuro.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo da prorrogação.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  update order_pickups set guard_until = v_guard where order_id = p_order;
  perform _log_order_event(p_order, (select user_id from orders where id = p_order), 'pickup_deadline',
    null, p_date::text, '{}'::jsonb, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Anexos no bucket order-photos ("occurrences/<id>/...")
-- ---------------------------------------------------------------------------
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  where id = 'order-photos';

create policy "involved upload occurrence files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'order-photos' and (storage.foldername(name))[1] = 'occurrences'
    and public._can_see_occurrence_path((storage.foldername(name))[2])
  );
create policy "involved read occurrence files" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-photos' and (storage.foldername(name))[1] = 'occurrences'
    and public._can_see_occurrence_path((storage.foldername(name))[2])
  );

-- ---------------------------------------------------------------------------
-- 10. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _easter(int),
  _is_holiday(date),
  _add_business_days(timestamptz, int),
  _orders_mark_available(),
  _occ_role(uuid),
  _occ_log(uuid, text, text, text, text, boolean, text),
  _occ_order_event(uuid, text, text),
  _occ_create(uuid, text, uuid, uuid, uuid, uuid, text, double precision, double precision, text),
  _occ_system_type(text),
  _occ_autoclose(),
  _occ_sync_guard(),
  _occ_maintain(),
  _occ_on_items_checked(),
  _occ_on_stop_closed(),
  _occ_json(uuid, text, boolean),
  admin_occurrences(uuid),
  admin_occurrence(uuid),
  admin_occurrence_summary(),
  admin_occurrence_assignees(),
  admin_open_occurrence(jsonb),
  admin_update_occurrence(uuid, jsonb),
  admin_reopen_occurrence(uuid, text),
  admin_add_resolution(uuid, jsonb),
  admin_upsert_occurrence_type(uuid, jsonb),
  my_order_occurrences(uuid),
  customer_open_occurrence(uuid, uuid, text),
  driver_my_occurrences(),
  driver_open_occurrence(jsonb),
  occurrence_comment(uuid, text),
  occurrence_add_attachment(uuid, text, text, text),
  admin_pickup_points(),
  admin_point_packages(text),
  admin_point_pickups(text, date, date),
  admin_update_pickup_point(text, jsonb),
  admin_extend_guard(uuid, date, text)
from public, anon, authenticated;

-- Usada na policy do Storage.
revoke all on function _can_see_occurrence_path(text) from public, anon;
grant execute on function _can_see_occurrence_path(text) to authenticated;

grant execute on function
  admin_occurrences(uuid),
  admin_occurrence(uuid),
  admin_occurrence_summary(),
  admin_occurrence_assignees(),
  admin_open_occurrence(jsonb),
  admin_update_occurrence(uuid, jsonb),
  admin_reopen_occurrence(uuid, text),
  admin_add_resolution(uuid, jsonb),
  admin_upsert_occurrence_type(uuid, jsonb),
  my_order_occurrences(uuid),
  customer_open_occurrence(uuid, uuid, text),
  driver_my_occurrences(),
  driver_open_occurrence(jsonb),
  occurrence_comment(uuid, text),
  occurrence_add_attachment(uuid, text, text, text),
  admin_pickup_points(),
  admin_point_packages(text),
  admin_point_pickups(text, date, date),
  admin_update_pickup_point(text, jsonb),
  admin_extend_guard(uuid, date, text)
to authenticated;

-- Teste da 0018_points_occurrences.sql. Roda DEPOIS da migração, na MESMA
-- transação, e termina com um erro proposital que desfaz tudo (nada fica
-- gravado). Montado junto com a migração em 0018_teste_para_sql_editor.sql.

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
  v_nc uuid := gen_random_uuid();  -- backoffice só com dashboard
  v_c uuid := gen_random_uuid();   -- cliente dono do pedido
  v_c2 uuid := gen_random_uuid();  -- outro cliente
  v_d uuid := gen_random_uuid();   -- entregador
  v_role uuid;
  v_driver uuid;
  v_dest text; v_s1 text;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  x uuid;
  v_t_missing uuid; v_t_theft uuid;
  v_occ uuid; v_occ2 uuid; v_type uuid;
  v_trip uuid; v_route uuid; v_stop uuid;
  v_coupon text;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas e pedido de teste (somem no fim) ------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_nc, v_c, v_c2, v_d]) u;
  insert into staff_roles (name) values ('Só dashboard') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'dashboard', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_nc, v_role);
  insert into team_members (name, kind, user_id) values ('Entregador Teste', 'entregador', v_d) returning id into v_driver;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select id into v_t_missing from occurrence_types where name = 'Carta faltando';
  select id into v_t_theft from occurrence_types where name = 'Furto';

  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'X', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  perform pay_order(x, 'pix');

  -- 2. Dias úteis e tipos -------------------------------------------------------------
  perform _t_as(null);
  perform _t_check('feriados: carnaval, Corpus Christi e Consciência Negra',
    _is_holiday('2026-02-17') and _is_holiday('2026-06-04') and _is_holiday('2026-11-20') and not _is_holiday('2026-11-18'));
  perform _t_check('3 dias úteis a partir de sexta pulam o fim de semana',
    _add_business_days('2026-11-13 15:00-03', 3) = '2026-11-18 15:00-03'::timestamptz,
    _add_business_days('2026-11-13 15:00-03', 3)::text);
  perform _t_check('3 dias úteis pulam feriado',
    _add_business_days('2026-11-19 10:00-03', 3) = '2026-11-25 10:00-03'::timestamptz,
    _add_business_days('2026-11-19 10:00-03', 3)::text);
  perform _t_check('8 tipos iniciais, 3 do sistema',
    (select count(*) = 8 and count(system_kind) = 3 from occurrence_types));
  perform _t_as(v_c);
  select count(*) into v_n from occurrence_types where customer_can;
  perform _t_check('cliente lê os tipos liberados para ele', v_n = 3);
  select count(*) into v_n from occurrences;
  perform _t_check('cliente não lê a tabela de ocorrências direto', v_n = 0);
  perform _t_as(null, true);
  perform _t_err('anon não lê ocorrências', 'select count(*) from occurrences', 'permission denied');

  -- 3. Pontos de retirada ---------------------------------------------------------------
  perform _t_as(null);
  update orders set delivery_stage = 'em-transporte' where id = x;
  update orders set delivery_stage = 'disponivel-para-retirada' where id = x;
  perform _t_check('pacote no ponto ganha data e prazo de guarda',
    (select available_at is not null and abs(extract(epoch from guard_until - available_at) - 7 * 86400) < 5
     from order_pickups where order_id = x));
  perform _t_as(v_a);
  perform _t_err('horário com dia inválido',
    format('select admin_update_pickup_point(%L, %L::jsonb)', v_dest, '{"hours": {"9": "10h"}}'), 'Horários');
  perform _t_err('capacidade zero',
    format('select admin_update_pickup_point(%L, %L::jsonb)', v_dest, '{"capacity": 0, "guardDays": 7}'), 'Capacidade');
  perform admin_update_pickup_point(v_dest, '{"hours": {"1": "10:00-19:00", "2": " "}, "capacity": 50, "guardDays": 10}');
  perform _t_as(null);
  perform _t_check('ponto configurado (dia vazio some)',
    (select pickup_capacity = 50 and guard_days = 10 and pickup_hours = '{"1": "10:00-19:00"}'::jsonb
     from stores where code = v_dest));
  perform _t_as(v_a);
  r := admin_pickup_points();
  perform _t_check('lista de pontos mostra o pacote guardado',
    exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = v_dest and (e ->> 'stored')::int >= 1), r::text);
  r := admin_point_packages(v_dest);
  perform _t_check('pacotes do ponto', exists (select 1 from jsonb_array_elements(r) e where (e ->> 'orderId')::uuid = x));
  perform _t_as(v_nc);
  perform _t_err('perfil sem pontos não vê', 'select admin_pickup_points()', 'não permite');

  -- 4. Prazo de guarda vencido: ocorrência automática ------------------------------------------
  perform _t_as(null);
  update order_pickups set guard_until = now() - interval '1 day' where order_id = x;
  perform _t_as(v_a);
  r := admin_occurrence_summary();
  perform _t_check('resumo conta prazo vencido', (r ->> 'guardExpired')::int >= 1, r::text);
  perform admin_occurrence_summary();
  perform _t_as(null);
  select count(*) into v_n from occurrences c join occurrence_types t on t.id = c.type_id
    where c.order_id = x and t.system_kind = 'guarda_vencida';
  perform _t_check('uma ocorrência de prazo vencido (sem repetir)', v_n = 1);
  perform _t_check('linha do tempo do pedido: ocorrência aberta pelo sistema',
    exists (select 1 from order_events where order_id = x and kind = 'occurrence' and to_value = 'aberta' and actor_kind = 'system'));
  perform _t_as(v_a);
  perform _t_err('prorrogar para o passado', format('select admin_extend_guard(%L, %L, %L)', x, v_day - 1, 'teste'), 'futuro');
  perform admin_extend_guard(x, v_day + 5, 'Cliente viajando');
  perform _t_as(null);
  perform _t_check('prazo prorrogado e registrado',
    (select guard_until > now() + interval '4 days' from order_pickups where order_id = x)
    and exists (select 1 from order_events where order_id = x and kind = 'pickup_deadline'));

  -- 5. Cliente abre e acompanha --------------------------------------------------------------
  perform _t_as(v_c);
  perform _t_err('cliente não abre tipo de entregador',
    format('select customer_open_occurrence(%L, %L, %L)', x, v_t_theft, 'Sumiu o pacote do ponto'), 'tipos da lista');
  perform _t_err('descrição curta', format('select customer_open_occurrence(%L, %L, %L)', x, v_t_missing, 'faltou'), '10 letras');
  r := customer_open_occurrence(x, v_t_missing, 'Faltou a carta Y no pacote');
  v_occ := (r ->> 'id')::uuid;
  perform _t_check('cliente abriu a ocorrência', v_occ is not null and (r ->> 'number')::int >= 1001, r::text);
  perform _t_as(v_c2);
  perform _t_err('outro cliente não abre no pedido', format('select customer_open_occurrence(%L, %L, %L)', x, v_t_missing,
    'Faltou a carta Y no pacote'), 'não encontrado');
  perform _t_err('outro cliente não vê', format('select my_order_occurrences(%L)', x), 'não encontrado');
  perform _t_err('outro cliente não comenta', format('select occurrence_comment(%L, %L)', v_occ, 'oi'), 'não encontrada');

  -- 6. Admin trata ------------------------------------------------------------------------------
  perform _t_as(v_a);
  perform admin_update_occurrence(v_occ, jsonb_build_object('status', 'em_analise', 'assigneeId', v_a,
    'comment', 'Conferindo as fotos', 'internal', true));
  perform admin_update_occurrence(v_occ, jsonb_build_object('comment', 'Estamos verificando com a loja.'));
  perform _t_err('cupom sem valor', format('select admin_add_resolution(%L, %L::jsonb)', v_occ, '{"kind": "cupom"}'), 'valor');
  r := admin_add_resolution(v_occ, '{"kind": "cupom", "amountBrl": 15, "couponType": "flat", "note": "nota interna"}');
  v_coupon := r ->> 'couponCode';
  perform _t_as(null);
  perform _t_check('cupom criado de verdade',
    exists (select 1 from coupons where code = v_coupon and value = 15 and active), v_coupon);
  perform _t_as(v_c);
  perform occurrence_comment(v_occ, 'Obrigado!');
  r := my_order_occurrences(x) -> 0;
  perform _t_check('cliente vê status, comentário público e cupom',
    r ->> 'status' = 'em_analise' and r -> 'resolutions' -> 0 ->> 'couponCode' = v_coupon
    and exists (select 1 from jsonb_array_elements(r -> 'updates') u where u ->> 'body' = 'Estamos verificando com a loja.'), r::text);
  perform _t_check('cliente não vê nota interna, responsável nem nota da resolução',
    not exists (select 1 from jsonb_array_elements(r -> 'updates') u where u ->> 'body' = 'Conferindo as fotos'
                or (u ->> 'internal')::boolean)
    and r -> 'assigneeName' is null and r -> 'resolutions' -> 0 -> 'note' is null, r::text);

  -- 7. Resolve, encerra sozinha e reabre ---------------------------------------------------------
  perform _t_as(v_a);
  perform admin_update_occurrence(v_occ, '{"status": "resolvida"}');
  perform _t_as(null);
  perform _t_check('resolvida com encerramento em 3 dias úteis',
    (select status = 'resolvida' and auto_close_at = _add_business_days(resolved_at, 3) from occurrences where id = v_occ));
  update occurrences set auto_close_at = now() - interval '1 minute' where id = v_occ;
  perform _t_as(v_c);
  r := my_order_occurrences(x) -> 0;
  perform _t_check('passado o prazo, aparece encerrada', r ->> 'status' = 'encerrada', r::text);
  perform _t_err('encerrada não recebe comentário', format('select occurrence_comment(%L, %L)', v_occ, 'oi'), 'encerrada');
  perform _t_as(v_a);
  perform _t_err('reabrir sem motivo', format('select admin_reopen_occurrence(%L, %L)', v_occ, ''), 'motivo');
  perform admin_reopen_occurrence(v_occ, 'Cliente achou outra falta');
  perform _t_as(null);
  perform _t_check('reaberta', (select status = 'aberta' and resolved_at is null from occurrences where id = v_occ));

  -- 8. Conferência com diferença -----------------------------------------------------------------
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 2}');
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 1}');
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 0}');
  select count(*) into v_n from occurrences c join occurrence_types t on t.id = c.type_id
    where c.order_id = x and t.system_kind = 'conferencia';
  perform _t_check('conferência com diferença abre uma ocorrência só', v_n = 1);

  -- 9. Entregador ----------------------------------------------------------------------------------
  insert into trips (day, driver_id, status) values (v_day, v_driver, 'em_andamento') returning id into v_trip;
  insert into routes (kind, day, trip_id, status) values ('coleta', v_day, v_trip, 'em_andamento') returning id into v_route;
  insert into route_stops (route_id, store_id, position) values (v_route, (select id from stores where code = v_s1), 1)
    returning id into v_stop;
  insert into route_stop_orders (stop_id, order_id) values (v_stop, x);
  perform _t_as(v_d);
  perform _t_err('entregador sem parada', format('select driver_open_occurrence(%L::jsonb)',
    jsonb_build_object('typeId', v_t_theft, 'stopId', gen_random_uuid(), 'description', 'Furto')), 'Parada não encontrada');
  perform _t_err('entregador não abre tipo de cliente', format('select driver_open_occurrence(%L::jsonb)',
    jsonb_build_object('typeId', v_t_missing, 'stopId', v_stop, 'description', 'Faltou')), 'tipos da lista');
  r := driver_open_occurrence(jsonb_build_object('typeId', v_t_theft, 'stopId', v_stop, 'orderId', x,
    'description', 'Pacote levado no caminho', 'lat', -22.9, 'lng', -43.2));
  v_occ2 := (r ->> 'id')::uuid;
  perform _t_as(null);
  perform _t_check('ocorrência do entregador ligada à parada e à viagem',
    (select opened_kind = 'driver' and trip_id = v_trip and stop_id = v_stop and lat = -22.9 from occurrences where id = v_occ2));
  perform _t_check('linha do tempo: aberta pelo entregador',
    exists (select 1 from order_events where order_id = x and kind = 'occurrence' and actor_kind = 'driver'));
  update route_stops set reason = 'loja_fechada' where id = v_stop;
  update route_stops set status = 'nao_realizada' where id = v_stop;
  perform _t_check('parada com loja fechada abre ocorrência da loja',
    exists (select 1 from occurrences c join occurrence_types t on t.id = c.type_id
            where c.stop_id = v_stop and t.system_kind = 'loja_fechada' and c.order_id is null));
  perform _t_as(v_d);
  perform _t_check('entregador vê as ocorrências dele e da parada', jsonb_array_length(driver_my_occurrences()) = 2);
  perform occurrence_comment(v_occ2, 'Registrei boletim de ocorrência');
  perform _t_as(v_c);
  perform _t_err('cliente não é entregador', 'select driver_my_occurrences()', 'entregadores ativos');

  -- 10. Anexos ----------------------------------------------------------------------------------------
  perform _t_err('anexo fora da pasta', format('select occurrence_add_attachment(%L, %L, %L, %L)',
    v_occ, 'outra/coisa.jpg', 'a.jpg', 'image/jpeg'), 'Arquivo inválido');
  perform _t_err('anexo de tipo não aceito', format('select occurrence_add_attachment(%L, %L, %L, %L)',
    v_occ, 'occurrences/' || v_occ || '/a.exe', 'a.exe', 'application/x-msdownload'), 'Tipo de arquivo');
  perform occurrence_add_attachment(v_occ, 'occurrences/' || v_occ || '/foto.jpg', 'foto.jpg', 'image/jpeg');
  perform _t_check('cliente vê o anexo', (
    select jsonb_array_length(e -> 'attachments') = 1
    from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ));
  perform _t_check('policy do arquivo: cliente pode', _can_see_occurrence_path(v_occ::text));
  perform _t_as(v_c2);
  perform _t_check('policy do arquivo: outro cliente não', not _can_see_occurrence_path(v_occ::text));

  -- 11. Tipos e permissões -----------------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('tipo com nome repetido', format('select admin_upsert_occurrence_type(null, %L::jsonb)',
    '{"name": "furto"}'), 'Já existe');
  v_type := admin_upsert_occurrence_type(null, '{"name": "Embalagem aberta", "customerCan": true, "deadlineHours": 48}');
  perform _t_as(null);
  perform _t_check('tipo novo criado', (select deadline_hours = 48 and customer_can from occurrence_types where id = v_type));
  perform _t_as(v_a);
  r := admin_occurrence(v_occ);
  perform _t_check('admin vê tudo: nota interna, responsável e anexos',
    r ->> 'assigneeName' is not null and jsonb_array_length(r -> 'attachments') = 1
    and exists (select 1 from jsonb_array_elements(r -> 'updates') u where (u ->> 'internal')::boolean), r::text);
  perform _t_check('lista do pedido no detalhe', jsonb_array_length(admin_occurrences(x)) >= 4);
  perform _t_as(v_nc);
  perform _t_err('perfil sem ocorrências não lista', 'select admin_occurrences()', 'não permite');
  perform _t_err('perfil sem ocorrências não cria tipo', format('select admin_upsert_occurrence_type(null, %L::jsonb)',
    '{"name": "Outro"}'), 'não permite');
  perform _t_check('perfil com dashboard vê o resumo', (admin_occurrence_summary() ->> 'aberta') is not null);

  -- 12. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
