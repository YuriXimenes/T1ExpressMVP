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
