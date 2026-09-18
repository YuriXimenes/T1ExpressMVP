-- Etapa 2 (conta real): cria o perfil automaticamente quando um usuário se
-- cadastra no Supabase Auth, e adiciona os índices que faltavam nas FKs.
-- Puramente aditivo.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create index if not exists custom_preferred_stores_profile_id_idx on custom_preferred_stores (profile_id);
create index if not exists profile_preferred_stores_store_id_idx on profile_preferred_stores (store_id);
create index if not exists orders_user_id_idx on orders (user_id);
create index if not exists orders_destination_store_id_idx on orders (destination_store_id);
create index if not exists order_origin_stores_store_id_idx on order_origin_stores (store_id);
create index if not exists order_quote_competitors_order_id_idx on order_quote_competitors (order_id);
create index if not exists pedido_groups_order_id_idx on pedido_groups (order_id);
create index if not exists pedido_groups_store_charge_id_idx on pedido_groups (store_charge_id);
create index if not exists pedido_groups_store_id_idx on pedido_groups (store_id);
create index if not exists pedido_card_items_group_id_idx on pedido_card_items (group_id);
create index if not exists pedido_accessory_items_group_id_idx on pedido_accessory_items (group_id);
create index if not exists store_charges_order_id_idx on store_charges (order_id);
create index if not exists store_charge_stores_store_id_idx on store_charge_stores (store_id);
create index if not exists support_tickets_order_id_idx on support_tickets (order_id);
create index if not exists freight_routes_destination_store_id_idx on freight_routes (destination_store_id);
