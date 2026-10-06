-- Preços configuráveis pelo admin (frete T1 e seguro adicional).
--
-- Antes os valores estavam fixos no código das funções (R$12 + R$3 por loja,
-- R$3 por loja nova em pedido aberto, R$1 a cada R$100 de cobertura extra).
-- Agora ficam numa tabela de linha única, lida por create_order e
-- add_store_charge. Esta migração cria a tabela COM OS VALORES ATUAIS, então
-- nada muda até alguém editar na aba "Preços" do admin. Pedidos já criados não
-- são afetados (cada pedido grava os próprios valores).

create table pricing_settings (
  id smallint primary key default 1 check (id = 1),
  base_brl numeric(10,2) not null check (base_brl between 0 and 10000),
  extra_store_brl numeric(10,2) not null check (extra_store_brl between 0 and 10000),
  added_store_brl numeric(10,2) not null check (added_store_brl between 0 and 10000),
  insurance_per_100_brl numeric(10,2) not null check (insurance_per_100_brl between 0 and 10000),
  updated_at timestamptz not null default now()
);

insert into pricing_settings (id, base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl)
values (1, 12, 3, 3, 1);

-- Leitura pública (o site mostra a prévia da cotação, como o resto do
-- catálogo); escrita só pela função de admin abaixo.
alter table pricing_settings enable row level security;
create policy "pricing settings are publicly readable" on pricing_settings for select using (true);
revoke insert, update, delete, truncate on pricing_settings from anon, authenticated;

create or replace function public.admin_update_pricing(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  perform _require_admin();
  foreach k in array array['baseBRL', 'extraStoreBRL', 'addedStoreBRL', 'insurancePer100BRL'] loop
    if jsonb_typeof(p -> k) is distinct from 'number'
       or (p ->> k)::numeric < 0 or (p ->> k)::numeric > 10000 then
      raise exception 'Confira os valores: use números entre R$ 0 e R$ 10.000.' using errcode = 'P0001';
    end if;
  end loop;
  update pricing_settings set
    base_brl = round((p ->> 'baseBRL')::numeric, 2),
    extra_store_brl = round((p ->> 'extraStoreBRL')::numeric, 2),
    added_store_brl = round((p ->> 'addedStoreBRL')::numeric, 2),
    insurance_per_100_brl = round((p ->> 'insurancePer100BRL')::numeric, 2),
    updated_at = now()
  where id = 1;
end;
$$;

revoke all on function admin_update_pricing(jsonb) from public, anon, authenticated;
grant execute on function admin_update_pricing(jsonb) to authenticated;

-- As duas funções abaixo são as da 0005 com os números fixos trocados pela
-- leitura de pricing_settings (`create or replace` mantém os grants).

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
  v_pricing pricing_settings%rowtype;
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

  -- Frete da T1: valor da 1ª loja + valor por loja de coleta além da primeira,
  -- configurados pelo admin em pricing_settings (mesma conta de freight-simulation.ts).
  select * into v_pricing from pricing_settings where id = 1;
  v_price := v_pricing.base_brl + (v_origin_count - 1) * v_pricing.extra_store_brl;

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
    v_extra := (v_needed - 100) / 100 * v_pricing.insurance_per_100_brl;
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
  v_pricing pricing_settings%rowtype;
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
  select * into v_pricing from pricing_settings where id = 1;
  v_fee := v_pricing.added_store_brl * array_length(v_new_ids, 1);

  -- Upgrade opcional de seguro: só se o novo total ultrapassar a cobertura já contratada.
  if coalesce((p ->> 'insuranceUpgrade')::boolean, false) then
    v_needed := _insurance_needed(v_order.items_total_brl + v_added);
    if v_needed > v_order.insurance_coverage_brl then
      v_new_extra := (v_needed - 100) / 100 * v_pricing.insurance_per_100_brl;
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
