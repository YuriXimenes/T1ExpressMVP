-- Desfaz 0016_staff_access.sql: volta ao "quem está em admins faz tudo".
-- APAGA perfis, equipe, regras de remuneração e convites. Todos os usuários
-- do admin (inclusive inativos) voltam a ter acesso total.

-- Funções novas
drop function if exists public.admin_set_team_pay_rules(uuid, jsonb);
drop function if exists public.admin_upsert_team_member(uuid, jsonb);
drop function if exists public.accept_staff_invite(text);
drop function if exists public.invite_lookup(text);
drop function if exists public.admin_revoke_invite(text);
drop function if exists public.admin_create_invite(uuid, text);
drop function if exists public.admin_delete_role(uuid);
drop function if exists public.admin_set_role_permissions(uuid, jsonb);
drop function if exists public.admin_upsert_role(uuid, text, text);
drop function if exists public.admin_update_staff(uuid, uuid, text, text);
drop function if exists public.admin_list_staff();
drop function if exists public.my_staff_access();

-- Leituras: volta a is_admin()
drop policy if exists "staff read all orders" on orders;
create policy "admins read all orders" on orders for select using (is_admin());
drop policy if exists "staff read all order origin stores" on order_origin_stores;
create policy "admins read all order origin stores" on order_origin_stores for select using (is_admin());
drop policy if exists "staff read all store charges" on store_charges;
create policy "admins read all store charges" on store_charges for select using (is_admin());
drop policy if exists "staff read all support tickets" on support_tickets;
create policy "admins read all support tickets" on support_tickets for select using (is_admin());
drop policy if exists "staff read all item checks" on order_item_checks;
create policy "admins read all item checks" on order_item_checks for select using (is_admin());
drop policy if exists "staff read all order quote competitors" on order_quote_competitors;
create policy "admins read all order quote competitors" on order_quote_competitors for select using (is_admin());
drop policy if exists "staff read all pedido groups" on pedido_groups;
create policy "admins read all pedido groups" on pedido_groups for select using (is_admin());
drop policy if exists "staff read all pedido card items" on pedido_card_items;
create policy "admins read all pedido card items" on pedido_card_items for select using (is_admin());
drop policy if exists "staff read all pedido accessory items" on pedido_accessory_items;
create policy "admins read all pedido accessory items" on pedido_accessory_items for select using (is_admin());
drop policy if exists "staff read all store charge stores" on store_charge_stores;
create policy "admins read all store charge stores" on store_charge_stores for select using (is_admin());
drop policy if exists "staff read all order events" on order_events;
create policy "admins read all order events" on order_events for select using (is_admin());
drop policy if exists "staff read all order photos" on order_photos;
create policy "admins read all order photos" on order_photos for select using (is_admin());
drop policy if exists "staff read all custody events" on custody_events;
create policy "admins read all custody events" on custody_events for select using (is_admin());
drop policy if exists "staff read all order pickups" on order_pickups;
create policy "admins read all order pickups" on order_pickups for select using (is_admin());
drop policy if exists "staff read all partner leads" on partner_leads;
create policy "admins read all partner leads" on partner_leads for select using (is_admin());
drop policy if exists "staff read all store suggestions" on store_suggestions;
create policy "admins read all store suggestions" on store_suggestions for select using (is_admin());
drop policy if exists "staff read all survey responses" on survey_responses;
create policy "admins read all survey responses" on survey_responses for select using (is_admin());
drop policy if exists "staff read all preferred store links" on profile_preferred_stores;
create policy "admins read all preferred store links" on profile_preferred_stores for select using (public.is_admin());
drop policy if exists "staff read all custom preferred stores" on custom_preferred_stores;
create policy "admins read all custom preferred stores" on custom_preferred_stores for select using (public.is_admin());
drop policy if exists "staff read own access" on admins;
drop policy if exists "staff read all admins" on admins;
create policy "admins read admins" on admins for select using (is_admin());

drop policy if exists "staff upload store logos" on storage.objects;
drop policy if exists "staff update store logos" on storage.objects;
drop policy if exists "staff delete store logos" on storage.objects;
create policy "admins upload store logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'store-logos' and public.is_admin());
create policy "admins update store logos" on storage.objects
  for update to authenticated using (bucket_id = 'store-logos' and public.is_admin());
create policy "admins delete store logos" on storage.objects
  for delete to authenticated using (bucket_id = 'store-logos' and public.is_admin());
drop policy if exists "staff upload order photos" on storage.objects;
drop policy if exists "staff delete order photos" on storage.objects;
drop policy if exists "staff and owners read order photos" on storage.objects;
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

-- Funções antigas no formato da 0008
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

drop function if exists public.admin_add_staff(text, uuid, text);
drop function if exists public._check_full_admin_left();
drop function if exists public._require_perm(text, text);
drop table if exists admin_function_perms;
drop function if exists public.is_full_admin();
drop function if exists public.has_any_perm(text[], text);
drop function if exists public.has_perm(text, text);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

drop table if exists staff_invites;
drop table if exists team_pay_rules;
drop table if exists team_members;
alter table admins drop column if exists added_by;
alter table admins drop column if exists job_title;
alter table admins drop column if exists status;
alter table admins drop column if exists role_id;
drop table if exists staff_role_permissions;
drop table if exists staff_roles;
drop function if exists public._staff_areas();
