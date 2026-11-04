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
