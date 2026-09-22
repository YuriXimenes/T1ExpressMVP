-- Etapa 3 (pedidos reais).
--
-- Até aqui as tabelas de pedido tinham RLS "for all" (o dono podia tudo), o que
-- deixaria qualquer usuário logado gravar status='active' ou amount_due_brl=0
-- direto pela API pública. Passamos a:
--   * deixar as tabelas de pedido SÓ para leitura do dono (RLS de select);
--   * gravar exclusivamente por funções abaixo, que validam as regras e
--     RECALCULAM no servidor todos os valores cobrados (frete, itens, seguro,
--     cupom e total a pagar). Cada função é uma transação: nunca sobra pedido
--     pela metade.
-- Regras de negócio espelham o TypeScript (freight-simulation, insurance,
-- coupons, store-order-builder). Ver supabase/migrations/rollback/0005_down.sql.

-- ---------------------------------------------------------------------------
-- 1. Sanidade dos dados (as tabelas de pedido estão vazias neste momento)
-- ---------------------------------------------------------------------------
-- Ordem em que o usuário digitou grupos e itens (created_at empata dentro de uma transação).
alter table pedido_groups add column sort_order int not null default 0;
alter table pedido_card_items add column sort_order int not null default 0;
alter table pedido_accessory_items add column sort_order int not null default 0;

alter table pedido_card_items
  add constraint pedido_card_items_values_check
  check (quantity > 0 and quantity <= 100000 and price >= 0 and char_length(card_name) <= 200);
alter table pedido_accessory_items
  add constraint pedido_accessory_items_values_check
  check (quantity > 0 and quantity <= 100000 and price >= 0);
alter table orders
  add constraint orders_amounts_check
  check (
    items_total_brl >= 0 and insurance_coverage_brl >= 0 and insurance_extra_cost_brl >= 0
    and freight_after_discount_brl >= 0 and amount_due_brl >= 0 and quote_price_brl >= 0
    and char_length(delivery_note) <= 2000
  );
alter table orders
  add constraint orders_status_consistency_check
  check (
    (status = 'pending-payment' and paid_at is null and completed_at is null and delivery_stage is null)
    or (status = 'active' and paid_at is not null and completed_at is null and delivery_stage is not null)
    or (status = 'completed' and paid_at is not null and completed_at is not null)
  );
alter table store_charges
  add constraint store_charges_amounts_check
  check (
    amount_brl >= 0 and items_total_added_brl >= 0
    and ((status = 'pending-payment' and paid_at is null) or (status = 'paid' and paid_at is not null))
  );
alter table support_tickets
  add constraint support_tickets_length_check
  check (char_length(subject) between 1 and 200 and char_length(message) between 1 and 5000);

-- ---------------------------------------------------------------------------
-- 2. RLS: dono só LÊ; ninguém escreve direto
-- ---------------------------------------------------------------------------
drop policy if exists "users manage own orders" on orders;
drop policy if exists "users manage own order origin stores" on order_origin_stores;
drop policy if exists "users manage own order quote competitors" on order_quote_competitors;
drop policy if exists "users manage own store charges" on store_charges;
drop policy if exists "users manage own pedido groups" on pedido_groups;
drop policy if exists "users manage own pedido card items" on pedido_card_items;
drop policy if exists "users manage own pedido accessory items" on pedido_accessory_items;
drop policy if exists "users manage own store charge stores" on store_charge_stores;
drop policy if exists "users manage own support tickets" on support_tickets;

create policy "users read own orders" on orders for select
  using (auth.uid() = user_id);

create policy "users read own order origin stores" on order_origin_stores for select
  using (exists (select 1 from orders o where o.id = order_origin_stores.order_id and o.user_id = auth.uid()));

create policy "users read own order quote competitors" on order_quote_competitors for select
  using (exists (select 1 from orders o where o.id = order_quote_competitors.order_id and o.user_id = auth.uid()));

create policy "users read own store charges" on store_charges for select
  using (exists (select 1 from orders o where o.id = store_charges.order_id and o.user_id = auth.uid()));

create policy "users read own pedido groups" on pedido_groups for select
  using (
    (order_id is not null and exists (select 1 from orders o where o.id = pedido_groups.order_id and o.user_id = auth.uid()))
    or
    (store_charge_id is not null and exists (
      select 1 from store_charges sc join orders o on o.id = sc.order_id
      where sc.id = pedido_groups.store_charge_id and o.user_id = auth.uid()
    ))
  );

create policy "users read own pedido card items" on pedido_card_items for select
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_card_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

create policy "users read own pedido accessory items" on pedido_accessory_items for select
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_accessory_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

create policy "users read own store charge stores" on store_charge_stores for select
  using (exists (
    select 1 from store_charges sc join orders o on o.id = sc.order_id
    where sc.id = store_charge_stores.charge_id and o.user_id = auth.uid()
  ));

create policy "users read own support tickets" on support_tickets for select
  using (exists (select 1 from orders o where o.id = support_tickets.order_id and o.user_id = auth.uid()));

revoke insert, update, delete, truncate on
  orders, order_origin_stores, order_quote_competitors, store_charges, store_charge_stores,
  pedido_groups, pedido_card_items, pedido_accessory_items, support_tickets
from anon, authenticated;
revoke select on
  orders, order_origin_stores, order_quote_competitors, store_charges, store_charge_stores,
  pedido_groups, pedido_card_items, pedido_accessory_items, support_tickets
from anon;

-- ---------------------------------------------------------------------------
-- 3. Auxiliares internos (não expostos)
-- ---------------------------------------------------------------------------

-- Lê um número do JSON validando tipo e faixa.
create or replace function public._json_num(j jsonb, k text, lo numeric, hi numeric, whole boolean default false)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare v numeric;
begin
  if jsonb_typeof(j -> k) is distinct from 'number' then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;
  v := (j ->> k)::numeric;
  if v < lo or v > hi or (whole and v <> trunc(v)) then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Insere grupos de itens (de um pedido OU de uma cobrança) e devolve o total
-- declarado (lineTotal: preço total se price_mode='total', senão preço × quantidade).
create or replace function public._insert_pedido_groups(
  p_order_id uuid,
  p_charge_id uuid,
  p_groups jsonb,
  p_allowed_store_ids uuid[]
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb;
  it jsonb;
  v_store uuid;
  v_group uuid;
  v_kind pedido_kind;
  v_mode price_mode;
  v_price numeric;
  v_qty int;
  v_total numeric := 0;
  v_items jsonb;
  v_gi int := 0;
  v_ii int;
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 100 then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;

  for g in select value from jsonb_array_elements(p_groups) loop
    select id into v_store from stores where code = g ->> 'storeCode';
    if v_store is null or not (v_store = any (p_allowed_store_ids)) then
      raise exception 'Loja inválida para este pedido.' using errcode = 'P0001';
    end if;
    v_kind := (g ->> 'kind')::pedido_kind;

    v_gi := v_gi + 1;
    v_ii := 0;
    insert into pedido_groups (order_id, store_charge_id, store_id, kind, order_number, sort_order)
    values (p_order_id, p_charge_id, v_store, v_kind, left(coalesce(g ->> 'orderNumber', ''), 60), v_gi)
    returning id into v_group;

    v_items := case when v_kind = 'acessorios' then g -> 'accessoryItems' else g -> 'cardItems' end;
    if v_items is null then v_items := '[]'::jsonb; end if;
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 200 then
      raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
    end if;

    for it in select value from jsonb_array_elements(v_items) loop
      v_price := round(_json_num(it, 'price', 0, 1000000), 2);
      v_qty := _json_num(it, 'quantity', 1, 100000, true)::int;
      v_mode := (it ->> 'priceMode')::price_mode;
      v_ii := v_ii + 1;

      if v_kind = 'acessorios' then
        insert into pedido_accessory_items (group_id, accessory, other_accessory, price, price_mode, quantity, sort_order)
        values (
          v_group, (it ->> 'accessory')::accessory_kind,
          left(nullif(it ->> 'otherAccessory', ''), 200), v_price, v_mode, v_qty, v_ii
        );
      else
        insert into pedido_card_items (group_id, card_name, game, other_game, price, price_mode, quantity, sort_order)
        values (
          v_group, left(coalesce(it ->> 'cardName', ''), 200), (it ->> 'game')::game_tag,
          left(nullif(it ->> 'otherGame', ''), 200), v_price, v_mode, v_qty, v_ii
        );
      end if;

      v_total := v_total + case when v_mode = 'total' then v_price else v_price * v_qty end;
    end loop;
  end loop;

  return round(v_total, 2);
exception
  when invalid_text_representation then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
end;
$$;

-- Seguro: base de R$100; cada R$100 de cobertura extra custa R$1 (insurance.ts).
create or replace function public._insurance_needed(p_items_total numeric)
returns numeric
language sql
immutable
as $$
  select case when p_items_total <= 100 then 100::numeric else ceil(p_items_total / 100) * 100 end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Funções chamadas pelo app (usuário logado)
-- ---------------------------------------------------------------------------

-- Cria o pedido (sempre "aguardando pagamento") e devolve o id.
create or replace function public.create_order(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_origin_ids uuid[] := '{}';
  v_origin_names text[] := '{}';
  v_origin_count int;
  v_dest_id uuid;
  v_dest_name text;
  v_store_id uuid;
  v_store_name text;
  v_order uuid := gen_random_uuid();
  v_price numeric;
  v_items_total numeric;
  v_opted boolean;
  v_needed numeric;
  v_coverage numeric := 100;
  v_extra numeric := 0;
  v_coupon coupons%rowtype;
  v_coupon_code text;
  v_discount numeric := 0;
  v_after numeric;
  v_days_min int;
  v_days_max int;
  v_savings numeric;
  c jsonb;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'Perfil não encontrado.' using errcode = 'P0001';
  end if;

  -- Origens: 1 a 11 lojas distintas e existentes.
  if jsonb_typeof(p -> 'originStoreCodes') is distinct from 'array'
     or jsonb_array_length(p -> 'originStoreCodes') not between 1 and 11 then
    raise exception 'Selecione ao menos uma loja de origem.' using errcode = 'P0001';
  end if;
  for v_code in select jsonb_array_elements_text(p -> 'originStoreCodes') loop
    select id, name into v_store_id, v_store_name from stores where code = v_code;
    if v_store_id is null or v_store_id = any (v_origin_ids) then
      raise exception 'Loja de origem inválida.' using errcode = 'P0001';
    end if;
    v_origin_ids := v_origin_ids || v_store_id;
    v_origin_names := v_origin_names || v_store_name;
  end loop;
  v_origin_count := array_length(v_origin_ids, 1);

  select id, name into v_dest_id, v_dest_name from stores
    where code = p ->> 'destinationStoreCode' and is_pickup_point;
  if v_dest_id is null or v_dest_id = any (v_origin_ids) then
    raise exception 'Ponto de retirada inválido.' using errcode = 'P0001';
  end if;

  -- Frete da T1: R$12 + R$3 por loja de coleta além da primeira (freight-simulation.ts).
  v_price := 12 + (v_origin_count - 1) * 3;

  v_days_min := _json_num(p -> 'quote', 'estimatedDaysMin', 1, 60, true)::int;
  v_days_max := _json_num(p -> 'quote', 'estimatedDaysMax', 1, 60, true)::int;
  if v_days_max < v_days_min then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;
  v_savings := case when jsonb_typeof(p -> 'quote' -> 'cheapestSavingsBRL') = 'number'
                    then round(_json_num(p -> 'quote', 'cheapestSavingsBRL', 0, 100000), 2) end;

  -- Cupom (só ativo), desconto limitado ao frete (coupons.ts).
  v_coupon_code := upper(btrim(coalesce(p ->> 'couponCode', '')));
  if v_coupon_code <> '' then
    select * into v_coupon from coupons where code = v_coupon_code and active;
    if not found then
      raise exception 'Cupom inválido.' using errcode = 'P0001';
    end if;
    v_discount := round(least(greatest(
      case when v_coupon.type = 'percent' then v_price * v_coupon.value / 100 else v_coupon.value end,
      0), v_price), 2);
  end if;
  v_after := greatest(v_price - v_discount, 0);

  insert into orders (
    id, user_id, status, destination_store_id, delivery_note, freight_after_discount_brl,
    amount_due_brl, quote_price_brl, quote_estimated_days_min, quote_estimated_days_max,
    quote_distance_label, quote_cheapest_savings_brl,
    coupon_code, coupon_type, coupon_value, coupon_discount_brl
  ) values (
    v_order, v_uid, 'pending-payment', v_dest_id, left(coalesce(p ->> 'deliveryNote', ''), 2000), v_after,
    v_after, v_price, v_days_min, v_days_max,
    array_to_string(v_origin_names, ', ') || ' → ' || v_dest_name, v_savings,
    nullif(v_coupon_code, ''), v_coupon.type, v_coupon.value, case when v_coupon_code <> '' then v_discount end
  );

  insert into order_origin_stores (order_id, store_id)
    select v_order, unnest(v_origin_ids);

  -- Concorrentes: só informativos (Uber/Loggi/Correios), no máximo 3.
  if jsonb_typeof(p -> 'quote' -> 'competitors') = 'array' then
    if jsonb_array_length(p -> 'quote' -> 'competitors') > 3 then
      raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
    end if;
    for c in select value from jsonb_array_elements(p -> 'quote' -> 'competitors') loop
      insert into order_quote_competitors (order_id, carrier, label, eta_label, total_brl)
      values (
        v_order, (c ->> 'carrier')::carrier_code, left(coalesce(c ->> 'label', ''), 80),
        left(coalesce(c ->> 'etaLabel', ''), 40), round(_json_num(c, 'totalBRL', 0, 1000000), 2)
      );
    end loop;
  end if;

  v_items_total := _insert_pedido_groups(v_order, null, p -> 'groups', v_origin_ids);

  v_opted := coalesce((p ->> 'insuranceOptedIn')::boolean, false);
  if v_opted then
    v_needed := _insurance_needed(v_items_total);
    v_coverage := v_needed;
    v_extra := (v_needed - 100) / 100;
  end if;

  update orders set
    items_total_brl = v_items_total,
    insurance_opted_in = v_opted,
    insurance_coverage_brl = v_coverage,
    insurance_extra_cost_brl = v_extra,
    amount_due_brl = v_after + v_extra
  where id = v_order;

  return v_order;
exception
  when invalid_text_representation then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
end;
$$;

-- SIMULAÇÃO de pagamento (sem gateway): só registra o método, nunca dados de
-- cartão. TEMPORÁRIO: quando houver gateway, isto vira webhook e sai do alcance
-- do usuário.
create or replace function public.pay_order(p_order uuid, p_method payment_method)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending-payment' then
    raise exception 'Esse pedido já foi pago.' using errcode = 'P0001';
  end if;

  update orders set
    status = 'active',
    paid_at = now(),
    payment_method = p_method,
    delivery_stage = 'aguardando-coleta',
    estimated_pickup_date = now() + make_interval(days => v_order.quote_estimated_days_max)
  where id = p_order;
end;
$$;

-- O cliente confirma a retirada: só quando o pedido está "disponível para retirada".
create or replace function public.complete_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'active' or v_order.delivery_stage is distinct from 'disponivel-para-retirada' then
    raise exception 'O pedido ainda não está disponível para retirada.' using errcode = 'P0001';
  end if;

  update orders set status = 'completed', completed_at = now() where id = p_order;
end;
$$;

-- Adiciona grupos de itens a lojas que já fazem parte do pedido. Só enquanto o
-- pedido pode ser alterado (aguardando pagamento, ou ativo e aguardando coleta).
create or replace function public.add_groups_to_order(p_order uuid, p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders%rowtype;
  v_allowed uuid[];
  v_added numeric;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if not (v_order.status = 'pending-payment'
          or (v_order.status = 'active' and v_order.delivery_stage = 'aguardando-coleta')) then
    raise exception 'Este pedido não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  select array_agg(store_id) into v_allowed from order_origin_stores where order_id = p_order;
  v_added := _insert_pedido_groups(p_order, null, p_groups, coalesce(v_allowed, '{}'));

  -- Total declarado (informativo) acompanha os itens; o seguro só muda pelo fluxo de nova loja.
  update orders set items_total_brl = items_total_brl + v_added where id = p_order;
end;
$$;

-- Cobrança por adicionar lojas de coleta a um pedido existente. Os itens ficam
-- como rascunho da cobrança até o pagamento.
create or replace function public.add_store_charge(p_order uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders%rowtype;
  v_code text;
  v_store uuid;
  v_new_ids uuid[] := '{}';
  v_charge uuid := gen_random_uuid();
  v_added numeric;
  v_fee numeric;
  v_needed numeric;
  v_new_extra numeric;
  v_upgrade boolean := false;
  v_upgrade_cost numeric := 0;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if not (v_order.status = 'pending-payment'
          or (v_order.status = 'active' and v_order.delivery_stage = 'aguardando-coleta')) then
    raise exception 'Este pedido não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p -> 'storeCodes') is distinct from 'array'
     or jsonb_array_length(p -> 'storeCodes') not between 1 and 10 then
    raise exception 'Selecione ao menos uma loja.' using errcode = 'P0001';
  end if;
  for v_code in select jsonb_array_elements_text(p -> 'storeCodes') loop
    select id into v_store from stores where code = v_code;
    if v_store is null
       or v_store = any (v_new_ids)
       or v_store = v_order.destination_store_id
       or exists (select 1 from order_origin_stores where order_id = p_order and store_id = v_store) then
      raise exception 'Loja inválida para este pedido.' using errcode = 'P0001';
    end if;
    v_new_ids := v_new_ids || v_store;
  end loop;

  insert into store_charges (id, order_id, amount_brl, status)
  values (v_charge, p_order, 0, 'pending-payment');
  insert into store_charge_stores (charge_id, store_id) select v_charge, unnest(v_new_ids);

  v_added := _insert_pedido_groups(null, v_charge, p -> 'groups', v_new_ids);
  v_fee := 3 * array_length(v_new_ids, 1);

  -- Upgrade opcional de seguro: só se o novo total ultrapassar a cobertura já contratada.
  if coalesce((p ->> 'insuranceUpgrade')::boolean, false) then
    v_needed := _insurance_needed(v_order.items_total_brl + v_added);
    if v_needed > v_order.insurance_coverage_brl then
      v_new_extra := (v_needed - 100) / 100;
      v_upgrade := true;
      v_upgrade_cost := greatest(0, v_new_extra - v_order.insurance_extra_cost_brl);
    end if;
  end if;

  update store_charges set
    amount_brl = v_fee + v_upgrade_cost,
    items_total_added_brl = v_added,
    insurance_upgrade_coverage_brl = case when v_upgrade then v_needed end,
    insurance_upgrade_extra_cost_brl = case when v_upgrade then v_new_extra end
  where id = v_charge;

  return v_charge;
exception
  when invalid_text_representation then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
end;
$$;

-- SIMULAÇÃO de pagamento da cobrança (mesmo aviso de pay_order). Ao pagar, os
-- itens do rascunho passam para o pedido, as lojas entram nas origens e o
-- upgrade de seguro (se houver) é aplicado.
create or replace function public.pay_store_charge(p_charge uuid, p_method payment_method)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_charge store_charges%rowtype;
  v_order orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select sc.* into v_charge
    from store_charges sc join orders o on o.id = sc.order_id
    where sc.id = p_charge and o.user_id = v_uid
    for update of sc;
  if not found then
    raise exception 'Cobrança não encontrada.' using errcode = 'P0001';
  end if;
  if v_charge.status <> 'pending-payment' then
    raise exception 'Essa cobrança já foi paga.' using errcode = 'P0001';
  end if;

  select * into v_order from orders where id = v_charge.order_id for update;
  if v_order.status = 'completed' then
    raise exception 'Este pedido não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  update pedido_groups set order_id = v_charge.order_id, store_charge_id = null
    where store_charge_id = p_charge;
  insert into order_origin_stores (order_id, store_id)
    select v_charge.order_id, store_id from store_charge_stores where charge_id = p_charge
    on conflict do nothing;

  update orders set
    items_total_brl = items_total_brl + v_charge.items_total_added_brl,
    insurance_opted_in = insurance_opted_in or v_charge.insurance_upgrade_coverage_brl is not null,
    insurance_coverage_brl = coalesce(v_charge.insurance_upgrade_coverage_brl, insurance_coverage_brl),
    insurance_extra_cost_brl = coalesce(v_charge.insurance_upgrade_extra_cost_brl, insurance_extra_cost_brl)
  where id = v_charge.order_id;

  update store_charges set status = 'paid', paid_at = now(), payment_method = p_method
    where id = p_charge;
end;
$$;

create or replace function public.create_support_ticket(p_order uuid, p_subject text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from orders where id = p_order and user_id = v_uid) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_message, ''))) not between 1 and 5000 then
    raise exception 'Confira o assunto e a mensagem.' using errcode = 'P0001';
  end if;

  insert into support_tickets (order_id, subject, message)
  values (p_order, btrim(p_subject), btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Administração (só service_role: painel admin / servidor, nunca navegador)
-- ---------------------------------------------------------------------------
create or replace function public.advance_delivery_stage(p_order uuid)
returns delivery_stage
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_next delivery_stage;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'active' then
    raise exception 'Só pedidos ativos avançam de etapa.' using errcode = 'P0001';
  end if;
  v_next := case v_order.delivery_stage
    when 'aguardando-coleta' then 'em-transporte'::delivery_stage
    when 'em-transporte' then 'disponivel-para-retirada'::delivery_stage
    else null end;
  if v_next is null then
    raise exception 'O pedido já está na última etapa.' using errcode = 'P0001';
  end if;
  update orders set delivery_stage = v_next where id = p_order;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões de execução (o Supabase concede tudo por padrão: revogamos e
--    liberamos só o necessário)
-- ---------------------------------------------------------------------------
revoke all on function
  _json_num(jsonb, text, numeric, numeric, boolean),
  _insert_pedido_groups(uuid, uuid, jsonb, uuid[]),
  _insurance_needed(numeric),
  create_order(jsonb),
  pay_order(uuid, payment_method),
  complete_order(uuid),
  add_groups_to_order(uuid, jsonb),
  add_store_charge(uuid, jsonb),
  pay_store_charge(uuid, payment_method),
  create_support_ticket(uuid, text, text),
  advance_delivery_stage(uuid)
from public, anon, authenticated;

grant execute on function
  create_order(jsonb),
  pay_order(uuid, payment_method),
  complete_order(uuid),
  add_groups_to_order(uuid, jsonb),
  add_store_charge(uuid, jsonb),
  pay_store_charge(uuid, payment_method),
  create_support_ticket(uuid, text, text)
to authenticated;

grant execute on function advance_delivery_stage(uuid) to service_role;
