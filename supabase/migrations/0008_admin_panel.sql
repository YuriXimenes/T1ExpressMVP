-- Etapa 5: painel administrativo. Precisa que 0007_order_status_cancelled.sql
-- já tenha sido aplicada e commitada antes desta (o valor 'cancelled' do enum
-- não pode ser usado na mesma transação em que foi criado).
--
-- Sem Route Handler e sem uso da SUPABASE_SECRET_KEY: o painel segue o mesmo
-- desenho das Etapas 3/4 — telas no navegador chamando funções
-- security definer, que conferem auth.uid() contra a tabela `admins` antes
-- de fazer qualquer coisa. Leitura de dados de outros usuários (pedidos,
-- leads, sugestões) é liberada por policies de RLS adicionais (paralelas às
-- que já existem), não por função. Ver supabase/migrations/rollback/0008_down.sql.

-- ---------------------------------------------------------------------------
-- 1. Tabela admins
-- ---------------------------------------------------------------------------
create table admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Checar "sou admin?" direto com uma subconsulta em `admins` dentro de uma
-- policy DA PRÓPRIA `admins` reaplica a RLS recursivamente (erro do Postgres:
-- "infinite recursion detected in policy"). O jeito correto é um helper
-- security definer: ele roda como dono da função e ignora RLS internamente,
-- então a subconsulta não reaplica a policy de novo. Usado aqui e em todas as
-- policies "admin lê tudo" abaixo, e por `_require_admin()`.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- Um admin enxerga a tabela inteira (serve tanto pro "sou admin?" da guarda
-- de acesso quanto pra tela de Administradores). Ninguém mais enxerga nada.
create policy "admins read admins" on admins for select using (is_admin());
revoke insert, update, delete on admins from anon, authenticated;
revoke select on admins from anon;

-- ---------------------------------------------------------------------------
-- 2. Chamados de suporte ganham um campo de controle interno
-- ---------------------------------------------------------------------------
alter table support_tickets add column resolved boolean not null default false;

-- Pedido cancelado guarda o motivo (opcional), preenchido pelo admin.
alter table orders add column cancel_reason text;
alter table orders add constraint orders_cancel_reason_length_check
  check (coalesce(char_length(cancel_reason), 0) <= 500);

-- A constraint de consistência de status (Etapa 3) não previa 'cancelled' —
-- sem isto, qualquer cancelamento seria rejeitado pelo próprio banco.
-- Um pedido pode ser cancelado a partir de pending-payment OU active, então
-- o branch de 'cancelled' não exige nada sobre paid_at/delivery_stage (fica
-- como estava no momento do cancelamento, o que é informação útil).
alter table orders drop constraint orders_status_consistency_check;
alter table orders add constraint orders_status_consistency_check check (
  (status = 'pending-payment' and paid_at is null and completed_at is null and delivery_stage is null)
  or (status = 'active' and paid_at is not null and completed_at is null and delivery_stage is not null)
  or (status = 'completed' and paid_at is not null and completed_at is not null)
  or (status = 'cancelled')
);

-- ---------------------------------------------------------------------------
-- 3. Admin lê tudo: policies adicionais (paralelas às que já existem) nas
--    tabelas de pedido e de formulários públicos. O catálogo já é público
--    para leitura, não precisa de nada novo.
-- ---------------------------------------------------------------------------
create policy "admins read all orders" on orders for select using (is_admin());
create policy "admins read all order origin stores" on order_origin_stores for select using (is_admin());
create policy "admins read all order quote competitors" on order_quote_competitors for select using (is_admin());
create policy "admins read all pedido groups" on pedido_groups for select using (is_admin());
create policy "admins read all pedido card items" on pedido_card_items for select using (is_admin());
create policy "admins read all pedido accessory items" on pedido_accessory_items for select using (is_admin());
create policy "admins read all store charges" on store_charges for select using (is_admin());
create policy "admins read all store charge stores" on store_charge_stores for select using (is_admin());
create policy "admins read all support tickets" on support_tickets for select using (is_admin());
create policy "admins read all partner leads" on partner_leads for select using (is_admin());
create policy "admins read all store suggestions" on store_suggestions for select using (is_admin());
grant select on partner_leads, store_suggestions to authenticated;

-- Telas de admin mostram nome/e-mail do cliente (pedidos) e dos próprios
-- administradores (tela Administradores) — sem isto, o join embutido do
-- PostgREST em `profiles` volta nulo para qualquer perfil que não seja o do
-- próprio admin (RLS de `profiles` só libera "auth.uid() = id").
create policy "admins read all profiles" on profiles for select using (is_admin());

-- ---------------------------------------------------------------------------
-- 4. Helper interno
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Pedidos: cancelar / concluir manualmente / avançar etapa (esta última
--    já existia da Etapa 3, só para service_role — passa a checar admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_order(p_order uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
begin
  perform _require_admin();
  select status into v_status from orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'Este pedido já está finalizado.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'O motivo é longo demais.' using errcode = 'P0001';
  end if;
  update orders set status = 'cancelled', cancel_reason = nullif(btrim(p_reason), '')
    where id = p_order;
end;
$$;

create or replace function public.admin_complete_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
begin
  perform _require_admin();
  select status into v_status from orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status <> 'active' then
    raise exception 'Só pedidos ativos podem ser concluídos.' using errcode = 'P0001';
  end if;
  update orders set status = 'completed', completed_at = now() where id = p_order;
end;
$$;

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
  perform _require_admin();
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
-- 6. Catálogo — lojas
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_store(p_store_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_next_num int;
begin
  perform _require_admin();
  if coalesce(p ->> 'name', '') = '' or coalesce(p ->> 'address', '') = ''
     or coalesce(p ->> 'city', '') = '' or char_length(coalesce(p ->> 'state', '')) <> 2 then
    raise exception 'Confira os dados da loja.' using errcode = 'P0001';
  end if;
  if char_length(p ->> 'name') > 200 or char_length(p ->> 'address') > 300
     or coalesce(char_length(p ->> 'neighborhood'), 0) > 120 or char_length(p ->> 'city') > 120
     or coalesce(char_length(p ->> 'logoPath'), 0) > 300 then
    raise exception 'Confira os dados da loja — algum campo passou do limite de tamanho.' using errcode = 'P0001';
  end if;

  if p_store_id is null then
    select coalesce(max(substring(code from '^fs-([0-9]+)$')::int), 0) + 1 into v_next_num from stores;
    v_code := 'fs-' || lpad(v_next_num::text, 2, '0');
    insert into stores (code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point, pickup_sort_order)
    values (
      v_code, btrim(p ->> 'name'), btrim(p ->> 'address'), nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      btrim(p ->> 'city'), upper(btrim(p ->> 'state')),
      nullif(p ->> 'lat', '')::double precision, nullif(p ->> 'lng', '')::double precision,
      nullif(btrim(coalesce(p ->> 'logoPath', '')), ''), coalesce((p ->> 'logoOnDark')::boolean, false),
      coalesce((p ->> 'isPickupPoint')::boolean, false), nullif(p ->> 'pickupSortOrder', '')::int
    )
    returning id into v_id;
  else
    update stores set
      name = btrim(p ->> 'name'), address = btrim(p ->> 'address'),
      neighborhood = nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      city = btrim(p ->> 'city'), state = upper(btrim(p ->> 'state')),
      lat = nullif(p ->> 'lat', '')::double precision, lng = nullif(p ->> 'lng', '')::double precision,
      logo_path = nullif(btrim(coalesce(p ->> 'logoPath', '')), ''),
      logo_on_dark = coalesce((p ->> 'logoOnDark')::boolean, false),
      is_pickup_point = coalesce((p ->> 'isPickupPoint')::boolean, false),
      pickup_sort_order = nullif(p ->> 'pickupSortOrder', '')::int
    where id = p_store_id
    returning id into v_id;
    if not found then
      raise exception 'Loja não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation then
    raise exception 'Confira os números informados (latitude, longitude, ordem).' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_delete_store(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  delete from stores where id = p_store_id;
  if not found then
    raise exception 'Loja não encontrada.' using errcode = 'P0001';
  end if;
exception
  when foreign_key_violation then
    raise exception 'Essa loja está em uso (rotas ou pedidos) e não pode ser removida.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Catálogo — rotas de frete
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_freight_route(p_route_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_origin uuid := (p ->> 'originStoreId')::uuid;
  v_dest uuid := (p ->> 'destinationStoreId')::uuid;
  v_loggi numeric;
  v_uber numeric;
begin
  perform _require_admin();
  if v_origin is null or v_dest is null or v_origin = v_dest then
    raise exception 'Selecione duas lojas diferentes.' using errcode = 'P0001';
  end if;
  v_loggi := (p ->> 'loggiBrl')::numeric;
  v_uber := nullif(p ->> 'uberBrl', '')::numeric;
  if v_loggi is null or v_loggi < 0 or (v_uber is not null and v_uber < 0) then
    raise exception 'Confira os preços informados.' using errcode = 'P0001';
  end if;

  if p_route_id is null then
    insert into freight_routes (origin_store_id, destination_store_id, loggi_brl, uber_brl)
    values (v_origin, v_dest, v_loggi, v_uber)
    returning id into v_id;
  else
    update freight_routes set
      origin_store_id = v_origin, destination_store_id = v_dest, loggi_brl = v_loggi, uber_brl = v_uber
    where id = p_route_id
    returning id into v_id;
    if not found then
      raise exception 'Rota não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation then
    raise exception 'Confira as lojas e os preços informados.' using errcode = 'P0001';
  when unique_violation then
    raise exception 'Já existe uma rota para essas duas lojas.' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'Loja inválida.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_delete_freight_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  delete from freight_routes where id = p_route_id;
  if not found then
    raise exception 'Rota não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Catálogo — Correios (tarifa única)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_correios_rate(p_flat_rate_brl numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  if p_flat_rate_brl is null or p_flat_rate_brl < 0 then
    raise exception 'Confira o valor informado.' using errcode = 'P0001';
  end if;
  update carrier_flat_rates set flat_rate_brl = p_flat_rate_brl where carrier = 'correios';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Catálogo — comparativo da home
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_comparison_carrier(p_carrier_id text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := lower(btrim(p_carrier_id));
begin
  perform _require_admin();
  if v_id !~ '^[a-z0-9-]{1,50}$' or coalesce(p ->> 'name', '') = '' or char_length(p ->> 'name') > 100 then
    raise exception 'Confira o identificador e o nome da operadora.' using errcode = 'P0001';
  end if;
  insert into comparison_carriers (id, name, is_highlighted, sort_order)
  values (v_id, btrim(p ->> 'name'), coalesce((p ->> 'isHighlighted')::boolean, false), coalesce((p ->> 'sortOrder')::int, 0))
  on conflict (id) do update set
    name = excluded.name, is_highlighted = excluded.is_highlighted, sort_order = excluded.sort_order;
exception
  when invalid_text_representation then
    raise exception 'Confira a ordem informada.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_delete_comparison_carrier(p_carrier_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  delete from comparison_carriers where id = p_carrier_id;
  if not found then
    raise exception 'Operadora não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_upsert_comparison_row(p_row_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform _require_admin();
  if coalesce(p ->> 'label', '') = '' or char_length(p ->> 'label') > 200 then
    raise exception 'Confira o texto da linha.' using errcode = 'P0001';
  end if;
  if p_row_id is null then
    insert into comparison_rows (label, sort_order) values (btrim(p ->> 'label'), coalesce((p ->> 'sortOrder')::int, 0))
    returning id into v_id;
  else
    update comparison_rows set label = btrim(p ->> 'label'), sort_order = coalesce((p ->> 'sortOrder')::int, 0)
      where id = p_row_id returning id into v_id;
    if not found then
      raise exception 'Linha não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation then
    raise exception 'Confira a ordem informada.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_delete_comparison_row(p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  delete from comparison_rows where id = p_row_id;
  if not found then
    raise exception 'Linha não encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_upsert_comparison_value(p_row_id uuid, p_carrier_id text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  if coalesce(p ->> 'text', '') = '' or char_length(p ->> 'text') > 200
     or coalesce(char_length(p ->> 'detail'), 0) > 1000 then
    raise exception 'Confira o texto da célula.' using errcode = 'P0001';
  end if;
  insert into comparison_values (row_id, carrier_id, status, text, detail)
  values (p_row_id, p_carrier_id, nullif(p ->> 'status', '')::comparison_status, btrim(p ->> 'text'), nullif(btrim(coalesce(p ->> 'detail', '')), ''))
  on conflict (row_id, carrier_id) do update set
    status = excluded.status, text = excluded.text, detail = excluded.detail;
exception
  when invalid_text_representation then
    raise exception 'Status inválido.' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'Linha ou operadora inválida.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Catálogo — cupons
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 11. Formulários públicos e chamados: marcar como tratado
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_lead_contacted(p_lead_id uuid, p_contacted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  update partner_leads set contacted = p_contacted where id = p_lead_id;
  if not found then
    raise exception 'Registro não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_set_suggestion_contacted(p_suggestion_id uuid, p_contacted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  update store_suggestions set contacted = p_contacted where id = p_suggestion_id;
  if not found then
    raise exception 'Registro não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_set_ticket_resolved(p_ticket_id uuid, p_resolved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  update support_tickets set resolved = p_resolved where id = p_ticket_id;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Administradores
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
begin
  perform _require_admin();
  select id into v_user_id from profiles where lower(email) = v_email;
  if v_user_id is null then
    raise exception 'Não encontramos uma conta com esse e-mail.' using errcode = 'P0001';
  end if;
  if exists (select 1 from admins where user_id = v_user_id) then
    raise exception 'Esse e-mail já é administrador.' using errcode = 'P0001';
  end if;
  insert into admins (user_id) values (v_user_id);
  return v_user_id;
end;
$$;

create or replace function public.admin_remove_admin(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  if p_target_user_id = auth.uid() then
    raise exception 'Você não pode remover seu próprio acesso.' using errcode = 'P0001';
  end if;
  if (select count(*) from admins) <= 1 then
    raise exception 'Não é possível remover o último administrador.' using errcode = 'P0001';
  end if;
  delete from admins where user_id = p_target_user_id;
  if not found then
    raise exception 'Administrador não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _require_admin(),
  admin_cancel_order(uuid, text),
  admin_complete_order(uuid),
  admin_upsert_store(uuid, jsonb),
  admin_delete_store(uuid),
  admin_upsert_freight_route(uuid, jsonb),
  admin_delete_freight_route(uuid),
  admin_update_correios_rate(numeric),
  admin_upsert_comparison_carrier(text, jsonb),
  admin_delete_comparison_carrier(text),
  admin_upsert_comparison_row(uuid, jsonb),
  admin_delete_comparison_row(uuid),
  admin_upsert_comparison_value(uuid, text, jsonb),
  admin_upsert_coupon(text, jsonb),
  admin_set_lead_contacted(uuid, boolean),
  admin_set_suggestion_contacted(uuid, boolean),
  admin_set_ticket_resolved(uuid, boolean),
  admin_add_admin(text),
  admin_remove_admin(uuid)
from public, anon, authenticated;

grant execute on function
  admin_cancel_order(uuid, text),
  admin_complete_order(uuid),
  admin_upsert_store(uuid, jsonb),
  admin_delete_store(uuid),
  admin_upsert_freight_route(uuid, jsonb),
  admin_delete_freight_route(uuid),
  admin_update_correios_rate(numeric),
  admin_upsert_comparison_carrier(text, jsonb),
  admin_delete_comparison_carrier(text),
  admin_upsert_comparison_row(uuid, jsonb),
  admin_delete_comparison_row(uuid),
  admin_upsert_comparison_value(uuid, text, jsonb),
  admin_upsert_coupon(text, jsonb),
  admin_set_lead_contacted(uuid, boolean),
  admin_set_suggestion_contacted(uuid, boolean),
  admin_set_ticket_resolved(uuid, boolean),
  admin_add_admin(text),
  admin_remove_admin(uuid)
to authenticated;

-- advance_delivery_stage passa a ser chamável por qualquer autenticado (a
-- checagem de admin agora está dentro da função); mantém service_role também.
grant execute on function advance_delivery_stage(uuid) to authenticated, service_role;
