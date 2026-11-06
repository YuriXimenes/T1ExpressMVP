-- TESTE da 0024 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. A 0023 precisa estar aplicada.
-- Gerado de migrations/0024_platform_metrics.sql + tests/0024_platform_metrics_test.sql.

begin;

-- Entrega 9: Plataforma (indicadores).
--   1. Registro das simulações de frete (anônimas; ligadas à conta quando logado),
--      com as etapas do funil: simulou, continuou, chegou ao pedido, criou o pedido.
--      Também registra a tentativa que falhou (rota sem preço de concorrente).
--   2. Funções de indicadores para a tela Plataforma › Indicadores (área nova
--      "indicadores"): funil, demanda, preço x concorrentes, clientes, simulações
--      abandonadas, lojas pedidas e saúde do comparador.
--   3. freight_routes ganha updated_at (preço desatualizado na saúde do comparador).
-- Não mexe no checkout. Precisa da 0023. Ver rollback/0024_down.sql.

-- ---------------------------------------------------------------------------
-- 0. Área nova de permissão
-- ---------------------------------------------------------------------------
create or replace function public._staff_areas()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'pedidos', 'chamados', 'coletas', 'pontos', 'ocorrencias',
    'lojas', 'kyc', 'formularios', 'desempenho',
    'precos', 'cupons', 'despesas', 'repasses', 'sinistros',
    'usuarios', 'pesquisa', 'comparador', 'comparativo', 'indicadores',
    'pessoas', 'auditoria', 'integracoes'
  ];
$$;

-- ---------------------------------------------------------------------------
-- 1. Simulações
-- ---------------------------------------------------------------------------
create table freight_simulations (
  id uuid primary key default gen_random_uuid(),
  -- Código aleatório do navegador (localStorage). Não identifica a pessoa.
  visitor_id text not null check (visitor_id ~ '^[A-Za-z0-9-]{16,64}$'),
  user_id uuid references profiles(id) on delete set null,
  origin_store_ids uuid[] not null check (cardinality(origin_store_ids) between 1 and 11),
  destination_store_id uuid not null references stores(id) on delete cascade,
  store_count int not null check (store_count between 1 and 11),
  -- Códigos das lojas de coleta em ordem + ">" + ponto de retirada.
  route_key text not null check (char_length(route_key) <= 600),
  -- Simulação que não deu preço (rota sem preço de concorrente cadastrado).
  quote_failed boolean not null default false,
  price_brl numeric(10,2) check (price_brl >= 0),
  uber_brl numeric(10,2) check (uber_brl >= 0),
  loggi_brl numeric(10,2) check (loggi_brl >= 0),
  correios_brl numeric(10,2) check (correios_brl >= 0),
  savings_brl numeric(10,2) check (savings_brl >= 0),
  days_min int check (days_min between 1 and 60),
  days_max int check (days_max between 1 and 60),
  created_at timestamptz not null default now(),
  continued_at timestamptz,
  order_page_at timestamptz,
  order_id uuid references orders(id) on delete set null
);
create index freight_simulations_created_idx on freight_simulations (created_at desc);
create index freight_simulations_visitor_idx on freight_simulations (visitor_id, created_at desc);
create index freight_simulations_user_idx on freight_simulations (user_id, created_at desc);
create index freight_simulations_order_idx on freight_simulations (order_id);

-- Ninguém de fora lê; gravação só pelas funções abaixo.
alter table freight_simulations enable row level security;
revoke all on freight_simulations from anon, authenticated;

-- Grava uma simulação e devolve o id. Nunca dá erro para o visitante: se algo não
-- bater (loja inválida, limite atingido), devolve null e o site segue normal.
-- p: { visitorId, originStoreCodes[], destinationStoreCode, failed?, quote?: {
--      estimatedDaysMin, estimatedDaysMax, cheapestSavingsBRL?, competitors[{carrier,totalBRL}] } }
create or replace function public.log_simulation(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor text := p ->> 'visitorId';
  v_codes text[];
  v_ids uuid[] := '{}';
  v_code text;
  v_store uuid;
  v_dest uuid;
  v_dest_code text;
  v_key text;
  v_failed boolean := coalesce((p ->> 'failed')::boolean, false);
  v_pricing pricing_versions%rowtype;
  v_existing uuid;
  q jsonb := p -> 'quote';
  c jsonb;
  v_uber numeric; v_loggi numeric; v_correios numeric; v_savings numeric;
  v_min int; v_max int;
  v_id uuid;
begin
  if v_visitor is null or v_visitor !~ '^[A-Za-z0-9-]{16,64}$'
     or jsonb_typeof(p -> 'originStoreCodes') is distinct from 'array'
     or jsonb_array_length(p -> 'originStoreCodes') not between 1 and 11 then
    return null;
  end if;
  -- Limite por navegador: 60 por hora.
  if (select count(*) from freight_simulations
      where visitor_id = v_visitor and created_at > now() - interval '1 hour') >= 60 then
    return null;
  end if;

  select array_agg(x order by x) into v_codes
    from (select distinct jsonb_array_elements_text(p -> 'originStoreCodes') x) s;
  foreach v_code in array v_codes loop
    select id into v_store from stores where code = v_code;
    if v_store is null then
      return null;
    end if;
    v_ids := v_ids || v_store;
  end loop;
  select id, code into v_dest, v_dest_code from stores
    where code = p ->> 'destinationStoreCode' and is_pickup_point;
  if v_dest is null or v_dest = any (v_ids) then
    return null;
  end if;
  v_key := array_to_string(v_codes, '+') || '>' || v_dest_code;

  -- Mesma rota do mesmo navegador em 2 minutos: reaproveita (recalcular não conta 2x).
  select id into v_existing from freight_simulations
    where visitor_id = v_visitor and route_key = v_key and created_at > now() - interval '2 minutes'
      and quote_failed = v_failed
    order by created_at desc limit 1;
  if v_existing is not null then
    update freight_simulations set user_id = coalesce(user_id, auth.uid()) where id = v_existing;
    return v_existing;
  end if;

  if not v_failed and jsonb_typeof(q) = 'object' then
    if jsonb_typeof(q -> 'competitors') = 'array' then
      for c in select value from jsonb_array_elements(q -> 'competitors') limit 5 loop
        if jsonb_typeof(c -> 'totalBRL') = 'number' and (c ->> 'totalBRL')::numeric between 0 and 100000 then
          case c ->> 'carrier'
            when 'uber' then v_uber := round((c ->> 'totalBRL')::numeric, 2);
            when 'loggi' then v_loggi := round((c ->> 'totalBRL')::numeric, 2);
            when 'correios' then v_correios := round((c ->> 'totalBRL')::numeric, 2);
            else null;
          end case;
        end if;
      end loop;
    end if;
    if jsonb_typeof(q -> 'cheapestSavingsBRL') = 'number'
       and (q ->> 'cheapestSavingsBRL')::numeric between 0 and 100000 then
      v_savings := round((q ->> 'cheapestSavingsBRL')::numeric, 2);
    end if;
    if jsonb_typeof(q -> 'estimatedDaysMin') = 'number' then
      v_min := least(greatest((q ->> 'estimatedDaysMin')::numeric, 1), 60)::int;
    end if;
    if jsonb_typeof(q -> 'estimatedDaysMax') = 'number' then
      v_max := least(greatest((q ->> 'estimatedDaysMax')::numeric, 1), 60)::int;
    end if;
  end if;

  -- Preço da T1 calculado aqui, pelo preço em vigor (igual ao create_order).
  v_pricing := _pricing_at(now());
  insert into freight_simulations (visitor_id, user_id, origin_store_ids, destination_store_id, store_count,
    route_key, quote_failed, price_brl, uber_brl, loggi_brl, correios_brl, savings_brl, days_min, days_max)
  values (v_visitor, auth.uid(), v_ids, v_dest, cardinality(v_ids), v_key, v_failed,
    case when not v_failed then v_pricing.base_brl + (cardinality(v_ids) - 1) * v_pricing.extra_store_brl end,
    v_uber, v_loggi, v_correios, v_savings, v_min, v_max)
  returning id into v_id;
  return v_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

-- Marca uma etapa do funil. Só o mesmo navegador marca; nunca dá erro.
--   continued  = clicou "Continuar" no simulador
--   order_page = chegou à montagem do pedido (já logado; liga à conta)
--   order      = criou o pedido (p_order precisa ser do cliente logado)
create or replace function public.mark_simulation(p_id uuid, p_visitor text, p_step text, p_order uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_id is null or p_visitor is null then
    return;
  end if;
  if p_step = 'continued' then
    update freight_simulations set continued_at = coalesce(continued_at, now()),
                                   user_id = coalesce(user_id, v_uid)
      where id = p_id and visitor_id = p_visitor;
  elsif p_step = 'order_page' and v_uid is not null then
    update freight_simulations set order_page_at = coalesce(order_page_at, now()),
                                   continued_at = coalesce(continued_at, now()),
                                   user_id = coalesce(user_id, v_uid)
      where id = p_id and visitor_id = p_visitor and (user_id is null or user_id = v_uid);
  elsif p_step = 'order' and v_uid is not null and p_order is not null
        and exists (select 1 from orders where id = p_order and user_id = v_uid) then
    update freight_simulations set order_id = p_order,
                                   order_page_at = coalesce(order_page_at, now()),
                                   continued_at = coalesce(continued_at, now()),
                                   user_id = coalesce(user_id, v_uid)
      where id = p_id and visitor_id = p_visitor and order_id is null
        and (user_id is null or user_id = v_uid);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Comparador: data da última atualização do preço da rota
-- ---------------------------------------------------------------------------
alter table freight_routes add column updated_at timestamptz;
update freight_routes set updated_at = created_at where updated_at is null;
alter table freight_routes alter column updated_at set default now(), alter column updated_at set not null;

create or replace function public._freight_routes_touch()
returns trigger
language plpgsql
as $$
begin
  if (new.loggi_brl, new.uber_brl) is distinct from (old.loggi_brl, old.uber_brl) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger freight_routes_touch
  before update on freight_routes
  for each row execute function _freight_routes_touch();

-- ---------------------------------------------------------------------------
-- 3. Indicadores (período por dia de Brasília; sem ponta = aberto)
-- ---------------------------------------------------------------------------
create or replace function public._in_days(p_at timestamptz, p_from date, p_to date)
returns boolean
language sql
immutable
as $$
  select p_at is not null
     and (p_from is null or (p_at at time zone 'America/Sao_Paulo')::date >= p_from)
     and (p_to is null or (p_at at time zone 'America/Sao_Paulo')::date <= p_to);
$$;

-- Nomes das lojas de uma rota ("Loja A, Loja B → Ponto").
create or replace function public._route_label(p_origins uuid[], p_dest uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select string_agg(s.name, ', ' order by s.name) from stores s where s.id = any (p_origins)), '?')
         || ' → ' || coalesce((select name from stores where id = p_dest), '?');
$$;

-- Funil: coorte das simulações criadas no período.
create or replace function public.admin_metrics_funnel(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  perform _require_perm('indicadores', 'ver');
  select jsonb_build_object(
    'simulations', count(*) filter (where not s.quote_failed),
    'failed', count(*) filter (where s.quote_failed),
    'visitors', count(distinct s.visitor_id),
    'continued', count(*) filter (where s.continued_at is not null),
    'orderPage', count(*) filter (where s.order_page_at is not null),
    'ordersCreated', count(*) filter (where s.order_id is not null),
    'paid', count(*) filter (where o.paid_at is not null),
    'completed', count(*) filter (where o.status = 'completed'),
    'cancelled', count(*) filter (where o.status = 'cancelled'),
    'loggedIn', count(*) filter (where s.user_id is not null))
  into r
  from freight_simulations s left join orders o on o.id = s.order_id
  where _in_days(s.created_at, p_from, p_to);

  return r || jsonb_build_object(
    -- Pedidos do período que não vieram de uma simulação registrada (ex.: antes da 0024).
    'ordersWithoutSimulation', (select count(*) from orders o
      where _in_days(o.created_at, p_from, p_to)
        and not exists (select 1 from freight_simulations s where s.order_id = o.id)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'simulations', d.sims,
        'orders', d.orders, 'paid', d.paid) order by d.day)
      from (
        select day, sum(sims)::int as sims, sum(orders)::int as orders, sum(paid)::int as paid from (
          select (created_at at time zone 'America/Sao_Paulo')::date as day, 1 as sims, 0 as orders, 0 as paid
            from freight_simulations where not quote_failed and _in_days(created_at, p_from, p_to)
          union all
          select (created_at at time zone 'America/Sao_Paulo')::date, 0, 1, 0
            from orders where _in_days(created_at, p_from, p_to)
          union all
          select (paid_at at time zone 'America/Sao_Paulo')::date, 0, 0, 1
            from orders where status <> 'cancelled' and _in_days(paid_at, p_from, p_to)
        ) u group by day
      ) d), '[]'::jsonb));
end;
$$;

-- Demanda: lojas e rotas mais buscadas e quanto convertem.
create or replace function public.admin_metrics_demand(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return jsonb_build_object(
    'origins', coalesce((select jsonb_agg(x.j order by x.sims desc, x.name) from (
      select st.name, count(*) as sims, jsonb_build_object('code', st.code, 'name', st.name,
        'simulations', count(*), 'orders', count(*) filter (where s.order_id is not null),
        'failed', count(*) filter (where s.quote_failed)) as j
      from freight_simulations s cross join lateral unnest(s.origin_store_ids) oid
      join stores st on st.id = oid
      where _in_days(s.created_at, p_from, p_to)
      group by st.id, st.code, st.name
      order by count(*) desc limit 50) x), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(x.j order by x.sims desc, x.name) from (
      select st.name, count(*) as sims, jsonb_build_object('code', st.code, 'name', st.name,
        'simulations', count(*), 'orders', count(*) filter (where s.order_id is not null),
        'failed', count(*) filter (where s.quote_failed)) as j
      from freight_simulations s join stores st on st.id = s.destination_store_id
      where _in_days(s.created_at, p_from, p_to)
      group by st.id, st.code, st.name
      order by count(*) desc limit 50) x), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(x.j order by x.sims desc, x.route_key) from (
      select s.route_key, count(*) as sims, jsonb_build_object('key', s.route_key,
        'label', _route_label(min(s.origin_store_ids::text)::uuid[], min(s.destination_store_id::text)::uuid),
        'storeCount', min(s.store_count),
        'simulations', count(*), 'visitors', count(distinct s.visitor_id),
        'failed', count(*) filter (where s.quote_failed),
        'orders', count(*) filter (where s.order_id is not null),
        'paid', count(*) filter (where o.paid_at is not null),
        'avgPrice', round(avg(s.price_brl), 2), 'lastAt', max(s.created_at)) as j
      from freight_simulations s left join orders o on o.id = s.order_id
      where _in_days(s.created_at, p_from, p_to)
      group by s.route_key
      order by count(*) desc limit 100) x), '[]'::jsonb));
end;
$$;

-- Faixa da economia mostrada contra o concorrente mais barato.
create or replace function public._savings_bucket(p_failed boolean, p_uber numeric, p_loggi numeric,
                                                  p_correios numeric, p_savings numeric)
returns text
language sql
immutable
as $$
  select case
    when p_failed then 'falhou'
    when p_uber is null and p_loggi is null and p_correios is null then 'sem_comparacao'
    when p_savings is null then 'nao_mais_barata'
    when p_savings < 5 then 'ate_5'
    when p_savings < 15 then '5_a_15'
    else 'acima_15' end;
$$;

-- Preço x concorrentes: economia e conversão por faixa e por número de lojas.
create or replace function public.admin_metrics_pricing(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return (
    select jsonb_build_object(
      'simulations', count(*) filter (where not s.quote_failed),
      'avgPrice', round(avg(s.price_brl) filter (where not s.quote_failed), 2),
      'avgSavings', round(avg(s.savings_brl), 2),
      'cheapest', count(*) filter (where s.savings_brl is not null),
      'withoutUber', count(*) filter (where not s.quote_failed and s.uber_brl is null),
      'avgUber', round(avg(s.uber_brl), 2),
      'avgLoggi', round(avg(s.loggi_brl), 2),
      'avgCorreios', round(avg(s.correios_brl), 2),
      'bySavings', coalesce((select jsonb_agg(jsonb_build_object('bucket', b.bucket, 'simulations', b.sims,
          'orders', b.orders, 'paid', b.paid) order by b.bucket)
        from (select _savings_bucket(s2.quote_failed, s2.uber_brl, s2.loggi_brl, s2.correios_brl, s2.savings_brl) as bucket,
                     count(*) as sims, count(*) filter (where s2.order_id is not null) as orders,
                     count(*) filter (where o2.paid_at is not null) as paid
              from freight_simulations s2 left join orders o2 on o2.id = s2.order_id
              where _in_days(s2.created_at, p_from, p_to)
              group by 1) b), '[]'::jsonb),
      'byStoreCount', coalesce((select jsonb_agg(jsonb_build_object('stores', b.n, 'simulations', b.sims,
          'orders', b.orders, 'paid', b.paid, 'avgPrice', b.avg_price) order by b.n)
        from (select least(s3.store_count, 4) as n, count(*) filter (where not s3.quote_failed) as sims,
                     count(*) filter (where s3.order_id is not null) as orders,
                     count(*) filter (where o3.paid_at is not null) as paid,
                     round(avg(s3.price_brl), 2) as avg_price
              from freight_simulations s3 left join orders o3 on o3.id = s3.order_id
              where _in_days(s3.created_at, p_from, p_to)
              group by 1) b), '[]'::jsonb))
    from freight_simulations s
    where _in_days(s.created_at, p_from, p_to));
end;
$$;

-- Clientes: cadastros, quem pediu, recompra e tempo até o 1º pedido pago.
create or replace function public.admin_metrics_customers(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return (
    with paid as (
      select user_id, paid_at, row_number() over (partition by user_id order by paid_at) as n
      from orders where paid_at is not null and status <> 'cancelled'
    ),
    in_period as (select * from paid where _in_days(paid_at, p_from, p_to))
    select jsonb_build_object(
      'signups', (select count(*) from profiles where _in_days(created_at, p_from, p_to)),
      'signupsWithOrder', (select count(*) from profiles pr where _in_days(pr.created_at, p_from, p_to)
                             and exists (select 1 from paid where paid.user_id = pr.id)),
      'buyers', (select count(distinct user_id) from in_period),
      'firstTimeBuyers', (select count(*) from in_period where n = 1),
      'repeatBuyers', (select count(distinct user_id) from in_period where n >= 2),
      'paidOrders', (select count(*) from in_period),
      'avgDaysToFirstOrder', (select round(avg(extract(epoch from (ip.paid_at - pr.created_at)) / 86400)::numeric, 1)
                               from in_period ip join profiles pr on pr.id = ip.user_id where ip.n = 1),
      'customersTotal', (select count(distinct user_id) from paid),
      'repeatTotal', (select count(*) from (select user_id from paid group by user_id having count(*) >= 2) x),
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'signups', d.n) order by d.day)
        from (select (created_at at time zone 'America/Sao_Paulo')::date as day, count(*)::int as n
              from profiles where _in_days(created_at, p_from, p_to) group by 1) d), '[]'::jsonb)));
end;
$$;

-- Simulações abandonadas: clientes LOGADOS cuja última simulação do período não
-- virou pedido (nem houve pedido deles depois dela). Visitante anônimo não entra.
create or replace function public.admin_metrics_abandoned(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
    select last.created_at, jsonb_strip_nulls(jsonb_build_object(
      'userId', pr.id, 'name', pr.name, 'email', pr.email, 'phone', pr.phone,
      'route', _route_label(last.origin_store_ids, last.destination_store_id),
      'routeKey', last.route_key, 'price', last.price_brl, 'savings', last.savings_brl,
      'failed', last.quote_failed, 'simulatedAt', last.created_at,
      'reachedOrderPage', last.order_page_at is not null,
      'simulations', cnt.n)) as j
    from (
      select distinct on (s.user_id) s.*
      from freight_simulations s
      where s.user_id is not null and _in_days(s.created_at, p_from, p_to)
      order by s.user_id, s.created_at desc
    ) last
    join profiles pr on pr.id = last.user_id
    cross join lateral (select count(*) as n from freight_simulations s2
                        where s2.user_id = last.user_id and _in_days(s2.created_at, p_from, p_to)) cnt
    where last.order_id is null
      and not exists (select 1 from orders o where o.user_id = last.user_id and o.created_at >= last.created_at)
    order by last.created_at desc
    limit 300) x), '[]'::jsonb);
end;
$$;

-- Lojas pedidas: sugestões do formulário e lojas indicadas pelos clientes no perfil,
-- agrupadas pelo nome, marcando se já é parceira ou se está em negociação.
create or replace function public.admin_metrics_store_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return coalesce((select jsonb_agg(x.j order by x.total desc, x.name) from (
    select g.name, g.total, jsonb_strip_nulls(jsonb_build_object(
      'name', g.name, 'total', g.total, 'suggestions', g.sugg, 'customers', g.cust,
      'addresses', g.addresses, 'lastAt', g.last_at, 'contacted', g.contacted,
      'partnerStatus', case
        when exists (select 1 from stores s where lower(btrim(s.name)) = g.k) then 'parceira'
        when exists (select 1 from partner_leads l where lower(btrim(l.store_name)) = g.k) then 'negociacao'
        else null end)) as j
    from (
      select r.k, min(r.name) as name, count(*) as total,
             count(*) filter (where r.src = 'sugestao') as sugg,
             count(*) filter (where r.src = 'cliente') as cust,
             (array_agg(distinct r.address))[1:3] as addresses,
             max(r.created_at) as last_at,
             bool_or(r.contacted) as contacted
      from (
        select lower(btrim(store_name)) as k, btrim(store_name) as name, btrim(store_address) as address,
               created_at, contacted, 'sugestao' as src
        from store_suggestions
        union all
        select lower(btrim(name)), btrim(name), btrim(address), created_at, false, 'cliente'
        from custom_preferred_stores
      ) r
      where r.k <> ''
      group by r.k
    ) g
    order by g.total desc
    limit 200) x), '[]'::jsonb);
end;
$$;

-- Saúde do comparador: pares loja x ponto sem preço (a simulação FALHA), sem Uber
-- (mostra a T1 sem comparar com Uber) e preço parado há mais de p_stale_days dias.
create or replace function public.admin_metrics_comparator(p_stale_days int default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_any_perm(array['indicadores', 'comparador'], 'ver') then
    perform _require_perm('indicadores', 'ver');
  end if;
  return (
    with pairs as (
      select o.id as origin_id, o.code as origin_code, o.name as origin_name,
             d.id as dest_id, d.code as dest_code, d.name as dest_name,
             r.id as route_id, r.uber_brl, r.loggi_brl, r.updated_at
      from stores o
      cross join stores d
      left join freight_routes r on r.origin_store_id = o.id and r.destination_store_id = d.id
      where d.is_pickup_point and o.id <> d.id
        and coalesce(o.published, true) and coalesce(d.published, true)
    ),
    demand as (
      select oid as origin_id, s.destination_store_id as dest_id, count(*) as sims,
             count(*) filter (where s.quote_failed) as failed
      from freight_simulations s cross join lateral unnest(s.origin_store_ids) oid
      where s.created_at > now() - interval '90 days'
      group by 1, 2
    ),
    checked as (
      select p.*, coalesce(dm.sims, 0) as sims, coalesce(dm.failed, 0) as failed,
             case when p.route_id is null then 'sem_rota'
                  when p.uber_brl is null then 'sem_uber'
                  when p.updated_at < now() - make_interval(days => p_stale_days) then 'desatualizado'
             end as issue
      from pairs p left join demand dm on dm.origin_id = p.origin_id and dm.dest_id = p.dest_id
    )
    select jsonb_build_object(
      'pairs', (select count(*) from checked),
      'missingRoute', (select count(*) from checked where issue = 'sem_rota'),
      'missingUber', (select count(*) from checked where issue = 'sem_uber'),
      'stale', (select count(*) from checked where issue = 'desatualizado'),
      'staleDays', p_stale_days,
      'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'originCode', origin_code, 'originName', origin_name, 'destCode', dest_code, 'destName', dest_name,
          'issue', issue, 'updatedAt', updated_at, 'simulations', sims, 'failed', failed))
          order by (issue = 'sem_rota') desc, sims desc, origin_name, dest_name)
        from (select * from checked where issue is not null
              order by (issue = 'sem_rota') desc, sims desc limit 300) t), '[]'::jsonb)));
end;
$$;

-- Resumo para o Dashboard (mesmas regras do funil e de clientes).
create or replace function public.admin_metrics_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('indicadores', 'ver');
  return jsonb_build_object(
    'simulations', (select count(*) from freight_simulations where not quote_failed and _in_days(created_at, p_from, p_to)),
    'failed', (select count(*) from freight_simulations where quote_failed and _in_days(created_at, p_from, p_to)),
    'visitors', (select count(distinct visitor_id) from freight_simulations where _in_days(created_at, p_from, p_to)),
    'paid', (select count(*) from freight_simulations s join orders o on o.id = s.order_id
             where o.paid_at is not null and _in_days(s.created_at, p_from, p_to)),
    'signups', (select count(*) from profiles where _in_days(created_at, p_from, p_to)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  log_simulation(jsonb),
  mark_simulation(uuid, text, text, uuid),
  _freight_routes_touch(),
  _in_days(timestamptz, date, date),
  _route_label(uuid[], uuid),
  _savings_bucket(boolean, numeric, numeric, numeric, numeric),
  admin_metrics_funnel(date, date),
  admin_metrics_demand(date, date),
  admin_metrics_pricing(date, date),
  admin_metrics_customers(date, date),
  admin_metrics_abandoned(date, date),
  admin_metrics_store_requests(),
  admin_metrics_comparator(int),
  admin_metrics_summary(date, date)
from public, anon, authenticated;

grant execute on function log_simulation(jsonb), mark_simulation(uuid, text, text, uuid) to anon, authenticated;
grant execute on function
  admin_metrics_funnel(date, date),
  admin_metrics_demand(date, date),
  admin_metrics_pricing(date, date),
  admin_metrics_customers(date, date),
  admin_metrics_abandoned(date, date),
  admin_metrics_store_requests(),
  admin_metrics_comparator(int),
  admin_metrics_summary(date, date)
to authenticated;

-- Teste da 0024_platform_metrics.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0023 já aplicada.

create table public._t_results (n serial primary key, ok boolean not null, name text not null, info text);
grant all on public._t_results to anon, authenticated;
grant usage on sequence public._t_results_n_seq to anon, authenticated;

create function public._t_check(p_name text, p_ok boolean, p_info text default null)
returns void language sql security definer set search_path = public as $$
  insert into _t_results (ok, name, info) values (coalesce(p_ok, false), p_name, p_info);
$$;

create function public._t_as(p_user uuid, p_anon boolean default false)
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('t1.actor', '', true);
  perform set_config('t1.reason', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', case when p_anon then 'anon' else 'authenticated' end)::text, true);
  if p_anon then
    perform set_config('role', 'anon', true);
  elsif p_user is not null then
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;

create function public._t_err(p_name text, p_sql text, p_expect text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform _t_check(p_name, false, 'não deu erro');
  exception when others then
    perform _t_check(p_name, position(lower(p_expect) in lower(sqlerrm)) > 0, sqlerrm);
  end;
end;
$$;

create function public._t_order(p_origins text[], p_dest text)
returns uuid language plpgsql as $$
begin
  return create_order(jsonb_build_object(
    'originStoreCodes', to_jsonb(p_origins), 'destinationStoreCode', p_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', p_origins[1], 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Carta 9', 'game', 'magic', 'price', 30,
        'priceMode', 'unit', 'quantity', 1))))));
end;
$$;

-- Simulação como o site manda.
create function public._t_sim(p_visitor text, p_origins text[], p_dest text, p_failed boolean default false,
                              p_savings numeric default 5)
returns uuid language sql as $$
  select log_simulation(jsonb_build_object('visitorId', p_visitor, 'originStoreCodes', to_jsonb(p_origins),
    'destinationStoreCode', p_dest, 'failed', p_failed,
    'quote', jsonb_build_object('estimatedDaysMin', 3, 'estimatedDaysMax', 3, 'cheapestSavingsBRL', p_savings,
      'competitors', jsonb_build_array(jsonb_build_object('carrier', 'uber', 'totalBRL', 30),
        jsonb_build_object('carrier', 'loggi', 'totalBRL', 25), jsonb_build_object('carrier', 'correios', 'totalBRL', 18)))));
$$;

do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();    -- Administrador
  v_v uuid := gen_random_uuid();    -- só vê Indicadores
  v_n uuid := gen_random_uuid();    -- admin sem Indicadores
  v_k uuid := gen_random_uuid();    -- só vê Comparador
  v_u uuid := gen_random_uuid();    -- cliente que pede
  v_u2 uuid := gen_random_uuid();   -- cliente que simula e não pede
  r_v uuid; r_n uuid; r_k uuid;
  va constant text := 'visitante-aaaa-0000000001';
  vb constant text := 'visitante-bbbb-0000000002';
  vc constant text := 'visitante-cccc-0000000003';
  vd constant text := 'visitante-dddd-0000000004';
  v_dest text; v_s1 text; v_s2 text; v_s1_id uuid; v_dest_id uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_stale uuid;
  s1 uuid; s1b uuid; s2 uuid; f1 uuid; s3 uuid; o1 uuid; o2 uuid;
  r jsonb; e jsonb;
  v_ok int; v_total int; v_fails text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_v, v_n, v_k, v_u, v_u2]) u;
  insert into staff_roles (name) values ('Só Indicadores') returning id into r_v;
  insert into staff_roles (name) values ('Sem Indicadores') returning id into r_n;
  insert into staff_roles (name) values ('Só Comparador') returning id into r_k;
  insert into staff_role_permissions (role_id, area, can_view) values
    (r_v, 'indicadores', true), (r_n, 'dashboard', true), (r_k, 'comparador', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_v, r_v), (v_n, r_n), (v_k, r_k);
  perform _t_check('área "indicadores" existe nas permissões', 'indicadores' = any (_staff_areas()));

  select code, id into v_dest, v_dest_id from stores where is_pickup_point order by code limit 1;
  select code, id into v_s1, v_s1_id from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;

  -- 1. Registro anônimo -----------------------------------------------------------------
  perform _t_as(null, true);
  s1 := _t_sim(va, array[v_s1], v_dest);
  s1b := _t_sim(va, array[v_s1], v_dest);
  s2 := _t_sim(va, array[v_s2, v_s1], v_dest);
  f1 := _t_sim(vb, array[v_s1], v_dest, true);
  perform _t_check('visitante registra simulação', s1 is not null);
  perform _t_check('recalcular a mesma rota em 2 min não conta duas vezes', s1b = s1);
  perform _t_check('rota diferente vira outra simulação', s2 is not null and s2 <> s1);
  perform _t_check('loja inválida: não grava e não dá erro', _t_sim(va, array['NAOEXISTE'], v_dest) is null);
  perform _t_check('código de navegador inválido: não grava', _t_sim('x', array[v_s1], v_dest) is null);
  perform _t_err('visitante não lê as simulações', 'select count(*) from freight_simulations', 'permission denied');
  perform _t_as(null);
  perform _t_check('simulação anônima, com o preço da T1 calculado no servidor',
    (select user_id is null and store_count = 1 and price_brl = (_pricing_at(now())).base_brl and uber_brl = 30
       and savings_brl = 5 and route_key = v_s1 || '>' || v_dest from freight_simulations where id = s1));
  perform _t_check('rota com 2 lojas guarda as duas, em ordem',
    (select store_count = 2 and route_key like '%+%>' || v_dest from freight_simulations where id = s2));
  perform _t_check('tentativa que falhou fica registrada sem preço',
    (select quote_failed and price_brl is null from freight_simulations where id = f1));

  -- 2. Etapas do funil ------------------------------------------------------------------------
  perform _t_as(null, true);
  perform mark_simulation(s1, vb, 'continued');
  perform _t_as(null);
  perform _t_check('outro navegador não marca etapa', (select continued_at is null from freight_simulations where id = s1));
  perform _t_as(null, true);
  perform mark_simulation(s1, va, 'continued');
  perform mark_simulation(s1, va, 'order_page');
  perform _t_as(null);
  perform _t_check('"continuou" marcado; "chegou ao pedido" exige login',
    (select continued_at is not null and order_page_at is null from freight_simulations where id = s1));
  perform _t_as(v_u);
  perform mark_simulation(s1, va, 'order_page');
  o1 := _t_order(array[v_s1], v_dest);
  perform mark_simulation(s1, va, 'order', o1);
  perform pay_order(o1, 'pix');
  perform _t_as(null);
  perform _t_check('logado: liga à conta e ao pedido', (select order_page_at is not null and user_id = v_u and order_id = o1
    from freight_simulations where id = s1));
  update orders set created_at = created_at - interval '2 days' where id = o1;

  perform _t_as(v_u2);
  o2 := _t_order(array[v_s1], v_dest);
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id = o2;
  perform _t_as(v_u);
  perform mark_simulation(s2, va, 'order', o2);
  perform _t_as(null);
  perform _t_check('não liga a simulação ao pedido de outro cliente', (select order_id is null from freight_simulations where id = s2));
  perform _t_as(v_u2);
  s3 := _t_sim(vc, array[v_s1], v_dest);
  perform _t_err('cliente não lê as simulações', 'select count(*) from freight_simulations', 'permission denied');

  -- 3. Indicadores ----------------------------------------------------------------------------
  perform _t_as(v_a);
  r := admin_metrics_funnel(v_today, v_today);
  perform _t_check('funil conta as etapas', (r ->> 'simulations')::int = 3 and (r ->> 'failed')::int = 1
    and (r ->> 'visitors')::int = 3 and (r ->> 'continued')::int = 1 and (r ->> 'orderPage')::int = 1
    and (r ->> 'ordersCreated')::int = 1 and (r ->> 'paid')::int = 1 and (r ->> 'loggedIn')::int = 2, r::text);
  perform _t_check('funil traz a série por dia', jsonb_array_length(r -> 'daily') >= 1
    and exists (select 1 from jsonb_array_elements(r -> 'daily') d where (d ->> 'day')::date = v_today
                and (d ->> 'simulations')::int = 3));
  perform _t_check('período sem dados: tudo zero', (admin_metrics_funnel(v_today - 400, v_today - 399) ->> 'simulations')::int = 0);

  r := admin_metrics_demand(v_today, v_today);
  e := (select x from jsonb_array_elements(r -> 'routes') x where x ->> 'key' = v_s1 || '>' || v_dest);
  perform _t_check('demanda: rota com simulações, falha e pedido', (e ->> 'simulations')::int = 3
    and (e ->> 'failed')::int = 1 and (e ->> 'orders')::int = 1 and (e ->> 'paid')::int = 1 and (e ->> 'visitors')::int = 3, e::text);
  perform _t_check('demanda: loja de coleta e ponto mais buscados',
    exists (select 1 from jsonb_array_elements(r -> 'origins') x where x ->> 'code' = v_s1 and (x ->> 'simulations')::int = 4)
    and exists (select 1 from jsonb_array_elements(r -> 'destinations') x where x ->> 'code' = v_dest and (x ->> 'simulations')::int = 4));

  r := admin_metrics_pricing(v_today, v_today);
  perform _t_check('preço: economia média e conversão por faixa', (r ->> 'avgSavings')::numeric = 5
    and (r ->> 'cheapest')::int = 3
    and exists (select 1 from jsonb_array_elements(r -> 'bySavings') x where x ->> 'bucket' = '5_a_15' and (x ->> 'paid')::int = 1)
    and exists (select 1 from jsonb_array_elements(r -> 'bySavings') x where x ->> 'bucket' = 'falhou' and (x ->> 'simulations')::int = 1)
    and exists (select 1 from jsonb_array_elements(r -> 'byStoreCount') x where (x ->> 'stores')::int = 2 and (x ->> 'simulations')::int = 1), r::text);

  r := admin_metrics_customers(v_today, v_today);
  perform _t_check('clientes: cadastros e quem pagou', (r ->> 'signups')::int >= 6 and (r ->> 'buyers')::int >= 1
    and (r ->> 'firstTimeBuyers')::int >= 1, r::text);

  r := admin_metrics_abandoned(v_today, v_today);
  perform _t_check('abandonadas: cliente logado que simulou e não pediu',
    exists (select 1 from jsonb_array_elements(r) x where (x ->> 'userId')::uuid = v_u2 and x ->> 'routeKey' = v_s1 || '>' || v_dest), r::text);
  perform _t_check('abandonadas: quem pediu não aparece e anônimo também não',
    not exists (select 1 from jsonb_array_elements(r) x where (x ->> 'userId')::uuid = v_u or x ->> 'userId' is null));

  perform _t_as(null);
  insert into store_suggestions (store_name, store_address) values ('Loja Nove Teste', 'Rua A, 1'), (' loja nove teste', 'Rua B, 2');
  insert into custom_preferred_stores (profile_id, name, address) values (v_u, 'LOJA NOVE TESTE', 'Rua A, 1');
  perform _t_as(v_a);
  e := (select x from jsonb_array_elements(admin_metrics_store_requests()) x where lower(x ->> 'name') = 'loja nove teste');
  perform _t_check('lojas pedidas: agrupa sugestões e indicações pelo nome', (e ->> 'total')::int = 3
    and (e ->> 'suggestions')::int = 2 and (e ->> 'customers')::int = 1, e::text);

  -- Saúde do comparador: sem rota (falha), sem Uber e desatualizado.
  perform _t_as(null);
  delete from freight_routes where origin_store_id = v_s1_id and destination_store_id = v_dest_id;
  update freight_routes set uber_brl = null
    where id = (select id from freight_routes where destination_store_id = v_dest_id order by id limit 1);
  select id into v_stale from freight_routes where destination_store_id = v_dest_id and uber_brl is not null order by id limit 1;
  update freight_routes set updated_at = now() - interval '200 days' where id = v_stale;
  perform _t_as(v_a);
  r := admin_metrics_comparator(90);
  perform _t_check('comparador: par sem rota aparece primeiro, com a demanda',
    r -> 'items' -> 0 ->> 'issue' = 'sem_rota'
    and exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'originCode' = v_s1 and x ->> 'destCode' = v_dest
                and x ->> 'issue' = 'sem_rota' and (x ->> 'simulations')::int >= 3), (r - 'items')::text);
  perform _t_check('comparador: conta sem Uber e desatualizado', (r ->> 'missingUber')::int >= 1 and (r ->> 'stale')::int >= 1, (r - 'items')::text);
  perform _t_as(null);
  update freight_routes set loggi_brl = loggi_brl + 1 where id = v_stale;
  perform _t_check('mudar o preço atualiza a data', (select updated_at = now() from freight_routes where id = v_stale));

  -- 4. Permissões -------------------------------------------------------------------------------
  perform _t_as(v_v);
  perform _t_check('quem vê Indicadores lê o resumo', (admin_metrics_summary(v_today, v_today) ->> 'simulations')::int = 3);
  perform _t_as(v_k);
  perform _t_check('quem vê o Comparador lê a saúde do comparador', (admin_metrics_comparator(90) ->> 'pairs')::int >= 1);
  perform _t_err('quem vê o Comparador não lê o funil', format('select admin_metrics_funnel(%L, %L)', v_today, v_today), 'não permite');
  perform _t_as(v_n);
  perform _t_err('admin sem Indicadores não lê', format('select admin_metrics_demand(%L, %L)', v_today, v_today), 'não permite');
  perform _t_as(v_u);
  perform _t_err('cliente não lê indicadores', format('select admin_metrics_abandoned(%L, %L)', v_today, v_today), 'restrito');

  -- 5. Limite por navegador (60 por hora) ---------------------------------------------------------
  perform _t_as(null);
  insert into freight_simulations (visitor_id, origin_store_ids, destination_store_id, store_count, route_key, created_at)
  select vd, array[v_s1_id], v_dest_id, 1, 'x' || g, now() - interval '10 minutes' from generate_series(1, 60) g;
  perform _t_as(null, true);
  perform _t_check('limite de 60 por hora: não grava mais', _t_sim(vd, array[v_s2], v_dest) is null);

  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
