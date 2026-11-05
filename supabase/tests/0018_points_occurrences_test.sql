-- Teste da 0018_points_occurrences.sql. Roda DEPOIS da migração, na MESMA
-- transação, e termina com um erro proposital que desfaz tudo (nada fica
-- gravado). Montado junto com a migração em 0018_teste_para_sql_editor.sql.

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
  v_nc uuid := gen_random_uuid();  -- backoffice só com dashboard
  v_c uuid := gen_random_uuid();   -- cliente dono do pedido
  v_c2 uuid := gen_random_uuid();  -- outro cliente
  v_d uuid := gen_random_uuid();   -- entregador
  v_role uuid;
  v_driver uuid;
  v_dest text; v_s1 text;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  x uuid;
  v_t_missing uuid; v_t_theft uuid;
  v_occ uuid; v_occ2 uuid; v_type uuid;
  v_trip uuid; v_route uuid; v_stop uuid;
  v_coupon text;
  r jsonb;
  v_n int;
  v_ok int; v_total int; v_fails text;
begin
  -- 1. Pessoas e pedido de teste (somem no fim) ------------------------------------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 't1.teste.' || left(u::text, 8) || '@example.com', json_build_object('name', 'Teste ' || left(u::text, 4))
  from unnest(array[v_a, v_nc, v_c, v_c2, v_d]) u;
  insert into staff_roles (name) values ('Só dashboard') returning id into v_role;
  insert into staff_role_permissions (role_id, area, can_view) values (v_role, 'dashboard', true);
  insert into admins (user_id, role_id) values (v_a, c_admin), (v_nc, v_role);
  insert into team_members (name, kind, user_id) values ('Entregador Teste', 'entregador', v_d) returning id into v_driver;

  select code into v_dest from stores where is_pickup_point order by code limit 1;
  select code into v_s1 from stores where code <> v_dest order by code limit 1;
  select id into v_t_missing from occurrence_types where name = 'Carta faltando';
  select id into v_t_theft from occurrence_types where name = 'Furto';

  perform _t_as(v_c);
  x := create_order(jsonb_build_object(
    'originStoreCodes', jsonb_build_array(v_s1), 'destinationStoreCode', v_dest,
    'quote', jsonb_build_object('estimatedDaysMin', 2, 'estimatedDaysMax', 4),
    'groups', jsonb_build_array(jsonb_build_object('storeCode', v_s1, 'kind', 'cartas-avulsas',
      'cardItems', jsonb_build_array(jsonb_build_object('cardName', 'X', 'game', 'magic', 'price', 1, 'priceMode', 'unit', 'quantity', 1))))));
  perform pay_order(x, 'pix');

  -- 2. Dias úteis e tipos -------------------------------------------------------------
  perform _t_as(null);
  perform _t_check('feriados: carnaval, Corpus Christi e Consciência Negra',
    _is_holiday('2026-02-17') and _is_holiday('2026-06-04') and _is_holiday('2026-11-20') and not _is_holiday('2026-11-18'));
  perform _t_check('3 dias úteis a partir de sexta pulam o fim de semana',
    _add_business_days('2026-11-13 15:00-03', 3) = '2026-11-18 15:00-03'::timestamptz,
    _add_business_days('2026-11-13 15:00-03', 3)::text);
  perform _t_check('3 dias úteis pulam feriado',
    _add_business_days('2026-11-19 10:00-03', 3) = '2026-11-25 10:00-03'::timestamptz,
    _add_business_days('2026-11-19 10:00-03', 3)::text);
  perform _t_check('8 tipos iniciais, 3 do sistema',
    (select count(*) = 8 and count(system_kind) = 3 from occurrence_types));
  perform _t_as(v_c);
  select count(*) into v_n from occurrence_types where customer_can;
  perform _t_check('cliente lê os tipos liberados para ele', v_n = 3);
  select count(*) into v_n from occurrences;
  perform _t_check('cliente não lê a tabela de ocorrências direto', v_n = 0);
  perform _t_as(null, true);
  perform _t_err('anon não lê ocorrências', 'select count(*) from occurrences', 'permission denied');

  -- 3. Pontos de retirada ---------------------------------------------------------------
  perform _t_as(null);
  update orders set delivery_stage = 'em-transporte' where id = x;
  update orders set delivery_stage = 'disponivel-para-retirada' where id = x;
  perform _t_check('pacote no ponto ganha data e prazo de guarda',
    (select available_at is not null and abs(extract(epoch from guard_until - available_at) - 7 * 86400) < 5
     from order_pickups where order_id = x));
  perform _t_as(v_a);
  perform _t_err('horário com dia inválido',
    format('select admin_update_pickup_point(%L, %L::jsonb)', v_dest, '{"hours": {"9": "10h"}}'), 'Horários');
  perform _t_err('capacidade zero',
    format('select admin_update_pickup_point(%L, %L::jsonb)', v_dest, '{"capacity": 0, "guardDays": 7}'), 'Capacidade');
  perform admin_update_pickup_point(v_dest, '{"hours": {"1": "10:00-19:00", "2": " "}, "capacity": 50, "guardDays": 10}');
  perform _t_as(null);
  perform _t_check('ponto configurado (dia vazio some)',
    (select pickup_capacity = 50 and guard_days = 10 and pickup_hours = '{"1": "10:00-19:00"}'::jsonb
     from stores where code = v_dest));
  perform _t_as(v_a);
  r := admin_pickup_points();
  perform _t_check('lista de pontos mostra o pacote guardado',
    exists (select 1 from jsonb_array_elements(r) e where e ->> 'code' = v_dest and (e ->> 'stored')::int >= 1), r::text);
  r := admin_point_packages(v_dest);
  perform _t_check('pacotes do ponto', exists (select 1 from jsonb_array_elements(r) e where (e ->> 'orderId')::uuid = x));
  perform _t_as(v_nc);
  perform _t_err('perfil sem pontos não vê', 'select admin_pickup_points()', 'não permite');

  -- 4. Prazo de guarda vencido: ocorrência automática ------------------------------------------
  perform _t_as(null);
  update order_pickups set guard_until = now() - interval '1 day' where order_id = x;
  perform _t_as(v_a);
  r := admin_occurrence_summary();
  perform _t_check('resumo conta prazo vencido', (r ->> 'guardExpired')::int >= 1, r::text);
  perform admin_occurrence_summary();
  perform _t_as(null);
  select count(*) into v_n from occurrences c join occurrence_types t on t.id = c.type_id
    where c.order_id = x and t.system_kind = 'guarda_vencida';
  perform _t_check('uma ocorrência de prazo vencido (sem repetir)', v_n = 1);
  perform _t_check('linha do tempo do pedido: ocorrência aberta pelo sistema',
    exists (select 1 from order_events where order_id = x and kind = 'occurrence' and to_value = 'aberta' and actor_kind = 'system'));
  perform _t_as(v_a);
  perform _t_err('prorrogar para o passado', format('select admin_extend_guard(%L, %L, %L)', x, v_day - 1, 'teste'), 'futuro');
  perform admin_extend_guard(x, v_day + 5, 'Cliente viajando');
  perform _t_as(null);
  perform _t_check('prazo prorrogado e registrado',
    (select guard_until > now() + interval '4 days' from order_pickups where order_id = x)
    and exists (select 1 from order_events where order_id = x and kind = 'pickup_deadline'));

  -- 5. Cliente abre e acompanha --------------------------------------------------------------
  perform _t_as(v_c);
  perform _t_err('cliente não abre tipo de entregador',
    format('select customer_open_occurrence(%L, %L, %L)', x, v_t_theft, 'Sumiu o pacote do ponto'), 'tipos da lista');
  perform _t_err('descrição curta', format('select customer_open_occurrence(%L, %L, %L)', x, v_t_missing, 'faltou'), '10 letras');
  r := customer_open_occurrence(x, v_t_missing, 'Faltou a carta Y no pacote');
  v_occ := (r ->> 'id')::uuid;
  perform _t_check('cliente abriu a ocorrência', v_occ is not null and (r ->> 'number')::int >= 1001, r::text);
  perform _t_as(v_c2);
  perform _t_err('outro cliente não abre no pedido', format('select customer_open_occurrence(%L, %L, %L)', x, v_t_missing,
    'Faltou a carta Y no pacote'), 'não encontrado');
  perform _t_err('outro cliente não vê', format('select my_order_occurrences(%L)', x), 'não encontrado');
  perform _t_err('outro cliente não comenta', format('select occurrence_comment(%L, %L)', v_occ, 'oi'), 'não encontrada');

  -- 6. Admin trata ------------------------------------------------------------------------------
  perform _t_as(v_a);
  perform admin_update_occurrence(v_occ, jsonb_build_object('status', 'em_analise', 'assigneeId', v_a,
    'comment', 'Conferindo as fotos', 'internal', true));
  perform admin_update_occurrence(v_occ, jsonb_build_object('comment', 'Estamos verificando com a loja.'));
  perform _t_err('cupom sem valor', format('select admin_add_resolution(%L, %L::jsonb)', v_occ, '{"kind": "cupom"}'), 'valor');
  r := admin_add_resolution(v_occ, '{"kind": "cupom", "amountBrl": 15, "couponType": "flat", "note": "nota interna"}');
  v_coupon := r ->> 'couponCode';
  perform _t_as(null);
  perform _t_check('cupom criado de verdade',
    exists (select 1 from coupons where code = v_coupon and value = 15 and active), v_coupon);
  perform _t_as(v_c);
  perform occurrence_comment(v_occ, 'Obrigado!');
  r := my_order_occurrences(x) -> 0;
  perform _t_check('cliente vê status, comentário público e cupom',
    r ->> 'status' = 'em_analise' and r -> 'resolutions' -> 0 ->> 'couponCode' = v_coupon
    and exists (select 1 from jsonb_array_elements(r -> 'updates') u where u ->> 'body' = 'Estamos verificando com a loja.'), r::text);
  perform _t_check('cliente não vê nota interna, responsável nem nota da resolução',
    not exists (select 1 from jsonb_array_elements(r -> 'updates') u where u ->> 'body' = 'Conferindo as fotos'
                or (u ->> 'internal')::boolean)
    and r -> 'assigneeName' is null and r -> 'resolutions' -> 0 -> 'note' is null, r::text);

  -- 7. Resolve, encerra sozinha e reabre ---------------------------------------------------------
  perform _t_as(v_a);
  perform admin_update_occurrence(v_occ, '{"status": "resolvida"}');
  perform _t_as(null);
  perform _t_check('resolvida com encerramento em 3 dias úteis',
    (select status = 'resolvida' and auto_close_at = _add_business_days(resolved_at, 3) from occurrences where id = v_occ));
  update occurrences set auto_close_at = now() - interval '1 minute' where id = v_occ;
  perform _t_as(v_c);
  r := my_order_occurrences(x) -> 0;
  perform _t_check('passado o prazo, aparece encerrada', r ->> 'status' = 'encerrada', r::text);
  perform _t_err('encerrada não recebe comentário', format('select occurrence_comment(%L, %L)', v_occ, 'oi'), 'encerrada');
  perform _t_as(v_a);
  perform _t_err('reabrir sem motivo', format('select admin_reopen_occurrence(%L, %L)', v_occ, ''), 'motivo');
  perform admin_reopen_occurrence(v_occ, 'Cliente achou outra falta');
  perform _t_as(null);
  perform _t_check('reaberta', (select status = 'aberta' and resolved_at is null from occurrences where id = v_occ));

  -- 8. Conferência com diferença -----------------------------------------------------------------
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 2}');
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 1}');
  insert into order_events (order_id, actor_kind, kind, details) values (x, 'admin', 'items_checked', '{"divergent": 0}');
  select count(*) into v_n from occurrences c join occurrence_types t on t.id = c.type_id
    where c.order_id = x and t.system_kind = 'conferencia';
  perform _t_check('conferência com diferença abre uma ocorrência só', v_n = 1);

  -- 9. Entregador ----------------------------------------------------------------------------------
  insert into trips (day, driver_id, status) values (v_day, v_driver, 'em_andamento') returning id into v_trip;
  insert into routes (kind, day, trip_id, status) values ('coleta', v_day, v_trip, 'em_andamento') returning id into v_route;
  insert into route_stops (route_id, store_id, position) values (v_route, (select id from stores where code = v_s1), 1)
    returning id into v_stop;
  insert into route_stop_orders (stop_id, order_id) values (v_stop, x);
  perform _t_as(v_d);
  perform _t_err('entregador sem parada', format('select driver_open_occurrence(%L::jsonb)',
    jsonb_build_object('typeId', v_t_theft, 'stopId', gen_random_uuid(), 'description', 'Furto')), 'Parada não encontrada');
  perform _t_err('entregador não abre tipo de cliente', format('select driver_open_occurrence(%L::jsonb)',
    jsonb_build_object('typeId', v_t_missing, 'stopId', v_stop, 'description', 'Faltou')), 'tipos da lista');
  r := driver_open_occurrence(jsonb_build_object('typeId', v_t_theft, 'stopId', v_stop, 'orderId', x,
    'description', 'Pacote levado no caminho', 'lat', -22.9, 'lng', -43.2));
  v_occ2 := (r ->> 'id')::uuid;
  perform _t_as(null);
  perform _t_check('ocorrência do entregador ligada à parada e à viagem',
    (select opened_kind = 'driver' and trip_id = v_trip and stop_id = v_stop and lat = -22.9 from occurrences where id = v_occ2));
  perform _t_check('linha do tempo: aberta pelo entregador',
    exists (select 1 from order_events where order_id = x and kind = 'occurrence' and actor_kind = 'driver'));
  update route_stops set reason = 'loja_fechada' where id = v_stop;
  update route_stops set status = 'nao_realizada' where id = v_stop;
  perform _t_check('parada com loja fechada abre ocorrência da loja',
    exists (select 1 from occurrences c join occurrence_types t on t.id = c.type_id
            where c.stop_id = v_stop and t.system_kind = 'loja_fechada' and c.order_id is null));
  perform _t_as(v_d);
  perform _t_check('entregador vê as ocorrências dele e da parada', jsonb_array_length(driver_my_occurrences()) = 2);
  perform occurrence_comment(v_occ2, 'Registrei boletim de ocorrência');
  perform _t_as(v_c);
  perform _t_err('cliente não é entregador', 'select driver_my_occurrences()', 'entregadores ativos');

  -- 10. Anexos ----------------------------------------------------------------------------------------
  perform _t_err('anexo fora da pasta', format('select occurrence_add_attachment(%L, %L, %L, %L)',
    v_occ, 'outra/coisa.jpg', 'a.jpg', 'image/jpeg'), 'Arquivo inválido');
  perform _t_err('anexo de tipo não aceito', format('select occurrence_add_attachment(%L, %L, %L, %L)',
    v_occ, 'occurrences/' || v_occ || '/a.exe', 'a.exe', 'application/x-msdownload'), 'Tipo de arquivo');
  perform occurrence_add_attachment(v_occ, 'occurrences/' || v_occ || '/foto.jpg', 'foto.jpg', 'image/jpeg');
  perform _t_check('cliente vê o anexo', (
    select jsonb_array_length(e -> 'attachments') = 1
    from jsonb_array_elements(my_order_occurrences(x)) e where (e ->> 'id')::uuid = v_occ));
  perform _t_check('policy do arquivo: cliente pode', _can_see_occurrence_path(v_occ::text));
  perform _t_as(v_c2);
  perform _t_check('policy do arquivo: outro cliente não', not _can_see_occurrence_path(v_occ::text));

  -- 11. Tipos e permissões -----------------------------------------------------------------------------
  perform _t_as(v_a);
  perform _t_err('tipo com nome repetido', format('select admin_upsert_occurrence_type(null, %L::jsonb)',
    '{"name": "furto"}'), 'Já existe');
  v_type := admin_upsert_occurrence_type(null, '{"name": "Embalagem aberta", "customerCan": true, "deadlineHours": 48}');
  perform _t_as(null);
  perform _t_check('tipo novo criado', (select deadline_hours = 48 and customer_can from occurrence_types where id = v_type));
  perform _t_as(v_a);
  r := admin_occurrence(v_occ);
  perform _t_check('admin vê tudo: nota interna, responsável e anexos',
    r ->> 'assigneeName' is not null and jsonb_array_length(r -> 'attachments') = 1
    and exists (select 1 from jsonb_array_elements(r -> 'updates') u where (u ->> 'internal')::boolean), r::text);
  perform _t_check('lista do pedido no detalhe', jsonb_array_length(admin_occurrences(x)) >= 4);
  perform _t_as(v_nc);
  perform _t_err('perfil sem ocorrências não lista', 'select admin_occurrences()', 'não permite');
  perform _t_err('perfil sem ocorrências não cria tipo', format('select admin_upsert_occurrence_type(null, %L::jsonb)',
    '{"name": "Outro"}'), 'não permite');
  perform _t_check('perfil com dashboard vê o resumo', (admin_occurrence_summary() ->> 'aberta') is not null);

  -- 12. Resultado: o erro abaixo é de propósito e desfaz TUDO -----------------------------------------
  perform _t_as(null);
  select count(*) filter (where ok), count(*),
         string_agg(case when not ok then '  - ' || name || coalesce(' (' || info || ')', '') end, E'\n' order by n)
    into v_ok, v_total, v_fails from _t_results;
  raise exception E'RESULTADO DO TESTE: % de % checagens OK.%\n(Este erro é proposital: ele desfaz tudo, nada foi gravado no banco.)',
    v_ok, v_total, coalesce(E'\nFalharam:\n' || v_fails, '');
end;
$test$;
