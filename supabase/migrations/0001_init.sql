-- T1 Express — schema inicial
--
-- Cria toda a estrutura de banco para contas de usuário, pedidos, lojas e
-- dados de referência (rotas de frete, comparativo de mercado, cupons,
-- estados). Este script é puramente aditivo: nenhum código da aplicação
-- consome estas tabelas ainda (o app continua rodando 100% em cima de
-- localStorage/dados mock). Sem segredos neste arquivo — é só DDL.

-- ============================================================
-- Enums
-- ============================================================

create type order_status as enum ('pending-payment', 'active', 'completed');
create type delivery_stage as enum ('aguardando-coleta', 'em-transporte', 'disponivel-para-retirada');
create type payment_method as enum ('pix', 'credit-card');
create type coupon_type as enum ('percent', 'flat');
create type game_tag as enum ('magic', 'pokemon', 'yugioh', 'lorcana', 'fab', 'outro');
create type pedido_kind as enum ('cartas-avulsas', 'boosters', 'deck-box', 'acessorios');
create type price_mode as enum ('unit', 'total');
create type accessory_kind as enum ('sleeve', 'perfect-fit', 'playmat', 'fichario', 'case', 'outro');
create type store_charge_status as enum ('pending-payment', 'paid');
create type comparison_status as enum ('positive', 'negative', 'neutral');
create type carrier_code as enum ('uber', 'loggi', 'correios');

-- ============================================================
-- Dados de referência: lojas, rotas de frete, comparativo, cupons, estados
-- ============================================================

create table stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text not null,
  neighborhood text,
  city text not null,
  state text not null,
  lat double precision,
  lng double precision,
  logo_path text,
  logo_on_dark boolean not null default false,
  is_pickup_point boolean not null default false,
  created_at timestamptz not null default now()
);

create table freight_routes (
  id uuid primary key default gen_random_uuid(),
  origin_store_id uuid not null references stores(id),
  destination_store_id uuid not null references stores(id),
  loggi_brl numeric(10,2) not null,
  uber_brl numeric(10,2),
  created_at timestamptz not null default now(),
  unique (origin_store_id, destination_store_id)
);

create table carrier_flat_rates (
  carrier carrier_code primary key,
  flat_rate_brl numeric(10,2) not null
);

create table comparison_carriers (
  id text primary key,
  name text not null,
  is_highlighted boolean not null default false,
  sort_order int not null
);

create table comparison_rows (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null
);

create table comparison_values (
  row_id uuid not null references comparison_rows(id) on delete cascade,
  carrier_id text not null references comparison_carriers(id) on delete cascade,
  status comparison_status,
  text text not null,
  detail text,
  primary key (row_id, carrier_id)
);

create table coupons (
  code text primary key,
  type coupon_type not null,
  value numeric(10,2) not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table brazil_states (
  uf text primary key,
  name text not null
);

-- ============================================================
-- Contas de usuário (profiles estende auth.users do Supabase Auth)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  avatar_url text,
  street text,
  neighborhood text,
  city text,
  state text,
  zip text,
  complement text,
  games game_tag[] not null default '{}',
  other_games text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table custom_preferred_stores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);

create table profile_preferred_stores (
  profile_id uuid not null references profiles(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  primary key (profile_id, store_id)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

-- ============================================================
-- Pedidos
-- ============================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status order_status not null default 'pending-payment',
  paid_at timestamptz,
  completed_at timestamptz,
  delivery_stage delivery_stage,
  estimated_pickup_date timestamptz,
  destination_store_id uuid not null references stores(id),
  delivery_note text not null default '',
  items_total_brl numeric(10,2) not null default 0,
  insurance_opted_in boolean not null default false,
  insurance_coverage_brl numeric(10,2) not null default 100,
  insurance_extra_cost_brl numeric(10,2) not null default 0,
  coupon_code text references coupons(code),
  coupon_type coupon_type,
  coupon_value numeric(10,2),
  coupon_discount_brl numeric(10,2),
  freight_after_discount_brl numeric(10,2) not null,
  amount_due_brl numeric(10,2) not null,
  payment_method payment_method,
  quote_price_brl numeric(10,2) not null,
  quote_estimated_days_min int not null,
  quote_estimated_days_max int not null,
  quote_distance_label text,
  quote_cheapest_savings_brl numeric(10,2),
  created_at timestamptz not null default now()
);

create table order_origin_stores (
  order_id uuid not null references orders(id) on delete cascade,
  store_id uuid not null references stores(id),
  primary key (order_id, store_id)
);

create table order_quote_competitors (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  carrier carrier_code not null,
  label text not null,
  eta_label text not null,
  total_brl numeric(10,2) not null
);

create table store_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount_brl numeric(10,2) not null,
  status store_charge_status not null default 'pending-payment',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payment_method payment_method,
  items_total_added_brl numeric(10,2) not null default 0,
  insurance_upgrade_coverage_brl numeric(10,2),
  insurance_upgrade_extra_cost_brl numeric(10,2)
);

-- pedido_groups é reaproveitada tanto para os itens de um pedido quanto para
-- o rascunho de itens de uma store_charge (mesmo formato PedidoGroup[] no
-- TypeScript original) — evita duplicar 4 tabelas. Exatamente um dos dois
-- FKs (order_id, store_charge_id) deve estar preenchido.
create table pedido_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  store_charge_id uuid references store_charges(id) on delete cascade,
  store_id uuid not null references stores(id),
  kind pedido_kind not null,
  order_number text not null default '',
  created_at timestamptz not null default now(),
  constraint pedido_groups_owner_check check (num_nonnulls(order_id, store_charge_id) = 1)
);

create table pedido_card_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pedido_groups(id) on delete cascade,
  card_name text not null,
  game game_tag not null,
  other_game text,
  price numeric(10,2) not null,
  price_mode price_mode not null,
  quantity int not null
);

create table pedido_accessory_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pedido_groups(id) on delete cascade,
  accessory accessory_kind not null,
  other_accessory text,
  price numeric(10,2) not null,
  price_mode price_mode not null,
  quantity int not null
);

create table store_charge_stores (
  charge_id uuid not null references store_charges(id) on delete cascade,
  store_id uuid not null references stores(id),
  primary key (charge_id, store_id)
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Dados de referência: leitura pública, escrita só via service_role (que
-- ignora RLS por padrão no Supabase — nenhuma policy de escrita necessária).
alter table stores enable row level security;
create policy "stores are publicly readable" on stores for select using (true);

alter table freight_routes enable row level security;
create policy "freight_routes are publicly readable" on freight_routes for select using (true);

alter table carrier_flat_rates enable row level security;
create policy "carrier_flat_rates are publicly readable" on carrier_flat_rates for select using (true);

alter table comparison_carriers enable row level security;
create policy "comparison_carriers are publicly readable" on comparison_carriers for select using (true);

alter table comparison_rows enable row level security;
create policy "comparison_rows are publicly readable" on comparison_rows for select using (true);

alter table comparison_values enable row level security;
create policy "comparison_values are publicly readable" on comparison_values for select using (true);

alter table coupons enable row level security;
create policy "coupons are publicly readable" on coupons for select using (true);

alter table brazil_states enable row level security;
create policy "brazil_states are publicly readable" on brazil_states for select using (true);

-- Conta: cada usuário só enxerga/edita a própria linha.
alter table profiles enable row level security;
create policy "users select own profile" on profiles for select using (auth.uid() = id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);

alter table custom_preferred_stores enable row level security;
create policy "users manage own custom preferred stores" on custom_preferred_stores for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

alter table profile_preferred_stores enable row level security;
create policy "users manage own preferred store links" on profile_preferred_stores for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Pedidos: cada usuário só enxerga/edita os próprios pedidos e tudo que
-- pendura neles (join até orders.user_id).
alter table orders enable row level security;
create policy "users manage own orders" on orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table order_origin_stores enable row level security;
create policy "users manage own order origin stores" on order_origin_stores for all
  using (exists (select 1 from orders o where o.id = order_origin_stores.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = order_origin_stores.order_id and o.user_id = auth.uid()));

alter table order_quote_competitors enable row level security;
create policy "users manage own order quote competitors" on order_quote_competitors for all
  using (exists (select 1 from orders o where o.id = order_quote_competitors.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = order_quote_competitors.order_id and o.user_id = auth.uid()));

alter table store_charges enable row level security;
create policy "users manage own store charges" on store_charges for all
  using (exists (select 1 from orders o where o.id = store_charges.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = store_charges.order_id and o.user_id = auth.uid()));

alter table pedido_groups enable row level security;
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

alter table pedido_card_items enable row level security;
create policy "users manage own pedido card items" on pedido_card_items for all
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_card_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

alter table pedido_accessory_items enable row level security;
create policy "users manage own pedido accessory items" on pedido_accessory_items for all
  using (exists (
    select 1 from pedido_groups g
    left join orders o on o.id = g.order_id
    left join store_charges sc on sc.id = g.store_charge_id
    left join orders o2 on o2.id = sc.order_id
    where g.id = pedido_accessory_items.group_id
      and (o.user_id = auth.uid() or o2.user_id = auth.uid())
  ));

alter table store_charge_stores enable row level security;
create policy "users manage own store charge stores" on store_charge_stores for all
  using (exists (
    select 1 from store_charges sc join orders o on o.id = sc.order_id
    where sc.id = store_charge_stores.charge_id and o.user_id = auth.uid()
  ));

alter table support_tickets enable row level security;
create policy "users manage own support tickets" on support_tickets for all
  using (exists (select 1 from orders o where o.id = support_tickets.order_id and o.user_id = auth.uid()))
  with check (exists (select 1 from orders o where o.id = support_tickets.order_id and o.user_id = auth.uid()));

-- ============================================================
-- Storage: bucket de fotos de perfil
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly accessible" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "users can upload their own avatar" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can update their own avatar" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can delete their own avatar" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- Seed: as 11 lojas reais (freight-stores.ts + coleta-partners.ts)
-- ============================================================

insert into stores (code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point) values
('fs-01', 'Cards of Paradise', 'Av. Meriti, 908 - Vila da Penha, Rio de Janeiro - RJ, 21211-006', 'Vila da Penha', 'Rio de Janeiro', 'RJ', -22.8497073, -43.309694, '/logos/cards-of-paradise.png', true, true),
('fs-02', 'Bruno Pokecartas', 'Avenida Vicente de Carvalho, 909 - Vicente de Carvalho - Rio de Janeiro/RJ', 'Vicente de Carvalho', 'Rio de Janeiro', 'RJ', -22.8493217, -43.3112703, '/logos/bruno-pokecartas.jpeg', false, false),
('fs-03', 'Fagulhas Card', 'Rua Cardoso de Morais, 218 - Lj A Box 11 - Bonsucesso, Rio de Janeiro - RJ, 21032-000', 'Bonsucesso', 'Rio de Janeiro', 'RJ', -22.8589976, -43.2563647, '/logos/fagulhas-card.jpg', false, false),
('fs-04', 'Já Era Hora!', 'R. Manoel Vitorino, 887 - Lj C - Piedade, Rio de Janeiro - RJ, 20740-900', 'Piedade', 'Rio de Janeiro', 'RJ', -22.894047, -43.3052832, '/logos/ja-era-hora.jpg', false, false),
('fs-05', 'Magic Store Brasil', 'R. Teodoro da Silva, 240 - Vila Isabel, Rio de Janeiro - RJ, 20520-051', 'Vila Isabel', 'Rio de Janeiro', 'RJ', -22.917061, -43.242685, '/logos/magic-store-brasil.jpeg', false, true),
('fs-06', 'Bolsa do Infinito', 'Rua Conde de Bonfim, 685 - Lj D Galeria - Tijuca, Rio de Janeiro - RJ, 20520-052', 'Tijuca', 'Rio de Janeiro', 'RJ', -22.9322191, -43.2403431, '/logos/bolsa-do-infinito.jpg', true, false),
('fs-07', 'Beco Horizontal Card Games', 'Rua Engenheiro Ernani Cotrin, 15 - Lj G - Tijuca, Rio de Janeiro - RJ, 20510-260', 'Tijuca', 'Rio de Janeiro', 'RJ', -22.9292571, -43.2437567, '/logos/beco-horizontal.jpg', false, false),
('fs-08', 'Red', 'Av. Treze de Maio, 23 - sala 533 - Centro, Rio de Janeiro - RJ, 20031-902', 'Centro', 'Rio de Janeiro', 'RJ', -22.9092961, -43.177331, '/logos/red.jpg', false, false),
('fs-09', 'Collect & Play', 'Av. das Américas, 5001 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22631-004', 'Barra da Tijuca', 'Rio de Janeiro', 'RJ', -23.0007369, -43.3623951, '/logos/collect-play.jpg', false, true),
('fs-10', 'Kamusari Store', 'Av. das Américas, 5.777 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22793-080', 'Barra da Tijuca', 'Rio de Janeiro', 'RJ', -22.9990766, -43.3666914, '/logos/kamusari-store.jpg', false, false),
('fs-11', 'Konklave', 'Iguaçu Center - Av. Mal. Floriano Peixoto, 1480 - Lj 241 - Centro, Nova Iguaçu - RJ, 26220-06', 'Centro', 'Nova Iguaçu', 'RJ', -22.758498, -43.4546255, '/logos/konklave.jpg', false, true);

-- ============================================================
-- Seed: as 40 rotas reais de frete (freight-routes.ts) + tarifa fixa Correios
-- ============================================================

insert into carrier_flat_rates (carrier, flat_rate_brl) values ('correios', 13.25);

insert into freight_routes (origin_store_id, destination_store_id, loggi_brl, uber_brl)
select (select id from stores where code = r.origin), (select id from stores where code = r.dest), r.loggi, r.uber
from (values
  ('fs-02', 'fs-01', 14.90, 5.81),
  ('fs-03', 'fs-01', 28.67, 21.07),
  ('fs-04', 'fs-01', 28.78, 13.84),
  ('fs-05', 'fs-01', 38.94, 28.26),
  ('fs-06', 'fs-01', 38.46, 34.09),
  ('fs-07', 'fs-01', 38.78, 34.95),
  ('fs-08', 'fs-01', 48.88, 45.55),
  ('fs-09', 'fs-01', 57.09, 52.19),
  ('fs-10', 'fs-01', 57.09, 24.57),
  ('fs-11', 'fs-01', 57.09, 42.65),
  ('fs-01', 'fs-11', 47.57, 41.09),
  ('fs-02', 'fs-11', 51.49, 41.09),
  ('fs-03', 'fs-11', 61.92, 55.01),
  ('fs-04', 'fs-11', 58.44, 32.08),
  ('fs-05', 'fs-11', 82.86, 79.01),
  ('fs-06', 'fs-11', 77.23, 86.37),
  ('fs-07', 'fs-11', 77.54, 86.37),
  ('fs-08', 'fs-11', 84.01, 80.53),
  ('fs-09', 'fs-11', 81.08, 86.46),
  ('fs-10', 'fs-11', 82.00, 43.42),
  ('fs-01', 'fs-05', 42.48, 33.69),
  ('fs-02', 'fs-05', 43.58, 33.69),
  ('fs-03', 'fs-05', 26.71, 18.22),
  ('fs-04', 'fs-05', 31.35, 15.78),
  ('fs-06', 'fs-05', 14.90, 6.95),
  ('fs-07', 'fs-05', 14.90, 6.95),
  ('fs-08', 'fs-05', 21.80, 17.91),
  ('fs-09', 'fs-05', 55.57, 48.69),
  ('fs-10', 'fs-05', 61.10, 23.12),
  ('fs-11', 'fs-05', 78.40, 72.40),
  ('fs-01', 'fs-09', 55.76, 54.78),
  ('fs-02', 'fs-09', 56.87, 54.78),
  ('fs-03', 'fs-09', 55.55, 48.70),
  ('fs-04', 'fs-09', 40.84, 25.14),
  ('fs-05', 'fs-09', 60.92, 48.38),
  ('fs-06', 'fs-09', 54.72, 53.32),
  ('fs-07', 'fs-09', 55.28, 53.32),
  ('fs-08', 'fs-09', 66.55, 68.96),
  ('fs-10', 'fs-09', 14.90, 6.95),
  ('fs-11', 'fs-09', 81.59, 84.44)
) as r(origin, dest, loggi, uber);

-- ============================================================
-- Seed: comparativo de mercado (market-comparison.ts)
-- ============================================================

insert into comparison_carriers (id, name, is_highlighted, sort_order) values
('t1-express', 'T1 Express', true, 1),
('uber-flash', 'Uber Flash / Envios', false, 2),
('loggi', 'Loggi', false, 3),
('correios', 'Correios', false, 4);

insert into comparison_rows (label, sort_order) values
('Prazo médio', 1),
('Especializada em cards e colecionáveis', 2),
('Parceria com lojas TCG', 3),
('Centralização de pedidos de várias lojas', 4),
('Preço previsível', 5),
('Rastreamento em tempo real', 6);

insert into comparison_values (row_id, carrier_id, status, text, detail)
select (select id from comparison_rows where label = v.row_label), v.carrier_id, v.status::comparison_status, v.text, v.detail
from (values
  ('Prazo médio', 't1-express', null, '1 a 4 dias úteis', null),
  ('Prazo médio', 'uber-flash', null, 'Poucas horas (mesma cidade)', null),
  ('Prazo médio', 'loggi', null, '1 a 3 dias úteis (capitais)', null),
  ('Prazo médio', 'correios', null, '2 a 8 dias úteis', null),
  ('Especializada em cards e colecionáveis', 't1-express', 'positive', '1º do Brasil', null),
  ('Especializada em cards e colecionáveis', 'uber-flash', 'negative', 'Não', null),
  ('Especializada em cards e colecionáveis', 'loggi', 'negative', 'Não', null),
  ('Especializada em cards e colecionáveis', 'correios', 'negative', 'Não', null),
  ('Parceria com lojas TCG', 't1-express', 'positive', 'Sim', null),
  ('Parceria com lojas TCG', 'uber-flash', 'negative', 'Não', null),
  ('Parceria com lojas TCG', 'loggi', 'negative', 'Não', null),
  ('Parceria com lojas TCG', 'correios', 'negative', 'Não', null),
  ('Centralização de pedidos de várias lojas', 't1-express', 'positive', 'Sim', null),
  ('Centralização de pedidos de várias lojas', 'uber-flash', 'negative', 'Não', null),
  ('Centralização de pedidos de várias lojas', 'loggi', 'negative', 'Não', null),
  ('Centralização de pedidos de várias lojas', 'correios', 'negative', 'Não', null),
  ('Preço previsível', 't1-express', 'positive', 'Sim', 'R$ 12 + R$ 3 por loja adicional'),
  ('Preço previsível', 'uber-flash', 'negative', 'Não', 'Média de R$ 15 por loja'),
  ('Preço previsível', 'loggi', 'negative', 'Não', 'Média de R$ 15 por loja'),
  ('Preço previsível', 'correios', 'negative', 'Não', 'Média de R$ 12 por loja (via carta registrada)'),
  ('Rastreamento em tempo real', 't1-express', 'positive', 'Sim', null),
  ('Rastreamento em tempo real', 'uber-flash', 'positive', 'Sim', null),
  ('Rastreamento em tempo real', 'loggi', 'positive', 'Sim', null),
  ('Rastreamento em tempo real', 'correios', 'positive', 'Sim', null)
) as v(row_label, carrier_id, status, text, detail);

-- ============================================================
-- Seed: cupons e estados brasileiros
-- ============================================================

insert into coupons (code, type, value, label) values
('T1BEMVINDO10', 'percent', 10, '10% off no frete'),
('T1FRETE5', 'flat', 5, 'R$5,00 off no frete');

insert into brazil_states (uf, name) values
('AC', 'Acre'), ('AL', 'Alagoas'), ('AP', 'Amapá'), ('AM', 'Amazonas'),
('BA', 'Bahia'), ('CE', 'Ceará'), ('DF', 'Distrito Federal'), ('ES', 'Espírito Santo'),
('GO', 'Goiás'), ('MA', 'Maranhão'), ('MT', 'Mato Grosso'), ('MS', 'Mato Grosso do Sul'),
('MG', 'Minas Gerais'), ('PA', 'Pará'), ('PB', 'Paraíba'), ('PR', 'Paraná'),
('PE', 'Pernambuco'), ('PI', 'Piauí'), ('RJ', 'Rio de Janeiro'), ('RN', 'Rio Grande do Norte'),
('RS', 'Rio Grande do Sul'), ('RO', 'Rondônia'), ('RR', 'Roraima'), ('SC', 'Santa Catarina'),
('SP', 'São Paulo'), ('SE', 'Sergipe'), ('TO', 'Tocantins');
