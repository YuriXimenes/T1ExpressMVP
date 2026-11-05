-- TESTE da 0019 para colar no SQL Editor do Supabase. NAO grava nada:
-- roda a migracao + o teste numa transacao e termina com um erro proposital
-- que desfaz tudo. ANTES, aplique migrations/0019a_stage_values.sql.
-- Gerado de migrations/0019_stage_flow.sql + tests/0019_stage_flow_test.sql.

begin;

-- Etapas novas do pedido (parte 2 de 2). Precisa da 0019a_stage_values.sql
-- aplicada antes. Ver rollback/0019_down.sql.
--
-- Fluxo: Aguardando coleta → Em transporte para coleta (viagem de coleta
-- iniciou) → A caminho da central (valor 'em-transporte': coletado em todas as
-- lojas) → Recebido na central (equipe T1 marca) → Em transporte para retirada
-- (viagem de entrega iniciou) → Disponível para retirada (entregador deixou no
-- ponto). Todo pedido passa pela central antes da entrega.

-- ---------------------------------------------------------------------------
-- 1. Rótulo novo da custódia "recebido_na_base" fica só na tela; nada aqui.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. Kanban: as 6 etapas na ordem
-- ---------------------------------------------------------------------------
create or replace function public.admin_move_order(p_order uuid, p_target text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stages text[] := array['aguardando-coleta', 'em-transporte-coleta', 'em-transporte',
    'recebido-na-central', 'em-transporte-retirada', 'disponivel-para-retirada'];
  v_from int;
  v_to int;
begin
  perform _require_admin();
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'O motivo é longo demais.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Este pedido já está finalizado.' using errcode = 'P0001';
  end if;

  perform set_config('t1.actor', 'admin', true);
  perform set_config('t1.reason', coalesce(v_reason, ''), true);

  if p_target = 'cancelled' then
    if v_reason is null then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    update orders set status = 'cancelled', cancel_reason = v_reason where id = p_order;
    return;
  end if;

  if v_order.status = 'pending-payment' then
    raise exception 'O pedido ainda não foi pago: ele só pode ser cancelado.' using errcode = 'P0001';
  end if;

  if p_target = 'completed' then
    if v_order.delivery_stage is distinct from 'disponivel-para-retirada' and v_reason is null then
      raise exception 'Informe o motivo para concluir antes da retirada.' using errcode = 'P0001';
    end if;
    update orders set status = 'completed', completed_at = now() where id = p_order;
    return;
  end if;

  v_to := array_position(v_stages, p_target);
  if v_to is null then
    raise exception 'Destino inválido.' using errcode = 'P0001';
  end if;
  v_from := array_position(v_stages, v_order.delivery_stage::text);
  if v_to = v_from then
    raise exception 'O pedido já está nessa etapa.' using errcode = 'P0001';
  end if;
  if v_to <> v_from + 1 and v_reason is null then
    raise exception 'Informe o motivo para voltar ou pular etapas.' using errcode = 'P0001';
  end if;
  update orders set delivery_stage = p_target::delivery_stage where id = p_order;
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
    when 'aguardando-coleta' then 'em-transporte-coleta'::delivery_stage
    when 'em-transporte-coleta' then 'em-transporte'::delivery_stage
    when 'em-transporte' then 'recebido-na-central'::delivery_stage
    when 'recebido-na-central' then 'em-transporte-retirada'::delivery_stage
    when 'em-transporte-retirada' then 'disponivel-para-retirada'::delivery_stage
    else null end;
  if v_next is null then
    raise exception 'O pedido já está na última etapa.' using errcode = 'P0001';
  end if;
  update orders set delivery_stage = v_next where id = p_order;
  return v_next;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Planejamento
-- ---------------------------------------------------------------------------
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
    where o.status = 'active' and o.delivery_stage in ('aguardando-coleta', 'em-transporte-coleta')
      and not exists (
        select 1 from route_stop_orders so
        join route_stops s on s.id = so.stop_id
        join routes ro on ro.id = s.route_id
        where so.order_id = o.id and s.store_id = oos.store_id
          and ro.kind = 'coleta' and so.result = 'coletado'
      );
end;
$$;

drop function if exists public.admin_delivery_backlog();
-- O que falta entregar: pedidos recebidos na central, no ponto de retirada.
-- checked: a conferência já foi salva (sem ela a tela só avisa).
create or replace function public.admin_delivery_backlog()
returns table (order_id uuid, store_id uuid, store_code text, open_route_id uuid, checked boolean)
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
         limit 1),
      exists (select 1 from order_item_checks c where c.order_id = o.id)
    from orders o
    join stores st on st.id = o.destination_store_id
    where o.status = 'active' and o.delivery_stage = 'recebido-na-central';
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Viagem: transições automáticas
-- ---------------------------------------------------------------------------
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
  -- Coleta: o entregador saiu para buscar. Entrega: saiu da central para o ponto.
  perform set_config('t1.actor', 'driver', true);
  update orders o set delivery_stage = 'em-transporte-coleta'
    where o.status = 'active' and o.delivery_stage = 'aguardando-coleta' and o.id in (
      select so.order_id from route_stop_orders so
      join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
      where r.trip_id = p_trip and r.kind = 'coleta' and r.status <> 'cancelada' and so.result is null);
  update orders o set delivery_stage = 'em-transporte-retirada'
    where o.status = 'active' and o.delivery_stage = 'recebido-na-central' and o.id in (
      select so.order_id from route_stop_orders so
      join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
      where r.trip_id = p_trip and r.kind = 'entrega' and r.status <> 'cancelada' and so.result is null);
  if p_lat is not null and p_lng is not null then
    insert into trip_positions (trip_id, lat, lng) values (p_trip, p_lat, p_lng);
  end if;
end;
$$;

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
    -- Todas as lojas do pedido coletadas: a caminho da central.
    if o.status = 'active' and o.delivery_stage in ('aguardando-coleta', 'em-transporte-coleta') and not exists (
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
    if o.status <> 'active' or o.delivery_stage is distinct from 'em-transporte-retirada' then
      raise exception 'O pedido #% não está em transporte para retirada.', upper(left(p_order::text, 8)) using errcode = 'P0001';
    end if;
    update orders set delivery_stage = 'disponivel-para-retirada' where id = p_order;
    insert into custody_events (order_id, action, store_id, responsible_name, note, recorded_by)
    values (p_order, 'entregue_no_ponto', v_store, v_driver_name,
            case when p_contact is not null then 'Recebido por ' || p_contact end, auth.uid());
  end if;
end;
$$;

-- Ao finalizar ou cancelar a viagem: pedido que não saiu volta uma etapa.
-- Coleta sem todas as lojas coletadas → Aguardando coleta; entrega não feita →
-- Recebido na central. Pedido que está em outra viagem em andamento fica como está.
create or replace function public._trip_revert_stages(p_trip uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('t1.reason', p_reason, true);
  update orders o set delivery_stage = 'aguardando-coleta'
    where o.status = 'active' and o.delivery_stage = 'em-transporte-coleta'
      and o.id in (
        select so.order_id from route_stop_orders so
        join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
        where r.trip_id = p_trip and r.kind = 'coleta')
      and not exists (
        select 1 from route_stop_orders so
        join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
        join trips t on t.id = r.trip_id
        where so.order_id = o.id and r.kind = 'coleta' and so.result is null
          and t.id <> p_trip and t.status = 'em_andamento');
  update orders o set delivery_stage = 'recebido-na-central'
    where o.status = 'active' and o.delivery_stage = 'em-transporte-retirada'
      and o.id in (
        select so.order_id from route_stop_orders so
        join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
        where r.trip_id = p_trip and r.kind = 'entrega' and so.result is distinct from 'entregue')
      and not exists (
        select 1 from route_stop_orders so
        join route_stops s on s.id = so.stop_id join routes r on r.id = s.route_id
        join trips t on t.id = r.trip_id
        where so.order_id = o.id and r.kind = 'entrega' and so.result is null
          and t.id <> p_trip and t.status = 'em_andamento');
  perform set_config('t1.reason', '', true);
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
  perform set_config('t1.actor', 'driver', true);
  perform _trip_revert_stages(p_trip, 'Viagem finalizada sem concluir este pedido');
  if p_lat is not null and p_lng is not null then
    insert into trip_positions (trip_id, lat, lng) values (p_trip, p_lat, p_lng);
  end if;
end;
$$;

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
  -- Antes de soltar as rotas da viagem: depois a volta não acharia os pedidos.
  perform set_config('t1.actor', 'admin', true);
  perform _trip_revert_stages(p_trip, 'Viagem cancelada: ' || btrim(p_reason));
  update routes r set trip_id = null, status = 'aguardando'
    where r.trip_id = p_trip and not exists (
      select 1 from route_stops s where s.route_id = r.id and s.status <> 'aguardando');
  update routes set status = 'concluida' where trip_id = p_trip;
  update trips set status = 'cancelada', cancel_reason = btrim(p_reason) where id = p_trip;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. Página do QR: entregador confirma só o que saiu para retirada
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 6. Chegada na central
-- ---------------------------------------------------------------------------
-- Marca pedidos "A caminho da central" como recebidos: etapa + custódia.
create or replace function public.admin_mark_at_central(p_orders uuid[], p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  o orders%rowtype;
  v_n int := 0;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;
  if not has_any_perm(array['pedidos', 'coletas'], 'editar') then
    raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_orders, 1), 0) = 0 then
    raise exception 'Escolha ao menos um pedido.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'A observação é longa demais.' using errcode = 'P0001';
  end if;
  perform set_config('t1.actor', 'admin', true);
  foreach v_order in array p_orders loop
    select * into o from orders where id = v_order for update;
    if not found then
      raise exception 'Pedido não encontrado.' using errcode = 'P0001';
    end if;
    if o.status <> 'active' or o.delivery_stage is distinct from 'em-transporte' then
      raise exception 'O pedido #% não está a caminho da central.', upper(left(v_order::text, 8)) using errcode = 'P0001';
    end if;
    update orders set delivery_stage = 'recebido-na-central' where id = v_order;
    insert into custody_events (order_id, action, location_note, note, recorded_by)
    values (v_order, 'recebido_na_base', 'Central T1', v_note, auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Pedidos coletados nesta viagem que ainda não foram recebidos na central.
create or replace function public.admin_trip_central_candidates(p_trip uuid)
returns table (order_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_any_perm(array['coletas', 'pedidos'], 'ver') then
    perform _require_perm('coletas', 'ver');
  end if;
  return query
    select distinct o.id
    from route_stop_orders so
    join route_stops s on s.id = so.stop_id
    join routes r on r.id = s.route_id
    join orders o on o.id = so.order_id
    where r.trip_id = p_trip and r.kind = 'coleta' and so.result = 'coletado'
      and o.status = 'active' and o.delivery_stage = 'em-transporte';
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  admin_delivery_backlog(),
  _trip_revert_stages(uuid, text),
  admin_mark_at_central(uuid[], text),
  admin_trip_central_candidates(uuid)
from public, anon, authenticated;

grant execute on function
  admin_delivery_backlog(),
  admin_mark_at_central(uuid[], text),
  admin_trip_central_candidates(uuid)
to authenticated;

-- Teste da 0019_stage_flow.sql. Roda DEPOIS da migração, na MESMA transação,
-- e termina com um erro proposital que desfaz tudo (nada fica gravado).
-- Precisa da 0019a_stage_values.sql já aplicada.

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


do $test$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_a uuid := gen_random_uuid();   -- Administrador
  v_d uuid := gen_random_uuid();   -- entregador
  v_c uuid := gen_random_uuid();   -- cliente
  v_driver uuid;
  v_dest text; v_s1 text; v_s2 text;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  x uuid; y uuid; z uuid;
  v_coleta uuid; v_entrega uuid; v_entrega_z uuid;
  v_trip1 uuid; v_trip2 uuid; v_trip3 uuid;
  v_stop1 uuid; v_stop2 uuid;
  v_token text;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas e pedidos de teste (somem no fim) ------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_d, v_c]) u;
  insert into admins (user_id, role_id) values (v_a, c_admin);
  insert into team_members (name, kind, user_id) values ('Entregador Teste', 'entregador', v_d) returning id into v_driver;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select code into v_s2 from stores where code not in (v_dest, v_s1) order by code limit 1;

  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1, v_s2), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'X', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  y := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Y', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  z := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s2), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s2, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'Z', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  -- Pedido criado na mesma transação: o gatilho da linha do tempo trata mudanças
  -- no mesmo instante da criação como parte dela. "Envelhece" os pedidos.
  perform _t_as(null);
  update orders set created_at = created_at - interval '2 days' where id in (x, y, z);
  perform _t_as(v_c);
  perform pay_order(x, 'pix');
  perform pay_order(y, 'pix');
  perform pay_order(z, 'pix');

  -- 2. Kanban: 6 etapas ---------------------------------------------------------------
  perform _t_as(v_a);
  perform admin_move_order(z, 'em-transporte-coleta');
  perform _t_as(null);
  perform _t_check('Kanban avança uma etapa sem motivo',
    (select delivery_stage = 'em-transporte-coleta' from orders where id = z));
  perform _t_as(v_a);
  perform _t_err('Kanban pula etapa sem motivo', format('select admin_move_order(%L, %L)', z, 'recebido-na-central'), 'motivo');
  perform admin_move_order(z, 'recebido-na-central', 'Chegou junto com outro lote');
  perform _t_as(null);
  perform _t_check('Kanban pula etapa com motivo',
    (select delivery_stage = 'recebido-na-central' from orders where id = z));

  -- 3. Coleta: iniciar a viagem leva para "Em transporte para coleta" ------------------
  perform _t_as(v_a);
  v_coleta := admin_create_route('coleta', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_s1, 'orderIds', jsonb_build_array(x, y)),
    jsonb_build_object('storeCode', v_s2, 'orderIds', jsonb_build_array(x))));
  v_trip1 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_coleta)));
  perform admin_send_trip(v_trip1);
  perform _t_as(null);
  perform _t_check('viagem enviada ainda não muda a etapa',
    (select delivery_stage = 'aguardando-coleta' from orders where id = x));
  select id into v_stop1 from route_stops where route_id = v_coleta and position = 1;
  select id into v_stop2 from route_stops where route_id = v_coleta and position = 2;
  perform _t_as(v_d);
  perform driver_start_trip(v_trip1, 1000);
  perform _t_as(null);
  perform _t_check('viagem iniciada: pedidos em transporte para coleta',
    (select count(*) = 2 from orders where id in (x, y) and delivery_stage = 'em-transporte-coleta'));
  perform _t_check('linha do tempo: mudança feita pelo entregador',
    exists (select 1 from order_events where order_id = x and kind = 'stage_changed'
            and to_value = 'em-transporte-coleta' and actor_kind = 'driver'));

  -- 4. Coletou em todas as lojas: "A caminho da central" ---------------------------------
  perform _t_as(v_d);
  perform driver_record_stop(v_stop1, jsonb_build_object('reason', 'pedido_nao_pronto', 'orders', jsonb_build_array(
    jsonb_build_object('orderId', x, 'ok', true), jsonb_build_object('orderId', y, 'ok', false))));
  perform _t_as(null);
  perform _t_check('faltando loja, o pedido segue em transporte para coleta',
    (select delivery_stage = 'em-transporte-coleta' from orders where id = x));
  perform _t_as(v_a);
  perform _t_check('pedido não coletado volta ao planejamento de coletas',
    exists (select 1 from admin_collection_backlog() where order_id = y and open_route_id is null));
  perform _t_as(v_d);
  perform driver_record_stop(v_stop2, jsonb_build_object('orders', jsonb_build_array(
    jsonb_build_object('orderId', x, 'ok', true))));
  perform _t_as(null);
  perform _t_check('coletado em todas as lojas: a caminho da central',
    (select delivery_stage = 'em-transporte' from orders where id = x));
  perform _t_as(v_a);
  select count(*) into v_n from admin_trip_central_candidates(v_trip1);
  perform _t_check('candidatos à central: só o coletado',
    v_n = 1 and exists (select 1 from admin_trip_central_candidates(v_trip1) where order_id = x));

  -- 5. Finalizar: o que não saiu volta para "Aguardando coleta" -----------------------------
  perform _t_as(v_d);
  perform driver_finish_trip(v_trip1, 1030);
  perform _t_as(null);
  perform _t_check('não coletado volta para aguardando coleta',
    (select delivery_stage = 'aguardando-coleta' from orders where id = y));
  perform _t_check('a volta entra na linha do tempo com motivo',
    exists (select 1 from order_events where order_id = y and kind = 'stage_changed'
            and to_value = 'aguardando-coleta' and reason like 'Viagem finalizada%'));
  perform _t_check('coletado continua a caminho da central',
    (select delivery_stage = 'em-transporte' from orders where id = x));

  -- 6. Chegada na central ------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('entrega exige pedido recebido na central',
    format('select admin_create_route(''entrega'', %L, %L::jsonb)', v_day,
      jsonb_build_array(jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(x)))), 'não está pronto');
  perform _t_err('central só aceita pedido a caminho', format('select admin_mark_at_central(%L::uuid[])', array[y]),
    'não está a caminho');
  perform _t_as(v_c);
  perform _t_err('cliente não marca chegada', format('select admin_mark_at_central(%L::uuid[])', array[x]),
    'Acesso restrito');
  perform _t_as(v_a);
  perform _t_check('marcou 1 pedido', admin_mark_at_central(array[x], 'Lote da manhã') = 1);
  perform _t_as(null);
  perform _t_check('recebido na central, com custódia',
    (select delivery_stage = 'recebido-na-central' from orders where id = x)
    and exists (select 1 from custody_events where order_id = x and action = 'recebido_na_base'));
  perform _t_as(v_a);
  perform _t_check('planejamento de entregas mostra o pedido com conferência pendente',
    exists (select 1 from admin_delivery_backlog() where order_id = x and not checked and open_route_id is null));

  -- 7. Entrega: iniciar leva para "Em transporte para retirada"; QR deixa disponível ------
  v_entrega := admin_create_route('entrega', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(x))));
  v_trip2 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_entrega)));
  perform admin_send_trip(v_trip2);
  perform _t_as(null);
  select package_token into v_token from order_pickups where order_id = x;
  perform _t_as(v_d);
  perform _t_check('antes de iniciar, o QR não libera a entrega',
    not (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  perform driver_start_trip(v_trip2, 1100);
  perform _t_as(null);
  perform _t_check('viagem de entrega iniciada: em transporte para retirada',
    (select delivery_stage = 'em-transporte-retirada' from orders where id = x));
  perform _t_as(v_d);
  perform _t_check('QR libera a entrega para o entregador', (pickup_lookup(v_token) ->> 'driverCanDeliver')::boolean);
  r := driver_deliver_by_token(v_token, '{"contactName": "Lojista"}'::jsonb);
  perform _t_as(null);
  perform _t_check('entregue: disponível para retirada',
    (select delivery_stage = 'disponivel-para-retirada' from orders where id = x));

  -- 8. Cancelar a viagem: entrega não feita volta para a central -----------------------------
  perform _t_as(v_a);
  v_entrega_z := admin_create_route('entrega', v_day, jsonb_build_array(
    jsonb_build_object('storeCode', v_dest, 'orderIds', jsonb_build_array(z))));
  v_trip3 := admin_save_trip(null, jsonb_build_object('day', v_day, 'driverId', v_driver,
    'routeIds', jsonb_build_array(v_entrega_z)));
  perform admin_send_trip(v_trip3);
  perform _t_as(v_d);
  perform driver_start_trip(v_trip3, 1200);
  perform _t_as(null);
  perform _t_check('z saiu para retirada', (select delivery_stage = 'em-transporte-retirada' from orders where id = z));
  perform _t_as(v_a);
  perform admin_cancel_trip(v_trip3, 'Moto quebrou');
  perform _t_as(null);
  perform _t_check('viagem cancelada: z volta para recebido na central',
    (select delivery_stage = 'recebido-na-central' from orders where id = z));
  perform _t_check('a volta registra o motivo do cancelamento',
    exists (select 1 from order_events where order_id = z and kind = 'stage_changed'
            and to_value = 'recebido-na-central' and reason like 'Viagem cancelada: Moto quebrou%'));

  -- 9. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
