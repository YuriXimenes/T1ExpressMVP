-- Pesquisa de mercado (respondida em /pesquisa, vista em /admin/pesquisa).
--
-- Uma linha por usuário. Nome, e-mail e o retrato do 1º pedido são calculados
-- AQUI no banco quando a pessoa confirma o pedido (o navegador não manda esses
-- dados). As respostas ficam em `answers` (JSON, uma chave por pergunta): novas
-- perguntas entram só pelo código (src/lib/survey/questions.ts), sem migração.

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  respondent_name text not null,
  respondent_email text not null,
  order_id uuid references orders(id) on delete set null,
  order_code text not null,
  collect_stores text not null,
  pickup_store text not null,
  order_items text not null,
  items_total_brl numeric(10,2) not null,
  amount_paid_brl numeric(10,2) not null,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint survey_answers_is_object check (jsonb_typeof(answers) = 'object'),
  constraint survey_answers_size check (pg_column_size(answers) <= 65536)
);

-- Leitura: a própria pessoa e o admin. Escrita: só pelas funções abaixo.
alter table survey_responses enable row level security;
create policy "users read own survey response" on survey_responses
  for select using (auth.uid() = user_id);
create policy "admins read all survey responses" on survey_responses
  for select using (public.is_admin());
revoke insert, update, delete, truncate on survey_responses from anon, authenticated;

-- Valor em reais no formato brasileiro (12,40), para o texto dos itens.
create or replace function public._brl(v numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(to_char(coalesce(v, 0), 'FM999999990.00'), '.', ',');
$$;

-- Cria a resposta com o retrato do 1º pedido (o mais antigo) e devolve o id.
-- Se já existir, só devolve o id (não duplica nem refaz o retrato).
create or replace function public.start_survey()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_profile profiles%rowtype;
  v_order orders%rowtype;
  v_collect text;
  v_pickup text;
  v_items text;
  v_paid numeric;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select id into v_id from survey_responses where user_id = v_uid;
  if found then
    return v_id;
  end if;

  select * into v_profile from profiles where id = v_uid;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where user_id = v_uid order by created_at asc limit 1;
  if not found then
    raise exception 'A pesquisa fica disponível depois do seu primeiro pedido.' using errcode = 'P0001';
  end if;

  select string_agg(s.name, ', ' order by s.name) into v_collect
    from order_origin_stores oos join stores s on s.id = oos.store_id
    where oos.order_id = v_order.id;
  select name into v_pickup from stores where id = v_order.destination_store_id;

  -- "Loja: 1x Carta (Magic) R$ 10,00; 1x Fichário R$ 50,00 | Outra loja: ..."
  select string_agg(store_line, ' | ' order by store_name) into v_items
  from (
    select s.name as store_name,
           s.name || ': ' || string_agg(item, '; ' order by g.sort_order, item_order) as store_line
    from pedido_groups g
    join stores s on s.id = g.store_id
    join lateral (
      select ci.sort_order as item_order,
             ci.quantity || 'x ' || ci.card_name || ' (' ||
             case ci.game
               when 'magic' then 'Magic' when 'pokemon' then 'Pokémon'
               when 'yugioh' then 'Yu-Gi-Oh!' when 'lorcana' then 'Lorcana'
               when 'fab' then 'Flesh and Blood' else coalesce(nullif(ci.other_game, ''), 'Outro')
             end || ') ' ||
             _brl(case when ci.price_mode = 'total' then ci.price else ci.price * ci.quantity end) as item
        from pedido_card_items ci where ci.group_id = g.id
      union all
      select 1000 + ai.sort_order,
             ai.quantity || 'x ' ||
             case ai.accessory
               when 'sleeve' then 'Sleeve' when 'perfect-fit' then 'Perfect Fit'
               when 'playmat' then 'Playmat' when 'fichario' then 'Fichário'
               when 'case' then 'Case' else coalesce(nullif(ai.other_accessory, ''), 'Outros')
             end || ' ' ||
             _brl(case when ai.price_mode = 'total' then ai.price else ai.price * ai.quantity end)
        from pedido_accessory_items ai where ai.group_id = g.id
    ) items on true
    where g.order_id = v_order.id
    group by s.name
  ) per_store;

  v_paid := v_order.amount_due_brl + coalesce(
    (select sum(amount_brl) from store_charges where order_id = v_order.id and status = 'paid'), 0);

  insert into survey_responses (
    user_id, respondent_name, respondent_email, order_id, order_code,
    collect_stores, pickup_store, order_items, items_total_brl, amount_paid_brl
  ) values (
    v_uid, v_profile.name, v_profile.email, v_order.id, upper(left(v_order.id::text, 8)),
    coalesce(v_collect, ''), coalesce(v_pickup, ''), coalesce(v_items, ''),
    v_order.items_total_brl, v_paid
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Junta respostas novas às anteriores. Chaves simples; valores texto, número,
-- sim/não ou lista de textos (o significado de cada pergunta fica no código).
create or replace function public.save_survey_answers(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  k text;
  v jsonb;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Respostas inválidas.' using errcode = 'P0001';
  end if;
  for k, v in select key, value from jsonb_each(p) loop
    if k !~ '^[a-z][a-z0-9_]{0,59}$' then
      raise exception 'Respostas inválidas.' using errcode = 'P0001';
    end if;
    if not (
      (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 4000)
      or jsonb_typeof(v) in ('number', 'boolean', 'null')
      or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 50
          and not exists (select 1 from jsonb_array_elements(v) e
                          where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 500))
    ) then
      raise exception 'Respostas inválidas.' using errcode = 'P0001';
    end if;
  end loop;

  update survey_responses
    set answers = answers || p, updated_at = now()
    where user_id = v_uid;
  if not found then
    raise exception 'Confirme seu pedido para começar a pesquisa.' using errcode = 'P0001';
  end if;
end;
$$;

-- Marca a pesquisa como concluída (usada quando a última pergunta existir).
create or replace function public.complete_survey()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  update survey_responses
    set completed_at = coalesce(completed_at, now()), updated_at = now()
    where user_id = auth.uid();
  if not found then
    raise exception 'Confirme seu pedido para começar a pesquisa.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function _brl(numeric) from public, anon, authenticated;
revoke all on function start_survey() from public, anon, authenticated;
revoke all on function save_survey_answers(jsonb) from public, anon, authenticated;
revoke all on function complete_survey() from public, anon, authenticated;
grant execute on function start_survey() to authenticated;
grant execute on function save_survey_answers(jsonb) to authenticated;
grant execute on function complete_survey() to authenticated;
