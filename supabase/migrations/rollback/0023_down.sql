-- Desfaz a 0023_pricing_coupons_credit.sql. O preço em vigor agora volta a ser a
-- linha única de pricing_settings; regras de cupom e extrato de crédito são apagados.

-- 1. Preços: volta a tabela de linha única com o preço em vigor.
create table _pricing_keep as
  select base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl from pricing_current;
drop view pricing_settings;
drop view pricing_current;
create table pricing_settings (
  id smallint primary key default 1 check (id = 1),
  base_brl numeric(10,2) not null check (base_brl between 0 and 10000),
  extra_store_brl numeric(10,2) not null check (extra_store_brl between 0 and 10000),
  added_store_brl numeric(10,2) not null check (added_store_brl between 0 and 10000),
  insurance_per_100_brl numeric(10,2) not null check (insurance_per_100_brl between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into pricing_settings (id, base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl)
select 1, base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl from _pricing_keep;
insert into pricing_settings (id, base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl)
select 1, 12, 3, 3, 1 where not exists (select 1 from pricing_settings);
drop table _pricing_keep;
alter table pricing_settings enable row level security;
create policy "pricing settings are publicly readable" on pricing_settings for select using (true);
revoke insert, update, delete, truncate on pricing_settings from anon, authenticated;

-- 2. Funções de antes (0008, 0010 e 0022).
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

create or replace function public.admin_upsert_coupon(p_code text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(p_code));
  v_type coupon_type;
  v_value numeric;
begin
  perform _require_admin();
  if v_code = '' or char_length(v_code) > 30 or coalesce(p ->> 'label', '') = '' or char_length(p ->> 'label') > 200 then
    raise exception 'Confira o código e o rótulo do cupom.' using errcode = 'P0001';
  end if;
  v_type := (p ->> 'type')::coupon_type;
  v_value := (p ->> 'value')::numeric;
  if v_value is null or v_value <= 0 or (v_type = 'percent' and v_value > 100) then
    raise exception 'Confira o valor do cupom.' using errcode = 'P0001';
  end if;

  insert into coupons (code, type, value, label, active)
  values (v_code, v_type, v_value, btrim(p ->> 'label'), coalesce((p ->> 'active')::boolean, true))
  on conflict (code) do update set
    type = excluded.type, value = excluded.value, label = excluded.label, active = excluded.active;
exception
  when invalid_text_representation then
    raise exception 'Confira o tipo e o valor do cupom.' using errcode = 'P0001';
end;
$$;

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

revoke all on function _finance_month(date), _occ_resolution_finance() from public, anon, authenticated;

drop function if exists admin_save_pricing(jsonb);
drop function if exists admin_delete_pricing_version(uuid);
drop function if exists _pricing_at(timestamptz);
drop table if exists pricing_versions;

-- 3. Crédito.
drop trigger if exists orders_credit_refund on orders;
drop function if exists _orders_credit_refund();
drop function if exists my_credit();
drop function if exists admin_user_credit(uuid);
drop function if exists admin_adjust_credit(uuid, numeric, text);
drop function if exists _credit_json(uuid);
drop function if exists _credit_lock(uuid);
drop function if exists _credit_balance(uuid);
drop table if exists customer_credits;
alter table orders drop column if exists credit_used_brl;

-- 4. Cupons.
drop function if exists check_coupon(text, int);
drop function if exists admin_coupons();
drop function if exists admin_coupon_orders(text);
drop function if exists _coupon_check(text, uuid, numeric, boolean);
drop policy if exists "public coupons are readable" on coupons;
create policy "coupons are publicly readable" on coupons for select using (true);
revoke select (code, type, value, label, active) on coupons from anon, authenticated;
grant select on coupons to anon, authenticated;
alter table coupons
  drop constraint if exists coupons_valid_range_check,
  drop column if exists valid_from,
  drop column if exists valid_until,
  drop column if exists max_uses,
  drop column if exists max_uses_per_user,
  drop column if exists min_order_brl,
  drop column if exists first_purchase_only,
  drop column if exists note,
  drop column if exists owner_user_id;
