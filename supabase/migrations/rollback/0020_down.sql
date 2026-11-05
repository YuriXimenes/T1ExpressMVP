-- Desfaz 0020_partners.sql. APAGA onboardings, documentos (registro), acessos
-- de loja, regras de remuneração e pagamentos registrados. Lojas criadas pela
-- aprovação continuam no cadastro. Arquivos do bucket partner-docs não são
-- apagados por SQL (o bucket fica).
drop policy if exists "partner docs upload" on storage.objects;
drop policy if exists "partner docs read" on storage.objects;
drop policy if exists "partner docs delete own draft" on storage.objects;

create or replace function public.pickup_lookup(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_driver_can boolean := false;
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
  if auth.uid() is not null and _my_driver_id() is not null and r.status = 'active'
     and r.delivery_stage = 'em-transporte-retirada' then
    v_driver_can := exists (
      select 1 from route_stop_orders so
      join route_stops s on s.id = so.stop_id
      join routes ro on ro.id = s.route_id
      join trips t on t.id = ro.trip_id
      where so.order_id = r.oid and so.result is null and ro.kind = 'entrega'
        and t.driver_id = _my_driver_id() and t.status = 'em_andamento');
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
    'attemptsLeft', 5 - r.failed_attempts,
    'driverCanDeliver', v_driver_can
  );
end;
$$;

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

drop function if exists public._can_read_partner_path(text, text);
drop function if exists public._can_upload_onboarding_path(text);
drop function if exists public._can_confirm_pickup(uuid);
drop function if exists public.accept_store_invite(text);
drop function if exists public.store_invite_preview(text);
drop function if exists public.store_set_member_active(text, uuid, boolean);
drop function if exists public.store_invite_member(text);
drop function if exists public.store_members_list(text);
drop function if exists public.store_occurrences(text);
drop function if exists public.store_finance(text);
drop function if exists public.store_pickups(text);
drop function if exists public.store_collections(text);
drop function if exists public.store_dashboard(text);
drop function if exists public.my_stores();
drop function if exists public.admin_partner_performance(date, date);
drop function if exists public.admin_set_store_member(text, uuid, boolean);
drop function if exists public.admin_store_invite(text, text);
drop function if exists public.admin_register_payout(text, date, numeric, date, text, text);
drop function if exists public.admin_set_store_pay_rules(text, jsonb);
drop function if exists public.admin_set_store_published(text, boolean);
drop function if exists public.admin_store_profile(text);
drop function if exists public._store_members_json(uuid);
drop function if exists public.onboarding_submit(text);
drop function if exists public.onboarding_remove_document(text, uuid);
drop function if exists public.onboarding_add_document(text, text, text, text, text);
drop function if exists public.onboarding_save(text, jsonb);
drop function if exists public.onboarding_by_token(text);
drop function if exists public._onboarding_of_token(text, boolean);
drop function if exists public.onboarding_preview(text);
drop function if exists public.admin_set_onboarding_status(uuid, text, text);
drop function if exists public.admin_review_document(uuid, text, text);
drop function if exists public.admin_renew_onboarding_link(uuid);
drop function if exists public.admin_onboarding(uuid);
drop function if exists public.admin_onboardings();
drop function if exists public.admin_start_onboarding(uuid);
drop function if exists public._onboarding_json(uuid, boolean);
drop function if exists public._store_finance(uuid);
drop function if exists public._store_statement(uuid, date);
drop function if exists public._month_start(date);
drop function if exists public._onboarding_missing(uuid);
drop function if exists public._onb_log(uuid, text, text, text);
drop function if exists public._store_member_id(text, boolean);
drop function if exists public._nth_business_day(date, int);
drop function if exists public._valid_cnpj(text);
drop function if exists public._valid_cpf(text);
drop function if exists public._new_token();

delete from occurrence_updates where author_kind = 'store';
delete from occurrence_attachments where author_kind = 'store';
alter table occurrence_updates drop constraint occurrence_updates_author_kind_check;
alter table occurrence_updates add constraint occurrence_updates_author_kind_check
  check (author_kind in ('admin', 'driver', 'customer', 'system'));
alter table occurrence_attachments drop constraint occurrence_attachments_author_kind_check;
alter table occurrence_attachments add constraint occurrence_attachments_author_kind_check
  check (author_kind in ('admin', 'driver', 'customer'));

drop table if exists store_payouts;
drop table if exists store_pay_rules;
drop table if exists store_invites;
drop table if exists store_members;
drop table if exists partner_onboarding_events;
drop table if exists partner_documents;
drop table if exists partner_onboardings;
drop table if exists store_partner_profiles;
alter table stores drop column if exists partner_kind;
alter table stores drop column if exists published;
