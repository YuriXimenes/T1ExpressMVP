-- Backoffice, entrega 5: planejamento, rotas de coleta e de entrega, viagens,
-- custos e área do entregador. Precisa da 0014, 0015 e 0016.
-- Ver supabase/migrations/rollback/0017_down.sql.
--
-- Rota de coleta e rota de entrega são separadas; a Viagem junta as rotas de um
-- entregador num dia. O entregador é uma pessoa da Equipe (tipo entregador,
-- ativa, ligada a uma conta) e mexe só nas próprias viagens, por funções.
-- Km previsto: coordenadas × fator de ruas; real: odômetro. trip_positions fica
-- pronta para GPS contínuo no futuro.

-- ---------------------------------------------------------------------------
-- 1. Linha do tempo: autor "entregador" e tipos novos
-- ---------------------------------------------------------------------------
alter table order_events drop constraint order_events_actor_kind_check;
alter table order_events add constraint order_events_actor_kind_check
  check (actor_kind in ('customer', 'admin', 'store', 'driver', 'system'));
alter table order_events drop constraint order_events_kind_check;
alter table order_events add constraint order_events_kind_check check (kind in (
  'created', 'paid', 'stage_changed', 'completed', 'cancelled',
  'items_added', 'insurance_changed',
  'store_charge_created', 'store_charge_paid',
  'ticket_opened', 'ticket_resolved', 'ticket_reopened',
  'items_checked', 'custody',
  'route', 'stop_failed'
));

create or replace function public._order_event_actor(p_owner uuid, out actor_id uuid, out actor_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  actor_id := auth.uid();
  if current_setting('t1.actor', true) = 'store' then
    actor_id := null;
    actor_kind := 'store';
  elsif current_setting('t1.actor', true) = 'driver' then
    actor_kind := 'driver';
  elsif current_setting('t1.actor', true) = 'admin' then
    actor_kind := 'admin';
  elsif actor_id is null then
    actor_kind := 'system';
  elsif actor_id = p_owner then
    actor_kind := 'customer';
  elsif is_admin() then
    actor_kind := 'admin';
  else
    actor_kind := 'system';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cadastros
-- ---------------------------------------------------------------------------
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  plate text check (coalesce(char_length(plate), 0) <= 12),
  km_per_liter numeric(6,2) not null check (km_per_liter > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table fuel_prices (
  day date primary key,
  price_per_liter numeric(6,3) not null check (price_per_liter > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table ops_settings (
  id int primary key default 1 check (id = 1),
  base_name text not null default 'Base T1' check (char_length(base_name) between 1 and 80),
  base_lat double precision check (base_lat between -90 and 90),
  base_lng double precision check (base_lng between -180 and 180),
  -- Linha reta × fator = distância aproximada pelas ruas.
  road_factor numeric(4,2) not null default 1.3 check (road_factor between 1 and 3),
  avg_speed_kmh numeric(5,1) not null default 25 check (avg_speed_kmh between 5 and 120),
  stop_minutes int not null default 10 check (stop_minutes between 0 and 120)
);
insert into ops_settings default values;

create table store_closures (
  store_id uuid not null references stores(id) on delete cascade,
  day date not null,
  note text check (coalesce(char_length(note), 0) <= 200),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (store_id, day)
);

-- ---------------------------------------------------------------------------
-- 3. Viagens, rotas e paradas
-- ---------------------------------------------------------------------------
create table trips (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  driver_id uuid not null references team_members(id),
  vehicle_id uuid references vehicles(id),
  status text not null default 'planejada'
    check (status in ('planejada', 'enviada', 'em_andamento', 'concluida', 'cancelada')),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  odometer_start numeric(9,1) check (odometer_start >= 0),
  odometer_end numeric(9,1) check (odometer_end >= 0),
  km_source text not null default 'estimado' check (km_source in ('estimado', 'odometro', 'gps')),
  planned_km numeric(8,2),
  actual_km numeric(8,2),
  -- Preço do litro e consumo congelados na viagem (o histórico não muda depois).
  fuel_price numeric(6,3),
  km_per_liter numeric(6,2),
  planned_fuel_cost numeric(10,2),
  planned_driver_cost numeric(10,2),
  actual_fuel_cost numeric(10,2),
  actual_driver_cost numeric(10,2),
  notes text check (coalesce(char_length(notes), 0) <= 500),
  cancel_reason text check (coalesce(char_length(cancel_reason), 0) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index trips_day_idx on trips (day);
create index trips_driver_idx on trips (driver_id);

create table routes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('coleta', 'entrega')),
  day date not null,
  trip_id uuid references trips(id) on delete set null,
  position int not null default 1,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_andamento', 'concluida', 'cancelada')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index routes_trip_idx on routes (trip_id);
create index routes_day_idx on routes (day);

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  store_id uuid not null references stores(id),
  position int not null,
  planned_at timestamptz,
  done_at timestamptz,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'em_deslocamento', 'atendida', 'nao_realizada', 'parcial')),
  reason text check (reason in ('loja_fechada', 'pedido_nao_pronto', 'endereco_errado', 'outro')),
  note text check (coalesce(char_length(note), 0) <= 500),
  contact_name text check (coalesce(char_length(contact_name), 0) <= 120),
  lat double precision,
  lng double precision
);
create index route_stops_route_idx on route_stops (route_id);
create index route_stops_store_idx on route_stops (store_id);

create table route_stop_orders (
  stop_id uuid not null references route_stops(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  result text check (result in ('coletado', 'nao_coletado', 'entregue', 'nao_entregue')),
  primary key (stop_id, order_id)
);
create index route_stop_orders_order_idx on route_stop_orders (order_id);

-- Hoje recebe os pontos das paradas; pronta para um rastreamento contínuo.
create table trip_positions (
  id bigint generated always as identity primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  lat double precision not null,
  lng double precision not null,
  source text not null default 'parada' check (source in ('parada', 'gps')),
  stop_id uuid references route_stops(id) on delete set null
);
create index trip_positions_trip_idx on trip_positions (trip_id, at);

-- Fotos da parada (pacote na loja): caminho "stops/<parada>/<arquivo>" no bucket
-- order-photos. Não vão para o cliente (podem mostrar pacotes de outros pedidos).
create table stop_photos (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references route_stops(id) on delete cascade,
  path text not null unique check (char_length(path) <= 300),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index stop_photos_stop_idx on stop_photos (stop_id);

-- ---------------------------------------------------------------------------
-- 4. Acesso (leitura do admin; o entregador lê e grava só por funções)
-- ---------------------------------------------------------------------------
alter table vehicles enable row level security;
alter table fuel_prices enable row level security;
alter table ops_settings enable row level security;
alter table store_closures enable row level security;
alter table trips enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;
alter table route_stop_orders enable row level security;
alter table trip_positions enable row level security;
alter table stop_photos enable row level security;

create policy "staff read vehicles" on vehicles for select using (has_perm('coletas', 'ver'));
create policy "staff read fuel prices" on fuel_prices for select using (has_perm('coletas', 'ver'));
create policy "staff read ops settings" on ops_settings for select using (has_perm('coletas', 'ver'));
create policy "staff read store closures" on store_closures for select using (has_perm('coletas', 'ver'));
create policy "staff read trips" on trips for select using (has_any_perm(array['coletas', 'pedidos'], 'ver'));
create policy "staff read routes" on routes for select using (has_any_perm(array['coletas', 'pedidos'], 'ver'));
create policy "staff read route stops" on route_stops for select using (has_any_perm(array['coletas', 'pedidos'], 'ver'));
create policy "staff read route stop orders" on route_stop_orders for select using (has_any_perm(array['coletas', 'pedidos'], 'ver'));
create policy "staff read trip positions" on trip_positions for select using (has_perm('coletas', 'ver'));
create policy "staff read stop photos" on stop_photos for select using (has_any_perm(array['coletas', 'pedidos'], 'ver'));

revoke insert, update, delete on vehicles, fuel_prices, ops_settings, store_closures, trips, routes,
  route_stops, route_stop_orders, trip_positions, stop_photos from anon, authenticated;
revoke select on vehicles, fuel_prices, ops_settings, store_closures, trips, routes,
  route_stops, route_stop_orders, trip_positions, stop_photos from anon;

-- ---------------------------------------------------------------------------
-- 5. Helpers: entregador, distância e custos
-- ---------------------------------------------------------------------------
-- Pessoa da Equipe ligada a quem está logado (entregador ativo), ou null.
create or replace function public._my_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from team_members
  where user_id = auth.uid() and kind = 'entregador' and status = 'ativo';
$$;

-- Distância em linha reta (haversine), em km.
create or replace function public._km_between(lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns numeric
language sql
immutable
as $$
  select (6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric;
$$;

create or replace function public._fuel_cost(p_km numeric, p_kpl numeric, p_price numeric)
returns numeric
language sql
immutable
as $$
  select case when p_km is not null and p_kpl > 0 and p_price is not null
    then round(p_km / p_kpl * p_price, 2) end;
$$;

-- Custo do entregador pelas regras da Equipe (o fixo mensal não entra por viagem).
-- Previsto: tudo o que foi planejado. Real: só o que foi atendido.
create or replace function public._driver_cost(p_trip uuid, p_km numeric, p_actual boolean)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_routes int; v_stops int; v_collected int; v_delivered int; v_volume int;
begin
  select driver_id into v_driver from trips where id = p_trip;
  select count(*) into v_routes from routes where trip_id = p_trip and status <> 'cancelada';
  select count(*) into v_stops
    from route_stops s join routes r on r.id = s.route_id
    where r.trip_id = p_trip and r.status <> 'cancelada'
      and (not p_actual or s.status in ('atendida', 'parcial'));
  select count(*) filter (where r.kind = 'coleta' and (not p_actual or so.result = 'coletado')),
         count(*) filter (where r.kind = 'entrega' and (not p_actual or so.result = 'entregue')),
         count(distinct so.order_id) filter (where not p_actual or so.result in ('coletado', 'entregue'))
    into v_collected, v_delivered, v_volume
    from route_stop_orders so
    join route_stops s on s.id = so.stop_id
    join routes r on r.id = s.route_id
    where r.trip_id = p_trip and r.status <> 'cancelada';
  return round(coalesce((
    select sum(case pr.kind
      when 'por_rota' then pr.amount_brl * v_routes
      when 'por_parada' then pr.amount_brl * v_stops
      when 'por_coleta' then pr.amount_brl * v_collected
      when 'por_entrega' then pr.amount_brl * v_delivered
      when 'por_volume' then pr.amount_brl * v_volume
      when 'por_km' then pr.amount_brl * coalesce(p_km, 0)
      when 'bonus' then pr.amount_brl
      else 0 end)
    from team_pay_rules pr where pr.member_id = v_driver
  ), 0), 2);
end;
$$;

-- Recalcula km, horários das paradas e custos previstos. Ordem: rotas pela
-- posição na viagem, paradas pela posição na rota; sai da base e volta para ela.
create or replace function public._trip_recompute(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips%rowtype;
  s ops_settings%rowtype;
  r record;
  v_lat double precision; v_lng double precision;
  v_km numeric := 0;
  v_leg numeric;
  v_at timestamptz;
begin
  select * into t from trips where id = p_trip;
  select * into s from ops_settings where id = 1;
  v_lat := s.base_lat; v_lng := s.base_lng;
  v_at := t.planned_start_at;
  for r in
    select st.id, so.lat, so.lng
    from route_stops st
    join routes ro on ro.id = st.route_id
    join stores so on so.id = st.store_id
    where ro.trip_id = p_trip and ro.status <> 'cancelada'
    order by ro.position, ro.kind, st.position
  loop
    v_leg := case when r.lat is not null and v_lat is not null
      then _km_between(v_lat, v_lng, r.lat, r.lng) * s.road_factor else 0 end;
    v_km := v_km + v_leg;
    if v_at is not null then
      v_at := v_at + make_interval(secs => (v_leg / s.avg_speed_kmh * 3600)::double precision);
      update route_stops set planned_at = v_at where id = r.id;
      v_at := v_at + make_interval(mins => s.stop_minutes);
    end if;
    if r.lat is not null then
      v_lat := r.lat; v_lng := r.lng;
    end if;
  end loop;
  if v_lat is not null and s.base_lat is not null then
    v_leg := _km_between(v_lat, v_lng, s.base_lat, s.base_lng) * s.road_factor;
    v_km := v_km + v_leg;
    if v_at is not null then
      v_at := v_at + make_interval(secs => (v_leg / s.avg_speed_kmh * 3600)::double precision);
    end if;
  end if;
  update trips set
    planned_km = round(v_km, 2),
    planned_end_at = v_at,
    planned_fuel_cost = _fuel_cost(round(v_km, 2), km_per_liter, fuel_price),
    planned_driver_cost = _driver_cost(p_trip, round(v_km, 2), false)
  where id = p_trip;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Pendências do planejamento
-- ---------------------------------------------------------------------------
-- O que falta coletar: cada loja de origem de um pedido pago ainda não coletada.
create or replace function public.admin_collection_backlog()
returns table (order_id uuid, store_id uuid, store_code text, open_route_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'ver');
  return query
    select o.id, oos.store_id, st.code,
      (select ro.id from route_stop_orders so
         join route_stops s on s.id = so.stop_id
         join routes ro on ro.id = s.route_id
         where so.order_id = o.id and s.store_id = oos.store_id and ro.kind = 'coleta'
           and ro.status in ('aguardando', 'em_andamento') and so.result is null
         limit 1)
    from orders o
    join order_origin_stores oos on oos.order_id = o.id
    join stores st on st.id = oos.store_id
    where o.status = 'active' and o.delivery_stage = 'aguardando-coleta'
      and not exists (
        select 1 from route_stop_orders so
        join route_stops s on s.id = so.stop_id
        join routes ro on ro.id = s.route_id
        where so.order_id = o.id and s.store_id = oos.store_id
          and ro.kind = 'coleta' and so.result = 'coletado'
      );
end;
$$;

-- O que falta entregar: pedidos em transporte, no ponto de retirada.
create or replace function public.admin_delivery_backlog()
returns table (order_id uuid, store_id uuid, store_code text, open_route_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'ver');
  return query
    select o.id, o.destination_store_id, st.code,
      (select ro.id from route_stop_orders so
         join route_stops s on s.id = so.stop_id
         join routes ro on ro.id = s.route_id
         where so.order_id = o.id and ro.kind = 'entrega'
           and ro.status in ('aguardando', 'em_andamento') and so.result is null
         limit 1)
    from orders o
    join stores st on st.id = o.destination_store_id
    where o.status = 'active' and o.delivery_stage = 'em-transporte';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Rotas (admin)
-- ---------------------------------------------------------------------------
-- p: [{ "storeCode", "orderIds": [uuid, ...] }] na ordem das paradas.
create or replace function public.admin_create_route(p_kind text, p_day date, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route uuid;
  v_stop uuid;
  v_store uuid;
  v_owner uuid;
  st jsonb;
  v_order uuid;
  v_pos int := 0;
begin
  perform _require_perm('coletas', 'criar');
  if p_kind not in ('coleta', 'entrega') then
    raise exception 'Tipo de rota inválido.' using errcode = 'P0001';
  end if;
  if p_day is null then
    raise exception 'Escolha o dia da rota.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 60 then
    raise exception 'Escolha ao menos uma parada.' using errcode = 'P0001';
  end if;

  insert into routes (kind, day, created_by) values (p_kind, p_day, auth.uid()) returning id into v_route;
  perform set_config('t1.actor', 'admin', true);

  for st in select value from jsonb_array_elements(p) loop
    select id into v_store from stores where code = st ->> 'storeCode';
    if v_store is null then
      raise exception 'Loja inválida.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(st -> 'orderIds') is distinct from 'array' or jsonb_array_length(st -> 'orderIds') = 0 then
      raise exception 'Cada parada precisa de ao menos um pedido.' using errcode = 'P0001';
    end if;
    v_pos := v_pos + 1;
    insert into route_stops (route_id, store_id, position) values (v_route, v_store, v_pos) returning id into v_stop;

    for v_order in select (jsonb_array_elements_text(st -> 'orderIds'))::uuid loop
      if p_kind = 'coleta' then
        if not exists (
          select 1 from admin_collection_backlog() b
          where b.order_id = v_order and b.store_id = v_store and b.open_route_id is null
        ) then
          raise exception 'Um dos pedidos não está pendente de coleta nesta loja (ou já está em outra rota).' using errcode = 'P0001';
        end if;
      else
        if not exists (
          select 1 from admin_delivery_backlog() b
          where b.order_id = v_order and b.store_id = v_store and b.open_route_id is null
        ) then
          raise exception 'Um dos pedidos não está pronto para entrega neste ponto (ou já está em outra rota).' using errcode = 'P0001';
        end if;
      end if;
      insert into route_stop_orders (stop_id, order_id) values (v_stop, v_order);
      select user_id into v_owner from orders where id = v_order;
      perform _log_order_event(v_order, v_owner, 'route', null, 'adicionado',
        jsonb_build_object('routeId', v_route, 'routeKind', p_kind, 'day', p_day,
          'storeCode', st ->> 'storeCode'));
    end loop;
  end loop;
  return v_route;
exception
  when invalid_text_representation then
    raise exception 'Dados da rota inválidos.' using errcode = 'P0001';
  when unique_violation then
    raise exception 'O mesmo pedido apareceu duas vezes na mesma parada.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_reorder_stops(p_route uuid, p_stop_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid;
  v_status text;
begin
  perform _require_perm('coletas', 'editar');
  select trip_id, status into v_trip, v_status from routes where id = p_route;
  if v_status is null then
    raise exception 'Rota não encontrada.' using errcode = 'P0001';
  end if;
  if v_status <> 'aguardando' then
    raise exception 'Só dá para reordenar uma rota que ainda não começou.' using errcode = 'P0001';
  end if;
  if (select count(*) from route_stops where route_id = p_route) <> coalesce(array_length(p_stop_ids, 1), 0)
     or exists (select 1 from unnest(p_stop_ids) x where x not in (select id from route_stops where route_id = p_route)) then
    raise exception 'Envie todas as paradas da rota.' using errcode = 'P0001';
  end if;
  update route_stops s set position = x.ord
    from unnest(p_stop_ids) with ordinality as x(id, ord)
    where s.id = x.id;
  if v_trip is not null then
    perform _trip_recompute(v_trip);
  end if;
end;
$$;

-- Tira um pedido de uma rota que ainda não começou; parada vazia some.
create or replace function public.admin_remove_route_order(p_stop uuid, p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route routes%rowtype;
  v_owner uuid;
begin
  perform _require_perm('coletas', 'editar');
  select r.* into v_route from routes r join route_stops s on s.route_id = r.id where s.id = p_stop;
  if v_route.id is null then
    raise exception 'Parada não encontrada.' using errcode = 'P0001';
  end if;
  if v_route.status <> 'aguardando' then
    raise exception 'Só dá para mexer numa rota que ainda não começou.' using errcode = 'P0001';
  end if;
  delete from route_stop_orders where stop_id = p_stop and order_id = p_order;
  if not found then
    raise exception 'Pedido não está nesta parada.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  select user_id into v_owner from orders where id = p_order;
  perform _log_order_event(p_order, v_owner, 'route', 'adicionado', 'removido',
    jsonb_build_object('routeId', v_route.id, 'routeKind', v_route.kind, 'day', v_route.day));
  if not exists (select 1 from route_stop_orders where stop_id = p_stop) then
    delete from route_stops where id = p_stop;
  end if;
  if v_route.trip_id is not null then
    perform _trip_recompute(v_route.trip_id);
  end if;
end;
$$;

create or replace function public.admin_cancel_route(p_route uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route routes%rowtype;
  r record;
begin
  perform _require_perm('coletas', 'excluir');
  select * into v_route from routes where id = p_route for update;
  if v_route.id is null then
    raise exception 'Rota não encontrada.' using errcode = 'P0001';
  end if;
  if v_route.status <> 'aguardando' then
    raise exception 'Só dá para cancelar uma rota que ainda não começou.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  for r in
    select so.order_id, o.user_id from route_stop_orders so
    join route_stops s on s.id = so.stop_id join orders o on o.id = so.order_id
    where s.route_id = p_route
  loop
    perform _log_order_event(r.order_id, r.user_id, 'route', 'adicionado', 'removido',
      jsonb_build_object('routeId', p_route, 'routeKind', v_route.kind, 'day', v_route.day, 'cancelled', true));
  end loop;
  update routes set status = 'cancelada', trip_id = null where id = p_route;
  if v_route.trip_id is not null then
    perform _trip_recompute(v_route.trip_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Viagens (admin)
-- ---------------------------------------------------------------------------
-- p: { day, driverId, vehicleId, routeIds: [...], plannedStart: "HH:MM", notes }
create or replace function public.admin_save_trip(p_trip uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_day date := (p ->> 'day')::date;
  v_driver uuid := nullif(p ->> 'driverId', '')::uuid;
  v_vehicle uuid := nullif(p ->> 'vehicleId', '')::uuid;
  v_kpl numeric;
  v_price numeric;
  v_start timestamptz;
  v_route uuid;
  v_pos int := 0;
begin
  if p_trip is null then
    perform _require_perm('coletas', 'criar');
  else
    perform _require_perm('coletas', 'editar');
    if (select status from trips where id = p_trip) is distinct from 'planejada' then
      raise exception 'Só dá para alterar uma viagem ainda não enviada.' using errcode = 'P0001';
    end if;
  end if;
  if v_day is null then
    raise exception 'Escolha o dia.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from team_members where id = v_driver and kind = 'entregador' and status = 'ativo') then
    raise exception 'Escolha um entregador ativo da Equipe.' using errcode = 'P0001';
  end if;
  if v_vehicle is not null then
    select km_per_liter into v_kpl from vehicles where id = v_vehicle and active;
    if v_kpl is null then
      raise exception 'Veículo inválido ou inativo.' using errcode = 'P0001';
    end if;
  end if;
  if jsonb_typeof(p -> 'routeIds') is distinct from 'array' or jsonb_array_length(p -> 'routeIds') = 0 then
    raise exception 'Escolha ao menos uma rota.' using errcode = 'P0001';
  end if;
  select price_per_liter into v_price from fuel_prices where day <= v_day order by day desc limit 1;
  -- Horário de Brasília (sem horário de verão desde 2019).
  if coalesce(p ->> 'plannedStart', '') <> '' then
    v_start := (v_day::text || ' ' || (p ->> 'plannedStart') || ':00-03')::timestamptz;
  end if;

  if p_trip is null then
    insert into trips (day, driver_id, vehicle_id, planned_start_at, fuel_price, km_per_liter, notes, created_by)
    values (v_day, v_driver, v_vehicle, v_start, v_price, v_kpl, nullif(btrim(coalesce(p ->> 'notes', '')), ''), auth.uid())
    returning id into v_id;
  else
    update trips set day = v_day, driver_id = v_driver, vehicle_id = v_vehicle, planned_start_at = v_start,
      fuel_price = v_price, km_per_liter = v_kpl, notes = nullif(btrim(coalesce(p ->> 'notes', '')), '')
    where id = p_trip returning id into v_id;
    update routes set trip_id = null where trip_id = v_id;
  end if;

  -- Coletas antes das entregas, na ordem escolhida.
  for v_route in
    select x::uuid from jsonb_array_elements_text(p -> 'routeIds') with ordinality as t(x, ord)
    order by (select case kind when 'coleta' then 0 else 1 end from routes where id = x::uuid), ord
  loop
    v_pos := v_pos + 1;
    update routes set trip_id = v_id, position = v_pos
      where id = v_route and status = 'aguardando' and day = v_day and (trip_id is null or trip_id = v_id);
    if not found then
      raise exception 'Uma das rotas não está disponível para este dia (já está em outra viagem, começou ou foi cancelada).' using errcode = 'P0001';
    end if;
  end loop;

  perform _trip_recompute(v_id);
  return v_id;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Confira o dia, o horário e as rotas.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_send_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'editar');
  if (select status from trips where id = p_trip) is distinct from 'planejada' then
    raise exception 'Só dá para enviar uma viagem planejada.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from route_stops s join routes r on r.id = s.route_id
    where r.trip_id = p_trip and r.status <> 'cancelada'
  ) then
    raise exception 'A viagem não tem paradas.' using errcode = 'P0001';
  end if;
  update trips set status = 'enviada' where id = p_trip;
end;
$$;

-- Cancelar: rotas sem nada registrado voltam a ficar livres para outra viagem.
create or replace function public.admin_cancel_trip(p_trip uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform _require_perm('coletas', 'excluir');
  select status into v_status from trips where id = p_trip for update;
  if v_status is null then
    raise exception 'Viagem não encontrada.' using errcode = 'P0001';
  end if;
  if v_status in ('concluida', 'cancelada') then
    raise exception 'Esta viagem já foi encerrada.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  update routes r set trip_id = null, status = 'aguardando'
    where r.trip_id = p_trip and not exists (
      select 1 from route_stops s where s.route_id = r.id and s.status <> 'aguardando');
  update routes set status = 'concluida' where trip_id = p_trip;
  update trips set status = 'cancelada', cancel_reason = btrim(p_reason) where id = p_trip;
end;
$$;

-- Ajuste do odômetro pelo admin (entregador esqueceu, digitou errado).
create or replace function public.admin_set_trip_odometer(p_trip uuid, p_start numeric, p_end numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips%rowtype;
  v_km numeric;
begin
  perform _require_perm('coletas', 'editar');
  select * into t from trips where id = p_trip for update;
  if t.id is null then
    raise exception 'Viagem não encontrada.' using errcode = 'P0001';
  end if;
  if p_start is null or p_end is null or p_start < 0 or p_end < p_start or p_end - p_start > 2000 then
    raise exception 'Confira o odômetro: o final precisa ser maior que o inicial.' using errcode = 'P0001';
  end if;
  v_km := p_end - p_start;
  update trips set odometer_start = p_start, odometer_end = p_end, km_source = 'odometro', actual_km = v_km,
    actual_fuel_cost = case when status = 'concluida' then _fuel_cost(v_km, km_per_liter, fuel_price) end,
    actual_driver_cost = case when status = 'concluida' then _driver_cost(p_trip, v_km, true) end
  where id = p_trip;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Cadastros (admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_vehicle(p_vehicle uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform _require_perm('coletas', case when p_vehicle is null then 'criar' else 'editar' end);
  if char_length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 80
     or coalesce((p ->> 'kmPerLiter')::numeric, 0) <= 0 then
    raise exception 'Informe o nome e o consumo (km/l) do veículo.' using errcode = 'P0001';
  end if;
  if p_vehicle is null then
    insert into vehicles (name, plate, km_per_liter, active)
    values (btrim(p ->> 'name'), nullif(upper(btrim(coalesce(p ->> 'plate', ''))), ''),
            (p ->> 'kmPerLiter')::numeric, coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update vehicles set name = btrim(p ->> 'name'), plate = nullif(upper(btrim(coalesce(p ->> 'plate', ''))), ''),
      km_per_liter = (p ->> 'kmPerLiter')::numeric, active = coalesce((p ->> 'active')::boolean, true)
    where id = p_vehicle returning id into v_id;
    if v_id is null then
      raise exception 'Veículo não encontrado.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation or check_violation then
    raise exception 'Confira os dados do veículo.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_set_fuel_price(p_day date, p_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'editar');
  if p_day is null or p_price is null or p_price <= 0 or p_price > 50 then
    raise exception 'Confira o dia e o preço do litro.' using errcode = 'P0001';
  end if;
  insert into fuel_prices (day, price_per_liter, created_by) values (p_day, p_price, auth.uid())
  on conflict (day) do update set price_per_liter = excluded.price_per_liter, created_by = excluded.created_by;
end;
$$;

-- p: { baseName, baseLat, baseLng, roadFactor, avgSpeedKmh, stopMinutes }
create or replace function public.admin_update_ops_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'editar');
  update ops_settings set
    base_name = coalesce(nullif(btrim(p ->> 'baseName'), ''), base_name),
    base_lat = nullif(p ->> 'baseLat', '')::double precision,
    base_lng = nullif(p ->> 'baseLng', '')::double precision,
    road_factor = coalesce(nullif(p ->> 'roadFactor', '')::numeric, road_factor),
    avg_speed_kmh = coalesce(nullif(p ->> 'avgSpeedKmh', '')::numeric, avg_speed_kmh),
    stop_minutes = coalesce(nullif(p ->> 'stopMinutes', '')::int, stop_minutes)
  where id = 1;
  if (select (base_lat is null) <> (base_lng is null) from ops_settings where id = 1) then
    raise exception 'Informe latitude e longitude da base juntas.' using errcode = 'P0001';
  end if;
exception
  when invalid_text_representation or check_violation then
    raise exception 'Confira os números informados.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_set_store_closure(p_store_code text, p_day date, p_closed boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  perform _require_perm('coletas', 'editar');
  select id into v_store from stores where code = p_store_code;
  if v_store is null or p_day is null then
    raise exception 'Confira a loja e o dia.' using errcode = 'P0001';
  end if;
  if p_closed then
    insert into store_closures (store_id, day, note, created_by)
    values (v_store, p_day, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (store_id, day) do update set note = excluded.note;
  else
    delete from store_closures where store_id = v_store and day = p_day;
  end if;
exception
  when check_violation then
    raise exception 'A observação é longa demais.' using errcode = 'P0001';
end;
$$;

-- Entregadores para montar viagens (quem monta rotas não precisa ver Pessoas).
create or replace function public.admin_list_drivers()
-- Inclui os inativos (nome nas viagens antigas); sem documento nem Pix.
returns table (id uuid, name text, has_account boolean, active boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('coletas', 'ver');
  return query
    select tm.id, tm.name, tm.user_id is not null, tm.status = 'ativo'
    from team_members tm
    where tm.kind = 'entregador'
    order by tm.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Área do entregador
-- ---------------------------------------------------------------------------
create or replace function public.my_driver_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('memberId', id, 'name', name)
  from team_members
  where user_id = auth.uid() and kind = 'entregador' and status = 'ativo';
$$;

-- Viagens do entregador: as abertas e as concluídas de hoje em diante.
create or replace function public.driver_trips()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver uuid := _my_driver_id();
begin
  if v_driver is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'day', t.day, 'status', t.status,
      'vehicle', (select name || coalesce(' · ' || plate, '') from vehicles where id = t.vehicle_id),
      'plannedStartAt', t.planned_start_at, 'startedAt', t.started_at, 'finishedAt', t.finished_at,
      'odometerStart', t.odometer_start, 'plannedKm', t.planned_km, 'notes', t.notes,
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'kind', r.kind, 'status', r.status,
          'stops', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', s.id, 'position', s.position, 'status', s.status, 'plannedAt', s.planned_at,
              'doneAt', s.done_at, 'reason', s.reason, 'note', s.note, 'contactName', s.contact_name,
              'store', jsonb_build_object('name', st.name, 'address', st.address,
                'neighborhood', st.neighborhood, 'city', st.city, 'lat', st.lat, 'lng', st.lng),
              'orders', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'orderId', so.order_id,
                  'code', upper(left(so.order_id::text, 8)),
                  'customerFirstName', split_part(btrim(pr.name), ' ', 1),
                  'result', so.result
                ) order by so.order_id)
                from route_stop_orders so
                join orders o on o.id = so.order_id
                left join profiles pr on pr.id = o.user_id
                where so.stop_id = s.id
              ), '[]'::jsonb)
            ) order by s.position)
            from route_stops s join stores st on st.id = s.store_id
            where s.route_id = r.id
          ), '[]'::jsonb)
        ) order by r.position)
        from routes r where r.trip_id = t.id and r.status <> 'cancelada'
      ), '[]'::jsonb)
    ) order by t.day, t.planned_start_at nulls last)
    from trips t
    where t.driver_id = v_driver
      and (t.status in ('enviada', 'em_andamento')
           or (t.status = 'concluida' and t.day >= (now() at time zone 'America/Sao_Paulo')::date))
  ), '[]'::jsonb);
end;
$$;

create or replace function public._driver_trip_of_stop(p_stop uuid)
returns trips
language sql
stable
security definer
set search_path = public
as $$
  select t.* from trips t
  join routes r on r.trip_id = t.id
  join route_stops s on s.route_id = r.id
  where s.id = p_stop and t.driver_id = _my_driver_id();
$$;

create or replace function public.driver_start_trip(p_trip uuid, p_odometer numeric,
  p_lat double precision default null, p_lng double precision default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _my_driver_id() is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  if (select status from trips where id = p_trip and driver_id = _my_driver_id()) is distinct from 'enviada' then
    raise exception 'Esta viagem não está liberada para começar.' using errcode = 'P0001';
  end if;
  if p_odometer is null or p_odometer < 0 then
    raise exception 'Informe o odômetro do veículo.' using errcode = 'P0001';
  end if;
  update trips set status = 'em_andamento', started_at = now(), odometer_start = p_odometer where id = p_trip;
  update routes set status = 'em_andamento' where trip_id = p_trip and status = 'aguardando';
  if p_lat is not null and p_lng is not null then
    insert into trip_positions (trip_id, lat, lng) values (p_trip, p_lat, p_lng);
  end if;
end;
$$;

-- Aplica o resultado de um pedido numa parada (coleta ou entrega) e as
-- consequências: custódia, etapa do pedido e linha do tempo.
create or replace function public._apply_stop_result(p_stop uuid, p_order uuid, p_ok boolean,
  p_reason text, p_contact text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_store uuid;
  o orders%rowtype;
  v_driver_name text := (select name from team_members where id = _my_driver_id());
begin
  select r.kind, s.store_id into v_kind, v_store
    from route_stops s join routes r on r.id = s.route_id where s.id = p_stop;
  select * into o from orders where id = p_order for update;
  update route_stop_orders set result = case
      when v_kind = 'coleta' and p_ok then 'coletado'
      when v_kind = 'coleta' then 'nao_coletado'
      when p_ok then 'entregue'
      else 'nao_entregue' end
    where stop_id = p_stop and order_id = p_order and result is null;
  if not found then
    raise exception 'Este pedido já foi registrado nesta parada.' using errcode = 'P0001';
  end if;

  if not p_ok then
    perform _log_order_event(p_order, o.user_id, 'stop_failed', null, v_kind,
      jsonb_build_object('stopId', p_stop, 'storeCode', (select code from stores where id = v_store)), p_reason);
    return;
  end if;

  if v_kind = 'coleta' then
    insert into custody_events (order_id, action, store_id, responsible_name, note, recorded_by)
    values (p_order, 'coletado_na_loja', v_store, v_driver_name,
            case when p_contact is not null then 'Entregue por ' || p_contact end, auth.uid());
    -- Todas as lojas do pedido coletadas: segue para o transporte.
    if o.status = 'active' and o.delivery_stage = 'aguardando-coleta' and not exists (
      select 1 from order_origin_stores oos
      where oos.order_id = p_order and not exists (
        select 1 from route_stop_orders so
        join route_stops s on s.id = so.stop_id
        join routes r on r.id = s.route_id
        where so.order_id = p_order and s.store_id = oos.store_id
          and r.kind = 'coleta' and so.result = 'coletado')
    ) then
      update orders set delivery_stage = 'em-transporte' where id = p_order;
    end if;
  else
    if o.status <> 'active' or o.delivery_stage is distinct from 'em-transporte' then
      raise exception 'O pedido #% não está em transporte.', upper(left(p_order::text, 8)) using errcode = 'P0001';
    end if;
    update orders set delivery_stage = 'disponivel-para-retirada' where id = p_order;
    insert into custody_events (order_id, action, store_id, responsible_name, note, recorded_by)
    values (p_order, 'entregue_no_ponto', v_store, v_driver_name,
            case when p_contact is not null then 'Recebido por ' || p_contact end, auth.uid());
  end if;
end;
$$;

-- Status da parada pelo resultado dos pedidos dela.
create or replace function public._refresh_stop(p_stop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int; v_done int; v_ok int;
begin
  select count(*), count(result), count(*) filter (where result in ('coletado', 'entregue'))
    into v_total, v_done, v_ok
    from route_stop_orders where stop_id = p_stop;
  if v_done < v_total then
    return;
  end if;
  update route_stops set
    status = case when v_ok = v_total then 'atendida' when v_ok = 0 then 'nao_realizada' else 'parcial' end,
    done_at = coalesce(done_at, now())
  where id = p_stop;
end;
$$;

-- p: { orders: [{ orderId, ok }], contactName, reason, note, lat, lng }
create or replace function public.driver_record_stop(p_stop uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips%rowtype := _driver_trip_of_stop(p_stop);
  v_reason text := nullif(p ->> 'reason', '');
  v_contact text := nullif(btrim(coalesce(p ->> 'contactName', '')), '');
  v_lat double precision := nullif(p ->> 'lat', '')::double precision;
  v_lng double precision := nullif(p ->> 'lng', '')::double precision;
  it jsonb;
  v_any_fail boolean := false;
begin
  if t.id is null then
    raise exception 'Parada não encontrada nas suas viagens.' using errcode = 'P0001';
  end if;
  if t.status <> 'em_andamento' then
    raise exception 'Inicie a viagem antes de registrar as paradas.' using errcode = 'P0001';
  end if;
  if (select status from route_stops where id = p_stop) not in ('aguardando', 'em_deslocamento') then
    raise exception 'Esta parada já foi registrada.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'orders') is distinct from 'array'
     or jsonb_array_length(p -> 'orders') <> (select count(*) from route_stop_orders where stop_id = p_stop and result is null) then
    raise exception 'Marque todos os pedidos da parada.' using errcode = 'P0001';
  end if;
  select bool_or(not coalesce((x ->> 'ok')::boolean, false)) into v_any_fail
    from jsonb_array_elements(p -> 'orders') x;
  if v_any_fail and v_reason is null then
    raise exception 'Informe o motivo dos pedidos que não saíram.' using errcode = 'P0001';
  end if;
  if v_reason is not null and v_reason not in ('loja_fechada', 'pedido_nao_pronto', 'endereco_errado', 'outro') then
    raise exception 'Motivo inválido.' using errcode = 'P0001';
  end if;
  if v_reason = 'outro' and nullif(btrim(coalesce(p ->> 'note', '')), '') is null then
    raise exception 'Descreva o motivo na observação.' using errcode = 'P0001';
  end if;

  perform set_config('t1.actor', 'driver', true);
  update route_stops set contact_name = v_contact, reason = v_reason,
    note = nullif(btrim(coalesce(p ->> 'note', '')), ''), lat = v_lat, lng = v_lng
    where id = p_stop;
  for it in select value from jsonb_array_elements(p -> 'orders') loop
    perform _apply_stop_result(p_stop, (it ->> 'orderId')::uuid, coalesce((it ->> 'ok')::boolean, false),
      v_reason, v_contact);
  end loop;
  perform _refresh_stop(p_stop);
  if v_lat is not null and v_lng is not null then
    insert into trip_positions (trip_id, lat, lng, stop_id) values (t.id, v_lat, v_lng, p_stop);
  end if;
exception
  when invalid_text_representation then
    raise exception 'Dados da parada inválidos.' using errcode = 'P0001';
end;
$$;

-- Entrega pelo QR do pacote (página /retirada/<token> aberta pelo entregador).
-- p: { contactName, lat, lng }
create or replace function public.driver_deliver_by_token(p_token text, p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_stop uuid;
  v_trip uuid;
  v_contact text := nullif(btrim(coalesce(p ->> 'contactName', '')), '');
  v_lat double precision := nullif(p ->> 'lat', '')::double precision;
  v_lng double precision := nullif(p ->> 'lng', '')::double precision;
begin
  if _my_driver_id() is null then
    raise exception 'Acesso só para entregadores ativos da equipe.' using errcode = 'P0001';
  end if;
  select order_id into v_order from order_pickups where package_token = p_token;
  if v_order is null then
    raise exception 'Este QR não é de um pacote da T1 Express.' using errcode = 'P0001';
  end if;
  select so.stop_id, t.id into v_stop, v_trip
    from route_stop_orders so
    join route_stops s on s.id = so.stop_id
    join routes r on r.id = s.route_id
    join trips t on t.id = r.trip_id
    where so.order_id = v_order and so.result is null and r.kind = 'entrega'
      and t.driver_id = _my_driver_id() and t.status = 'em_andamento'
    limit 1;
  if v_stop is null then
    raise exception 'Este pacote não está numa entrega da sua viagem em andamento.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'driver', true);
  update route_stops set contact_name = coalesce(v_contact, contact_name),
    lat = coalesce(v_lat, lat), lng = coalesce(v_lng, lng)
    where id = v_stop;
  perform _apply_stop_result(v_stop, v_order, true, null, v_contact);
  perform _refresh_stop(v_stop);
  if v_lat is not null and v_lng is not null then
    insert into trip_positions (trip_id, lat, lng, stop_id) values (v_trip, v_lat, v_lng, v_stop);
  end if;
  return jsonb_build_object('ok', true, 'orderCode', upper(left(v_order::text, 8)));
exception
  when invalid_text_representation then
    raise exception 'Dados da entrega inválidos.' using errcode = 'P0001';
end;
$$;

create or replace function public.driver_add_stop_photo(p_stop uuid, p_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (_driver_trip_of_stop(p_stop)).id is null then
    raise exception 'Parada não encontrada nas suas viagens.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^stops/' || p_stop::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Arquivo de foto inválido.' using errcode = 'P0001';
  end if;
  insert into stop_photos (stop_id, path, created_by) values (p_stop, p_path, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.driver_finish_trip(p_trip uuid, p_odometer numeric,
  p_lat double precision default null, p_lng double precision default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips%rowtype;
  v_km numeric;
begin
  select * into t from trips where id = p_trip and driver_id = _my_driver_id() for update;
  if t.id is null then
    raise exception 'Viagem não encontrada.' using errcode = 'P0001';
  end if;
  if t.status <> 'em_andamento' then
    raise exception 'Esta viagem não está em andamento.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from route_stops s join routes r on r.id = s.route_id
    where r.trip_id = p_trip and r.status <> 'cancelada' and s.status in ('aguardando', 'em_deslocamento')
  ) then
    raise exception 'Registre todas as paradas antes de finalizar.' using errcode = 'P0001';
  end if;
  if p_odometer is null or p_odometer < coalesce(t.odometer_start, 0) then
    raise exception 'O odômetro final precisa ser maior que o inicial.' using errcode = 'P0001';
  end if;
  v_km := case when t.odometer_start is not null then p_odometer - t.odometer_start else t.planned_km end;
  update trips set status = 'concluida', finished_at = now(), odometer_end = p_odometer,
    km_source = case when t.odometer_start is not null then 'odometro' else 'estimado' end,
    actual_km = v_km,
    actual_fuel_cost = _fuel_cost(v_km, km_per_liter, fuel_price),
    actual_driver_cost = _driver_cost(p_trip, v_km, true)
  where id = p_trip;
  update routes set status = 'concluida' where trip_id = p_trip and status <> 'cancelada';
  if p_lat is not null and p_lng is not null then
    insert into trip_positions (trip_id, lat, lng) values (p_trip, p_lat, p_lng);
  end if;
end;
$$;

-- Página do QR: além do que já mostrava, diz se quem lê é o entregador que
-- pode confirmar a entrega deste pacote agora.
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
     and r.delivery_stage = 'em-transporte' then
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

-- ---------------------------------------------------------------------------
-- 11. Fotos das paradas no bucket order-photos ("stops/<parada>/...")
-- ---------------------------------------------------------------------------
create policy "drivers upload stop photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'order-photos' and (storage.foldername(name))[1] = 'stops'
    and exists (
      select 1 from public.route_stops s
      join public.routes r on r.id = s.route_id
      join public.trips t on t.id = r.trip_id
      where s.id::text = (storage.foldername(name))[2] and t.driver_id = public._my_driver_id()
    )
  );
create policy "drivers and staff read stop photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-photos' and (storage.foldername(name))[1] = 'stops' and (
      public.has_any_perm(array['coletas', 'pedidos'], 'ver')
      or exists (
        select 1 from public.route_stops s
        join public.routes r on r.id = s.route_id
        join public.trips t on t.id = r.trip_id
        where s.id::text = (storage.foldername(name))[2] and t.driver_id = public._my_driver_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _km_between(double precision, double precision, double precision, double precision),
  _fuel_cost(numeric, numeric, numeric),
  _driver_cost(uuid, numeric, boolean),
  _trip_recompute(uuid),
  _driver_trip_of_stop(uuid),
  _apply_stop_result(uuid, uuid, boolean, text, text),
  _refresh_stop(uuid),
  admin_collection_backlog(),
  admin_delivery_backlog(),
  admin_create_route(text, date, jsonb),
  admin_reorder_stops(uuid, uuid[]),
  admin_remove_route_order(uuid, uuid),
  admin_cancel_route(uuid),
  admin_save_trip(uuid, jsonb),
  admin_send_trip(uuid),
  admin_cancel_trip(uuid, text),
  admin_set_trip_odometer(uuid, numeric, numeric),
  admin_upsert_vehicle(uuid, jsonb),
  admin_set_fuel_price(date, numeric),
  admin_update_ops_settings(jsonb),
  admin_set_store_closure(text, date, boolean, text),
  admin_list_drivers(),
  my_driver_access(),
  driver_trips(),
  driver_start_trip(uuid, numeric, double precision, double precision),
  driver_record_stop(uuid, jsonb),
  driver_deliver_by_token(text, jsonb),
  driver_add_stop_photo(uuid, text),
  driver_finish_trip(uuid, numeric, double precision, double precision)
from public, anon, authenticated;

-- Usada nas policies do Storage: precisa ser executável por quem consulta.
revoke all on function _my_driver_id() from public, anon;
grant execute on function _my_driver_id() to authenticated;

grant execute on function
  admin_collection_backlog(),
  admin_delivery_backlog(),
  admin_create_route(text, date, jsonb),
  admin_reorder_stops(uuid, uuid[]),
  admin_remove_route_order(uuid, uuid),
  admin_cancel_route(uuid),
  admin_save_trip(uuid, jsonb),
  admin_send_trip(uuid),
  admin_cancel_trip(uuid, text),
  admin_set_trip_odometer(uuid, numeric, numeric),
  admin_upsert_vehicle(uuid, jsonb),
  admin_set_fuel_price(date, numeric),
  admin_update_ops_settings(jsonb),
  admin_set_store_closure(text, date, boolean, text),
  admin_list_drivers(),
  my_driver_access(),
  driver_trips(),
  driver_start_trip(uuid, numeric, double precision, double precision),
  driver_record_stop(uuid, jsonb),
  driver_deliver_by_token(text, jsonb),
  driver_add_stop_photo(uuid, text),
  driver_finish_trip(uuid, numeric, double precision, double precision)
to authenticated;
