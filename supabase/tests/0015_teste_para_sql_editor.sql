-- TESTE da 0015 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. Gerado de migrations/0015_order_handling.sql + tests/0015_order_handling_test.sql.

begin;

-- Backoffice, entrega 3: conferência, fotos, custódia e retirada por código.
-- Precisa da 0014 (linha do tempo). Ver supabase/migrations/rollback/0015_down.sql.
--
-- Conferência é só quantidade esperada × recebida (sem avaliar o estado da carta).
-- Retirada: o QR do pacote leva a /retirada/<package_token>; o lojista digita o
-- código de 6 dígitos que o cliente mostra. Código certo conclui o pedido e não
-- vale de novo; 5 erros travam por 15 minutos.
--
-- Aditiva: nenhuma função antiga muda de comportamento.

-- ---------------------------------------------------------------------------
-- 1. Linha do tempo: tipos e autor novos
-- ---------------------------------------------------------------------------
alter table order_events drop constraint order_events_actor_kind_check;
alter table order_events add constraint order_events_actor_kind_check
  check (actor_kind in ('customer', 'admin', 'store', 'system'));
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened',
  'items_checked', 'custody'
));

-- 'store' = lojista confirmando a retirada pelo QR (ainda sem conta própria).
create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'store' then
    actor_id := null;
    actor_kind := 'store';
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
-- 2. Tabelas
-- ---------------------------------------------------------------------------
create table order_item_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  card_item_id uuid unique references pedido_card_items(id) on delete cascade,
  accessory_item_id uuid unique references pedido_accessory_items(id) on delete cascade,
  expected_qty int not null check (expected_qty >= 0),
  received_qty int not null check (received_qty between 0 and 100000),
  note text check (coalesce(char_length(note), 0) <= 500),
  checked_by uuid references profiles(id) on delete set null,
  checked_at timestamptz not null default now(),
  constraint order_item_checks_item_check check (num_nonnulls(card_item_id, accessory_item_id) = 1)
);
create index order_item_checks_order_idx on order_item_checks (order_id);

create table order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  -- Os dois vazios = foto geral do pacote.
  card_item_id uuid references pedido_card_items(id) on delete cascade,
  accessory_item_id uuid references pedido_accessory_items(id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint order_photos_item_check check (num_nonnulls(card_item_id, accessory_item_id) <= 1)
);
create index order_photos_order_idx on order_photos (order_id);

create table custody_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  action text not null check (action in (
    'coletado_na_loja', 'recebido_na_base', 'consolidado', 'saiu_para_entrega',
    'entregue_no_ponto', 'retirado_pelo_cliente', 'outro'
  )),
  store_id uuid references stores(id),
  location_note text check (coalesce(char_length(location_note), 0) <= 200),
  responsible_name text check (coalesce(char_length(responsible_name), 0) <= 120),
  note text check (coalesce(char_length(note), 0) <= 500),
  recorded_by uuid references profiles(id) on delete set null
);
create index custody_events_order_idx on custody_events (order_id, created_at);
create index custody_events_store_idx on custody_events (store_id);

create table order_pickups (
  order_id uuid primary key references orders(id) on delete cascade,
  package_token text not null unique check (package_token ~ '^[0-9a-f]{32}$'),
  pickup_code text not null check (pickup_code ~ '^[0-9]{6}$'),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Acesso: admin lê tudo; o dono lê conferência, fotos e código do próprio
--    pedido; custódia é interna. Escrita só pelas funções abaixo.
-- ---------------------------------------------------------------------------
alter table order_item_checks enable row level security;
alter table order_photos enable row level security;
alter table custody_events enable row level security;
alter table order_pickups enable row level security;

create policy "admins read all item checks" on order_item_checks for select using (is_admin());
create policy "owners read own item checks" on order_item_checks for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "admins read all order photos" on order_photos for select using (is_admin());
create policy "owners read own order photos" on order_photos for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "admins read all custody events" on custody_events for select using (is_admin());
create policy "admins read all order pickups" on order_pickups for select using (is_admin());
create policy "owners read own order pickup" on order_pickups for select
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));

revoke insert, update, delete on order_item_checks, order_photos, custody_events, order_pickups
  from anon, authenticated;
revoke select on order_item_checks, order_photos, custody_events, order_pickups from anon;

-- Bucket privado das fotos: "<pedido>/<arquivo>". Dono do pedido só vê.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload order photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'order-photos' and public.is_admin());
create policy "admins delete order photos" on storage.objects
  for delete to authenticated using (bucket_id = 'order-photos' and public.is_admin());
create policy "admins and owners read order photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-photos' and (
      public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1] and o.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Código de retirada: nasce no pagamento
-- ---------------------------------------------------------------------------
create or replace function public._new_pickup(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- gen_random_uuid() usa o gerador seguro do Postgres: 122 bits no token, e os
  -- 6 dígitos tirados de outro uuid.
  insert into order_pickups (order_id, package_token, pickup_code)
  values (
    p_order,
    replace(gen_random_uuid()::text, '-', ''),
    lpad((('x' || lpad(left(replace(gen_random_uuid()::text, '-', ''), 8), 16, '0'))::bit(64)::bigint
      % 1000000)::text, 6, '0')
  )
  on conflict (order_id) do nothing;
end;
$$;

create or replace function public._orders_create_pickup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform _new_pickup(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_create_pickup
  after update of status on orders
  for each row execute function _orders_create_pickup();

-- ---------------------------------------------------------------------------
-- 5. Custódia e conferência entram na linha do tempo
-- ---------------------------------------------------------------------------
create or replace function public._custody_log_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from orders where id = new.order_id;
  perform _log_order_event(new.order_id, v_owner, 'custody', null, new.action,
    jsonb_strip_nulls(jsonb_build_object(
      'storeCode', (select code from stores where id = new.store_id),
      'location', new.location_note,
      'responsible', new.responsible_name,
      'note', new.note
    )));
  return new;
end;
$$;

create trigger custody_events_log
  after insert on custody_events
  for each row execute function _custody_log_event();

-- ---------------------------------------------------------------------------
-- 6. Funções do admin
-- ---------------------------------------------------------------------------
-- p: [{ "kind": "card" | "accessory", "itemId": uuid, "receivedQty": int, "note": text }]
create or replace function public.admin_save_item_checks(p_order uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  it jsonb;
  v_item uuid;
  v_expected int;
  v_received int;
  v_note text;
  v_count int := 0;
  v_divergent int := 0;
begin
  perform _require_admin();
  select user_id into v_owner from orders where id = p_order;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 500 then
    raise exception 'Nada para salvar.' using errcode = 'P0001';
  end if;

  for it in select value from jsonb_array_elements(p) loop
    v_item := (it ->> 'itemId')::uuid;
    v_received := (it ->> 'receivedQty')::int;
    v_note := nullif(btrim(coalesce(it ->> 'note', '')), '');
    if v_received is null or v_received < 0 or v_received > 100000 then
      raise exception 'Confira as quantidades recebidas.' using errcode = 'P0001';
    end if;
    if char_length(coalesce(v_note, '')) > 500 then
      raise exception 'A observação é longa demais.' using errcode = 'P0001';
    end if;

    if it ->> 'kind' = 'card' then
      select i.quantity into v_expected from pedido_card_items i
        join pedido_groups g on g.id = i.group_id
        where i.id = v_item and g.order_id = p_order;
      if not found then
        raise exception 'Item não pertence a este pedido.' using errcode = 'P0001';
      end if;
      insert into order_item_checks (order_id, card_item_id, expected_qty, received_qty, note, checked_by)
      values (p_order, v_item, v_expected, v_received, v_note, auth.uid())
      on conflict (card_item_id) do update set
        expected_qty = excluded.expected_qty, received_qty = excluded.received_qty,
        note = excluded.note, checked_by = excluded.checked_by, checked_at = now();
    elsif it ->> 'kind' = 'accessory' then
      select i.quantity into v_expected from pedido_accessory_items i
        join pedido_groups g on g.id = i.group_id
        where i.id = v_item and g.order_id = p_order;
      if not found then
        raise exception 'Item não pertence a este pedido.' using errcode = 'P0001';
      end if;
      insert into order_item_checks (order_id, accessory_item_id, expected_qty, received_qty, note, checked_by)
      values (p_order, v_item, v_expected, v_received, v_note, auth.uid())
      on conflict (accessory_item_id) do update set
        expected_qty = excluded.expected_qty, received_qty = excluded.received_qty,
        note = excluded.note, checked_by = excluded.checked_by, checked_at = now();
    else
      raise exception 'Tipo de item inválido.' using errcode = 'P0001';
    end if;

    v_count := v_count + 1;
    if v_received <> v_expected then
      v_divergent := v_divergent + 1;
    end if;
  end loop;

  perform set_config('t1.actor', 'admin', true);
  perform _log_order_event(p_order, v_owner, 'items_checked', null, null,
    jsonb_build_object('checked', v_count, 'divergent', v_divergent));
exception
  when invalid_text_representation then
    raise exception 'Dados da conferência inválidos.' using errcode = 'P0001';
end;
$$;

-- O arquivo já foi enviado ao bucket pelo navegador; aqui só registramos.
create or replace function public.admin_add_photo(p_order uuid, p_kind text, p_item uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform _require_admin();
  if not exists (select 1 from orders where id = p_order) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^' || p_order::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Arquivo de foto inválido.' using errcode = 'P0001';
  end if;
  if p_item is not null and not (
    (p_kind = 'card' and exists (
      select 1 from pedido_card_items i join pedido_groups g on g.id = i.group_id
      where i.id = p_item and g.order_id = p_order))
    or (p_kind = 'accessory' and exists (
      select 1 from pedido_accessory_items i join pedido_groups g on g.id = i.group_id
      where i.id = p_item and g.order_id = p_order))
  ) then
    raise exception 'Item não pertence a este pedido.' using errcode = 'P0001';
  end if;

  insert into order_photos (order_id, card_item_id, accessory_item_id, path, created_by)
  values (
    p_order,
    case when p_kind = 'card' then p_item end,
    case when p_kind = 'accessory' then p_item end,
    p_path, auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Devolve o caminho para o navegador apagar o arquivo do bucket.
create or replace function public.admin_delete_photo(p_photo uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  perform _require_admin();
  delete from order_photos where id = p_photo returning path into v_path;
  if v_path is null then
    raise exception 'Foto não encontrada.' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

-- p: { "action", "storeCode"?, "location"?, "responsible"?, "note"? }
create or replace function public.admin_add_custody_event(p_order uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_store uuid;
  v_action text := p ->> 'action';
  v_location text := nullif(btrim(coalesce(p ->> 'location', '')), '');
  v_responsible text := nullif(btrim(coalesce(p ->> 'responsible', '')), '');
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
begin
  perform _require_admin();
  if not exists (select 1 from orders where id = p_order) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_action is null or v_action not in (
    'coletado_na_loja', 'recebido_na_base', 'consolidado', 'saiu_para_entrega',
    'entregue_no_ponto', 'retirado_pelo_cliente', 'outro'
  ) then
    raise exception 'Escolha a movimentação.' using errcode = 'P0001';
  end if;
  if v_action = 'outro' and v_note is null then
    raise exception 'Descreva a movimentação na observação.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'storeCode', '') <> '' then
    select id into v_store from stores where code = p ->> 'storeCode';
    if v_store is null then
      raise exception 'Loja inválida.' using errcode = 'P0001';
    end if;
  end if;
  if char_length(coalesce(v_location, '')) > 200 or char_length(coalesce(v_responsible, '')) > 120
     or char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Algum campo passou do limite de tamanho.' using errcode = 'P0001';
  end if;

  perform set_config('t1.actor', 'admin', true);
  insert into custody_events (order_id, action, store_id, location_note, responsible_name, note, recorded_by)
  values (p_order, v_action, v_store, v_location, v_responsible, v_note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Página pública do QR (/retirada/<token>)
-- ---------------------------------------------------------------------------
-- Só o mínimo para o lojista: nada de e-mail, endereço ou valores.
create or replace function public.pickup_lookup(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
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
    'attemptsLeft', 5 - r.failed_attempts
  );
end;
$$;

-- Código errado não lança erro (lançar desfaria o contador de tentativas).
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
begin
  select * into v_pickup from order_pickups where package_token = p_token for update;
  if not found then
    raise exception 'Este QR não é de um pacote da T1 Express.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = v_pickup.order_id for update;
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

  perform set_config('t1.actor', 'store', true);
  update order_pickups set used_at = now(), failed_attempts = 0, locked_until = null
    where order_id = v_pickup.order_id;
  update orders set status = 'completed', completed_at = now() where id = v_order.id;
  insert into custody_events (order_id, action, store_id, responsible_name, note)
  values (v_order.id, 'retirado_pelo_cliente', v_order.destination_store_id,
          'Loja de retirada', 'Retirada confirmada com o código do cliente.');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Permissões
-- ---------------------------------------------------------------------------
revoke all on function
  _new_pickup(uuid),
  _orders_create_pickup(),
  _custody_log_event(),
  admin_save_item_checks(uuid, jsonb),
  admin_add_photo(uuid, text, uuid, text),
  admin_delete_photo(uuid),
  admin_add_custody_event(uuid, jsonb),
  pickup_lookup(text),
  pickup_confirm(text, text)
from public, anon, authenticated;

grant execute on function
  admin_save_item_checks(uuid, jsonb),
  admin_add_photo(uuid, text, uuid, text),
  admin_delete_photo(uuid),
  admin_add_custody_event(uuid, jsonb)
to authenticated;

grant execute on function pickup_lookup(text), pickup_confirm(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Pedidos ativos que já existem ganham o código agora
-- ---------------------------------------------------------------------------
do $$
begin
  perform _new_pickup(id) from orders where status = 'active';
end;
$$;

-- Teste da 0015_order_handling.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Montado junto com a migração em 0015_teste_para_sql_editor.sql.

create table public._t_results (n serial primary key, ok boolean not null, name text not null, info text);
grant all on public._t_results to anon, authenticated;
grant usage on sequence public._t_results_n_seq to anon, authenticated;

create function public._t_check(p_name text, p_ok boolean, p_info text default null)
returns void language sql security definer set search_path = public as $$
  insert into _t_results (ok, name, info) values (coalesce(p_ok, false), p_name, p_info);
$$;

-- Age como o usuário, como anônimo ('anon') ou, com null, como o SQL Editor.
-- Também limpa as marcas t1.*: no app cada chamada é uma transação nova.
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

create function public._t_last_event(p_order uuid)
returns order_events language sql security definer set search_path = public as $$
  select * from order_events where order_id = p_order order by created_at desc limit 1;
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
  v_dest text; v_s1 text; v_s2 text;
  v_payload jsonb;
  x uuid; y uuid; v_other uuid;
  v_item uuid; v_other_item uuid;
  v_token text; v_code text; v_wrong text;
  v_photo uuid; v_path text;
  r jsonb;
  e order_events;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pedidos ativos que já existiam ganharam o código -----------------------
  perform _t_check('pedidos ativos antigos têm código',
    (select count(*) from orders o where o.status = 'active'
       and not exists (select 1 from order_pickups p where p.order_id = o.id)) = 0);
  perform _t_check('códigos com 6 dígitos e token de 32',
    (select count(*) from order_pickups where pickup_code !~ '^[0-9]{6}$' or package_token !~ '^[0-9a-f]{32}$') = 0);

  -- 2. Usuários, lojas e pedidos de teste (somem no fim) ---------------------------
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_c, 't1.teste.c.' || left(v_c::text, 8) || '@example.com', '{"name":"Cliente Teste"}'),
    (v_a, 't1.teste.a.' || left(v_a::text, 8) || '@example.com', '{"name":"Admin Teste"}'),
    (v_o, 't1.teste.o.' || left(v_o::text, 8) || '@example.com', '{"name":"Outro Teste"}');
  insert into admins (user_id) values (v_a);

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;
  v_payload := jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1, v_s2),
    'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object(
      'storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object(
        'cardName', 'Charizard', 'game', 'pokemon', 'price', 10, 'priceMode', 'unit', 'quantity', 2)))));

  perform _t_as(v_c);
  x := create_order(v_payload);
  y := create_order(v_payload);
  perform _t_as(v_o);
  v_other := create_order(v_payload);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y, v_other);
  perform _t_check('sem pagamento, sem código', (select count(*) from order_pickups where order_id = x) = 0);

  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform _t_as(v_o);
  perform pay_order(v_other, 'pix');
  perform _t_as(null);
  select package_token, pickup_code into v_token, v_code from order_pickups where order_id = x;
  perform _t_check('pagar cria o código', v_token is not null and v_code ~ '^[0-9]{6}$');
  select i.id into v_item from pedido_card_items i join pedido_groups g on g.id = i.group_id where g.order_id = x;
  select i.id into v_other_item from pedido_card_items i join pedido_groups g on g.id = i.group_id where g.order_id = v_other;

  -- 3. Quem vê o código ---------------------------------------------------------------
  perform _t_as(v_c);
  select count(*) into v_n from order_pickups;
  perform _t_check('cliente vê só o próprio código', v_n = 1, v_n::text);
  perform _t_as(v_o);
  select count(*) into v_n from order_pickups where order_id = x;
  perform _t_check('outro usuário não vê o código', v_n = 0);
  perform _t_as(null, true);
  perform _t_err('anônimo não lê códigos', 'select count(*) from order_pickups', 'permission denied');

  -- 4. Conferência ------------------------------------------------------------------
  perform _t_as(v_o);
  perform _t_err('não admin não confere',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 2))),
    'Acesso restrito');
  perform _t_as(v_a);
  perform _t_err('item de outro pedido é recusado',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_other_item, 'receivedQty', 1))),
    'não pertence');
  perform _t_err('quantidade negativa é recusada',
    format('select admin_save_item_checks(%L, %L::jsonb)', x,
      jsonb_build_array(jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', -1))),
    'quantidades');
  perform admin_save_item_checks(x, jsonb_build_array(
    jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 1, 'note', 'Veio só uma')));
  perform _t_check('conferência gravada com o esperado do pedido',
    (select expected_qty = 2 and received_qty = 1 and note = 'Veio só uma' and checked_by = v_a
       from order_item_checks where card_item_id = v_item));
  e := _t_last_event(x);
  perform _t_check('conferência entra na linha do tempo',
    e.kind = 'items_checked' and e.actor_kind = 'admin' and (e.details ->> 'divergent')::int = 1, e.details::text);
  perform admin_save_item_checks(x, jsonb_build_array(
    jsonb_build_object('kind', 'card', 'itemId', v_item, 'receivedQty', 2)));
  perform _t_check('salvar de novo atualiza (sem duplicar)',
    (select count(*) = 1 and min(received_qty) = 2 and min(note) is null from order_item_checks where card_item_id = v_item));
  perform _t_as(v_c);
  select count(*) into v_n from order_item_checks;
  perform _t_check('cliente vê a própria conferência', v_n = 1);
  perform _t_as(v_o);
  select count(*) into v_n from order_item_checks where order_id = x;
  perform _t_check('outro usuário não vê a conferência', v_n = 0);

  -- 5. Fotos ------------------------------------------------------------------------
  perform _t_as(v_a);
  v_path := x::text || '/' || gen_random_uuid()::text || '.jpg';
  perform _t_err('caminho de foto de outro pedido é recusado',
    format('select admin_add_photo(%L, ''card'', %L, %L)', x, v_item, v_other::text || '/' || gen_random_uuid() || '.jpg'),
    'Arquivo de foto inválido');
  perform _t_err('foto de item de outro pedido é recusada',
    format('select admin_add_photo(%L, ''card'', %L, %L)', x, v_other_item, v_path), 'não pertence');
  v_photo := admin_add_photo(x, 'card', v_item, v_path);
  perform admin_add_photo(x, null, null, x::text || '/' || gen_random_uuid()::text || '.webp');
  perform _t_as(v_c);
  select count(*) into v_n from order_photos;
  perform _t_check('cliente vê as fotos do próprio pedido', v_n = 2, v_n::text);
  perform _t_as(v_o);
  select count(*) into v_n from order_photos where order_id = x;
  perform _t_check('outro usuário não vê as fotos', v_n = 0);
  perform _t_as(v_a);
  perform _t_check('apagar foto devolve o caminho', admin_delete_photo(v_photo) = v_path);
  perform _t_as(null);  -- storage.buckets só é legível pelo dono do banco
  perform _t_check('bucket é privado',
    (select not public from storage.buckets where id = 'order-photos'));

  -- 6. Custódia ---------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('"outro" sem observação é recusado',
    format('select admin_add_custody_event(%L, %L::jsonb)', x, '{"action":"outro"}'), 'Descreva');
  perform _t_err('movimentação inválida é recusada',
    format('select admin_add_custody_event(%L, %L::jsonb)', x, '{"action":"sumiu"}'), 'Escolha a movimentação');
  perform admin_add_custody_event(x, jsonb_build_object(
    'action', 'coletado_na_loja', 'storeCode', v_s1, 'responsible', 'João Entregador'));
  e := _t_last_event(x);
  perform _t_check('custódia entra na linha do tempo',
    e.kind = 'custody' and e.to_value = 'coletado_na_loja' and e.details ->> 'storeCode' = v_s1
    and e.details ->> 'responsible' = 'João Entregador', e.details::text);
  perform _t_as(v_c);
  select count(*) into v_n from custody_events;
  perform _t_check('cliente não vê a custódia', v_n = 0);

  -- 7. Página do QR -----------------------------------------------------------------
  perform _t_as(null, true);
  r := pickup_lookup(v_token);
  perform _t_check('QR: pedido ainda não chegou',
    (r ->> 'found')::boolean and r ->> 'state' = 'not_ready' and r ->> 'customerFirstName' = 'Cliente'
    and r ->> 'orderCode' = upper(left(x::text, 8)), r::text);
  perform _t_check('QR: não expõe e-mail nem código', r::text not like '%@%' and r::text not like '%' || v_code || '%');
  perform _t_err('QR: não confirma antes de chegar',
    format('select pickup_confirm(%L, %L)', v_token, v_code), 'ainda não está liberado');
  perform _t_check('QR: token inválido não encontra', not (pickup_lookup('0123456789abcdef0123456789abcdef') ->> 'found')::boolean);
  perform _t_err('QR: confirmar com token inválido',
    format('select pickup_confirm(%L, %L)', '0123456789abcdef0123456789abcdef', '000000'), 'não é de um pacote');
  perform _t_err('anônimo não usa função de admin',
    format('select admin_save_item_checks(%L, ''[]''::jsonb)', x), 'permission denied');

  perform _t_as(v_a);
  perform admin_move_order(x, 'disponivel-para-retirada', 'Teste');
  perform _t_as(null, true);
  perform _t_check('QR: pronto para retirar', pickup_lookup(v_token) ->> 'state' = 'ready');

  v_wrong := case when v_code = '000000' then '111111' else '000000' end;
  for i in 1..4 loop
    r := pickup_confirm(v_token, v_wrong);
    perform _t_check('código errado nº ' || i, not (r ->> 'ok')::boolean and (r ->> 'attemptsLeft')::int = 5 - i, r::text);
  end loop;
  r := pickup_confirm(v_token, v_wrong);
  perform _t_check('5º erro trava', (r ->> 'locked')::boolean, r::text);
  perform _t_err('travado recusa até o código certo',
    format('select pickup_confirm(%L, %L)', v_token, v_code), 'Muitas tentativas');
  perform _t_as(null);
  perform _t_check('pedido continua aberto depois dos erros', (select status = 'active' from orders where id = x));

  perform _t_as(null);
  update order_pickups set locked_until = now() - interval '1 second' where order_id = x;
  perform _t_as(null, true);
  r := pickup_confirm(v_token, v_code);
  perform _t_check('código certo confirma', (r ->> 'ok')::boolean, r::text);
  perform _t_as(null);
  perform _t_check('pedido concluído', (select status = 'completed' and completed_at is not null from orders where id = x));
  perform _t_check('código marcado como usado', (select used_at is not null from order_pickups where order_id = x));
  perform _t_check('custódia "retirado pelo cliente" na loja de retirada',
    exists (select 1 from custody_events c join orders o on o.id = c.order_id
            where c.order_id = x and c.action = 'retirado_pelo_cliente' and c.store_id = o.destination_store_id));
  perform _t_check('linha do tempo: concluído pela loja',
    exists (select 1 from order_events where order_id = x and kind = 'completed' and actor_kind = 'store'
            and from_value = 'disponivel-para-retirada'));
  perform _t_as(null, true);
  perform _t_err('código não vale de novo', format('select pickup_confirm(%L, %L)', v_token, v_code), 'já foi retirado');
  perform _t_check('QR: já retirado', pickup_lookup(v_token) ->> 'state' = 'done');

  perform _t_as(v_c);
  perform pay_order(y, 'pix');
  perform _t_as(v_a);
  perform admin_move_order(y, 'cancelled', 'Teste');
  perform _t_as(null);
  select package_token into v_token from order_pickups where order_id = y;
  perform _t_as(null, true);
  perform _t_check('QR: pedido cancelado avisa', pickup_lookup(v_token) ->> 'state' = 'cancelled');

  -- 8. Resultado: o erro abaixo é de propósito e desfaz TUDO ----------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
