-- Desfaz 0005_orders_rpc.sql: remove as funções, as constraints novas e devolve
-- as policies "for all" e os grants originais das tabelas de pedido.
-- Só rode se precisar voltar atrás (o código antigo não usa nada disso).

drop function if exists public.advance_delivery_stage(uuid);
drop function if exists public.create_support_ticket(uuid, text, text);
drop function if exists public.pay_store_charge(uuid, payment_method);
drop function if exists public.add_store_charge(uuid, jsonb);
drop function if exists public.add_groups_to_order(uuid, jsonb);
drop function if exists public.complete_order(uuid);
drop function if exists public.pay_order(uuid, payment_method);
drop function if exists public.create_order(jsonb);
drop function if exists public._insurance_needed(numeric);
drop function if exists public._insert_pedido_groups(uuid, uuid, jsonb, uuid[]);
drop function if exists public._json_num(jsonb, text, numeric, numeric, boolean);

alter table support_tickets drop constraint if exists support_tickets_length_check;
alter table store_charges drop constraint if exists store_charges_amounts_check;
alter table orders drop constraint if exists orders_status_consistency_check;
alter table orders drop constraint if exists orders_amounts_check;
alter table pedido_accessory_items drop constraint if exists pedido_accessory_items_values_check;
alter table pedido_accessory_items drop column if exists sort_order;
alter table pedido_card_items drop column if exists sort_order;
alter table pedido_groups drop column if exists sort_order;
alter table pedido_card_items drop constraint if exists pedido_card_items_values_check;

drop policy if exists "users read own orders" on orders;
drop policy if exists "users read own order origin stores" on order_origin_stores;
drop policy if exists "users read own order quote competitors" on order_quote_competitors;
drop policy if exists "users read own store charges" on store_charges;
drop policy if exists "users read own pedido groups" on pedido_groups;
drop policy if exists "users read own pedido card items" on pedido_card_items;
drop policy if exists "users read own pedido accessory items" on pedido_accessory_items;
drop policy if exists "users read own store charge stores" on store_charge_stores;
drop policy if exists "users read own support tickets" on support_tickets;

create policy "users manage own orders" on orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own order origin stores" on order_origin_stores for all
  using (exists (select 1 from orders o where o.id = order_origin_stores.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = order_origin_stores.order_id and o.user_id = auth.uid()));

create policy "users manage own order quote competitors" on order_quote_competitors for all
  using (exists (select 1 from orders o where o.id = order_quote_competitors.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = order_quote_competitors.order_id and o.user_id = auth.uid()));

create policy "users manage own store charges" on store_charges for all
  using (exists (select 1 from orders o where o.id = store_charges.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = store_charges.order_id and o.user_id = auth.uid()));

create policy "users manage own pedido groups" on pedido_groups for all
  using (
    (order_id is not null and exists (select 1 from orders o where o.id = pedido_groups.order_id and o.user_id = auth.uid()))
    or
    (store_charge_id is not null and exists (
      select 1 from store_charges sc join orders o on o.id = sc.order_id
      where sc.id = pedido_groups.store_charge_id and o.user_id = auth.uid()
    ))
  )
  with check (
    (order_id is not null and exists (select 1 from orders o where o.id = pedido_groups.order_id and o.user_id = auth.uid()))
    or
    (store_charge_id is not null and exists (
      select 1 from store_charges sc join orders o on o.id = sc.order_id
      where sc.id = pedido_groups.store_charge_id and o.user_id = auth.uid()
    ))
  );

create policy "users manage own pedido card items" on pedido_card_items for all
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_card_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

create policy "users manage own pedido accessory items" on pedido_accessory_items for all
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_accessory_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

create policy "users manage own store charge stores" on store_charge_stores for all
  using (exists (
    select 1 from store_charges sc join orders o on o.id = sc.order_id
    where sc.id = store_charge_stores.charge_id and o.user_id = auth.uid()
  ));

create policy "users manage own support tickets" on support_tickets for all
  using (exists (select 1 from orders o where o.id = support_tickets.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = support_tickets.order_id and o.user_id = auth.uid()));

grant select, insert, update, delete on
  orders, order_origin_stores, order_quote_competitors, store_charges, store_charge_stores,
  pedido_groups, pedido_card_items, pedido_accessory_items, support_tickets
to authenticated;
grant select on
  orders, order_origin_stores, order_quote_competitors, store_charges, store_charge_stores,
  pedido_groups, pedido_card_items, pedido_accessory_items, support_tickets
to anon;
