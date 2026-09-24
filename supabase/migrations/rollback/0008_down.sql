-- Desfaz 0008_admin_panel.sql. Só rode se precisar voltar atrás.
--
-- NÃO desfaz 0007_order_status_cancelled.sql: o Postgres não permite remover
-- um valor de enum (só recriar o tipo do zero, recriando todas as colunas
-- que o usam) — o valor 'cancelled' fica no enum `order_status` mesmo depois
-- deste rollback. Isso é inofensivo para o código anterior, que nunca grava
-- esse valor.

revoke execute on function advance_delivery_stage(uuid) from authenticated;

drop function if exists public.admin_remove_admin(uuid);
drop function if exists public.admin_add_admin(text);
drop function if exists public.admin_set_ticket_resolved(uuid, boolean);
drop function if exists public.admin_set_suggestion_contacted(uuid, boolean);
drop function if exists public.admin_set_lead_contacted(uuid, boolean);
drop function if exists public.admin_upsert_coupon(text, jsonb);
drop function if exists public.admin_upsert_comparison_value(uuid, text, jsonb);
drop function if exists public.admin_delete_comparison_row(uuid);
drop function if exists public.admin_upsert_comparison_row(uuid, jsonb);
drop function if exists public.admin_delete_comparison_carrier(text);
drop function if exists public.admin_upsert_comparison_carrier(text, jsonb);
drop function if exists public.admin_update_correios_rate(numeric);
drop function if exists public.admin_delete_freight_route(uuid);
drop function if exists public.admin_upsert_freight_route(uuid, jsonb);
drop function if exists public.admin_delete_store(uuid);
drop function if exists public.admin_upsert_store(uuid, jsonb);
drop function if exists public.admin_complete_order(uuid);
drop function if exists public.admin_cancel_order(uuid, text);
drop function if exists public._require_admin();

-- advance_delivery_stage volta a ser só para service_role, sem checagem de
-- admin interna (comportamento original da Etapa 3).
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

drop policy if exists "admins read all profiles" on profiles;
revoke select on partner_leads, store_suggestions from authenticated;
drop policy if exists "admins read all store suggestions" on store_suggestions;
drop policy if exists "admins read all partner leads" on partner_leads;
drop policy if exists "admins read all support tickets" on support_tickets;
drop policy if exists "admins read all store charge stores" on store_charge_stores;
drop policy if exists "admins read all store charges" on store_charges;
drop policy if exists "admins read all pedido accessory items" on pedido_accessory_items;
drop policy if exists "admins read all pedido card items" on pedido_card_items;
drop policy if exists "admins read all pedido groups" on pedido_groups;
drop policy if exists "admins read all order quote competitors" on order_quote_competitors;
drop policy if exists "admins read all order origin stores" on order_origin_stores;
drop policy if exists "admins read all orders" on orders;

alter table orders drop constraint if exists orders_cancel_reason_length_check;
alter table orders drop column if exists cancel_reason;
alter table support_tickets drop column if exists resolved;

drop policy if exists "admins read admins" on admins;
drop table if exists admins;
drop function if exists public.is_admin();
