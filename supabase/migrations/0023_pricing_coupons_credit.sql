-- Entrega 8B: preço e desconto no pedido.
--   1. Preços versionados: cada mudança vira uma versão, com início agora ou agendado.
--      O preço em vigor é a última versão que já começou. pricing_settings vira uma
--      view com o preço em vigor (o site já publicado continua lendo igual).
--   2. Cupons avançados: validade, limite total e por cliente, pedido mínimo, só
--      primeira compra, observação interna e dono (cupom de ocorrência é só do cliente
--      da ocorrência, de uso único). Validado no create_order e em check_coupon.
--   3. Crédito do cliente: extrato (customer_credits). A resolução "crédito" da
--      ocorrência e o ajuste do admin somam; o pedido usa; o cancelamento devolve.
-- Pedidos já feitos não mudam: cada pedido guarda o que foi cobrado.
-- Precisa da 0022. Ver rollback/0023_down.sql.

-- ---------------------------------------------------------------------------
-- 1. Preços versionados
-- ---------------------------------------------------------------------------
create table pricing_versions (
  id uuid primary key default gen_random_uuid(),
  base_brl numeric(10,2) not null check (base_brl between 0 and 10000),
  extra_store_brl numeric(10,2) not null check (extra_store_brl between 0 and 10000),
  added_store_brl numeric(10,2) not null check (added_store_brl between 0 and 10000),
  insurance_per_100_brl numeric(10,2) not null check (insurance_per_100_brl between 0 and 10000),
  effective_from timestamptz not null default now(),
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  -- clock_timestamp: duas versões salvas na mesma transação ainda têm ordem.
  created_at timestamptz not null default clock_timestamp()
);
create index pricing_versions_effective_idx on pricing_versions (effective_from desc, created_at desc);

-- A tabela de hoje vira a 1ª versão (mesmos valores: nada muda no site).
insert into pricing_versions (base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl, effective_from, note)
select base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl, least(updated_at, now()),
       'Preço em vigor antes do histórico'
from pricing_settings where id = 1;
insert into pricing_versions (base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl, effective_from, note)
select 12, 3, 3, 1, now(), 'Preço padrão'
where not exists (select 1 from pricing_versions);

alter table pricing_versions enable row level security;
create policy "staff read pricing versions" on pricing_versions for select using (has_perm('precos', 'ver'));
revoke insert, update, delete, truncate on pricing_versions from anon, authenticated;

-- Preço em vigor num instante (uso interno das funções de pedido).
create or replace function public._pricing_at(p_at timestamptz)
returns pricing_versions
language sql
stable
security definer
set search_path = public
as $$
  select * from pricing_versions where effective_from <= p_at
  order by effective_from desc, created_at desc limit 1;
$$;

-- Leitura pública só dos valores em vigor (sem observação, autor ou agendamentos).
drop table pricing_settings;
create view pricing_current as
  select base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl, effective_from
  from pricing_versions where effective_from <= now()
  order by effective_from desc, created_at desc limit 1;
-- Mesmo formato da tabela antiga, para o site já publicado não quebrar.
create view pricing_settings as
  select 1::smallint as id, base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl,
         effective_from as updated_at
  from pricing_current;
revoke all on pricing_current, pricing_settings from anon, authenticated;
grant select on pricing_current, pricing_settings to anon, authenticated;

-- Nova versão de preço. p: { baseBRL, extraStoreBRL, addedStoreBRL, insurancePer100BRL,
-- effectiveFrom? (ISO; vazio = agora), note? }
create or replace function public.admin_save_pricing(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v_from timestamptz;
  v_id uuid;
begin
  perform _require_perm('precos', 'editar');
  foreach k in array array['baseBRL', 'extraStoreBRL', 'addedStoreBRL', 'insurancePer100BRL'] loop
    if jsonb_typeof(p -> k) is distinct from 'number'
       or (p ->> k)::numeric < 0 or (p ->> k)::numeric > 10000 then
      raise exception 'Confira os valores: use números entre R$ 0 e R$ 10.000.' using errcode = 'P0001';
    end if;
  end loop;
  v_from := coalesce(nullif(p ->> 'effectiveFrom', '')::timestamptz, now());
  if v_from < now() - interval '5 minutes' then
    raise exception 'A vigência não pode começar no passado.' using errcode = 'P0001';
  end if;
  if v_from > now() + interval '1 year' then
    raise exception 'Agende para no máximo 1 ano à frente.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'note', '')) > 500 then
    raise exception 'A observação pode ter até 500 caracteres.' using errcode = 'P0001';
  end if;
  insert into pricing_versions (base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl,
                                effective_from, note, created_by)
  values (round((p ->> 'baseBRL')::numeric, 2), round((p ->> 'extraStoreBRL')::numeric, 2),
          round((p ->> 'addedStoreBRL')::numeric, 2), round((p ->> 'insurancePer100BRL')::numeric, 2),
          greatest(v_from, now()), nullif(btrim(coalesce(p ->> 'note', '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
exception
  when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Data de vigência inválida.' using errcode = 'P0001';
end;
$$;

-- Só um preço agendado (que ainda não começou) pode ser apagado.
create or replace function public.admin_delete_pricing_version(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('precos', 'editar');
  delete from pricing_versions where id = p_id and effective_from > now();
  if not found then
    raise exception 'Só dá para cancelar um preço agendado que ainda não começou.' using errcode = 'P0001';
  end if;
end;
$$;

-- Compatível com o site já publicado: salvar = nova versão valendo agora.
create or replace function public.admin_update_pricing(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  perform _require_admin();
  foreach k in array array['baseBRL', 'extraStoreBRL', 'addedStoreBRL', 'insurancePer100BRL'] loop
    if jsonb_typeof(p -> k) is distinct from 'number'
       or (p ->> k)::numeric < 0 or (p ->> k)::numeric > 10000 then
      raise exception 'Confira os valores: use números entre R$ 0 e R$ 10.000.' using errcode = 'P0001';
    end if;
  end loop;
  insert into pricing_versions (base_brl, extra_store_brl, added_store_brl, insurance_per_100_brl, created_by)
  values (round((p ->> 'baseBRL')::numeric, 2), round((p ->> 'extraStoreBRL')::numeric, 2),
          round((p ->> 'addedStoreBRL')::numeric, 2), round((p ->> 'insurancePer100BRL')::numeric, 2), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cupons avançados
-- ---------------------------------------------------------------------------
alter table coupons
  add column valid_from date,
  add column valid_until date,
  add column max_uses int check (max_uses > 0),
  add column max_uses_per_user int check (max_uses_per_user > 0),
  add column min_order_brl numeric(10,2) check (min_order_brl >= 0),
  add column first_purchase_only boolean not null default false,
  add column note text check (char_length(note) <= 500),
  add column owner_user_id uuid references profiles(id) on delete cascade,
  add constraint coupons_valid_range_check check (valid_until is null or valid_from is null or valid_until >= valid_from);

-- Cupons de ocorrência já criados: só do cliente da ocorrência, uso único.
update coupons cp set owner_user_id = o.user_id, max_uses = 1, max_uses_per_user = 1,
                      note = coalesce(cp.note, 'Ocorrência OC-' || c.number)
from occurrence_resolutions r
join occurrences c on c.id = r.occurrence_id
join orders o on o.id = c.order_id
where r.kind = 'cupom' and r.coupon_code = cp.code;

-- Público vê só os cupons gerais e só os campos de antes (sem regras nem observação).
-- O admin lê tudo por admin_coupons().
drop policy "coupons are publicly readable" on coupons;
create policy "public coupons are readable" on coupons for select using (owner_user_id is null);
revoke select on coupons from anon, authenticated;
grant select (code, type, value, label, active) on coupons to anon, authenticated;

-- Valida o cupom para o cliente e o frete informados e devolve o desconto.
-- p_lock: trava o cupom até o fim da transação (create_order), para o limite valer.
create or replace function public._coupon_check(p_code text, p_uid uuid, p_freight numeric, p_lock boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  cp coupons%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_used int;
  v_pending uuid;
  v_discount numeric;
begin
  if p_lock then
    select * into cp from coupons where code = v_code for update;
  else
    select * into cp from coupons where code = v_code;
  end if;
  if not found or (cp.owner_user_id is not null and cp.owner_user_id is distinct from p_uid) then
    raise exception 'Cupom inválido.' using errcode = 'P0001';
  end if;
  if not cp.active then
    raise exception 'Este cupom não está mais ativo.' using errcode = 'P0001';
  end if;
  if cp.valid_from is not null and v_today < cp.valid_from then
    raise exception 'Este cupom vale a partir de %.', to_char(cp.valid_from, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if cp.valid_until is not null and v_today > cp.valid_until then
    raise exception 'Cupom vencido.' using errcode = 'P0001';
  end if;
  if cp.max_uses is not null
     and (select count(*) from orders where coupon_code = cp.code and status <> 'cancelled') >= cp.max_uses then
    raise exception 'Este cupom esgotou.' using errcode = 'P0001';
  end if;
  if cp.max_uses_per_user is not null then
    select count(*) into v_used from orders
      where coupon_code = cp.code and user_id = p_uid and status <> 'cancelled';
    if v_used >= cp.max_uses_per_user then
      select id into v_pending from orders
        where coupon_code = cp.code and user_id = p_uid and status = 'pending-payment'
        order by created_at desc limit 1;
      if v_pending is not null then
        raise exception 'Você já usou este cupom no pedido #%, que aguarda pagamento.',
          upper(left(v_pending::text, 8)) using errcode = 'P0001';
      end if;
      raise exception 'Você já usou este cupom.' using errcode = 'P0001';
    end if;
  end if;
  if cp.first_purchase_only
     and exists (select 1 from orders where user_id = p_uid and status <> 'cancelled') then
    raise exception 'Este cupom vale só na primeira compra.' using errcode = 'P0001';
  end if;
  if cp.min_order_brl is not null and p_freight < cp.min_order_brl then
    raise exception 'Pedido mínimo de R$ % para este cupom.',
      replace(to_char(cp.min_order_brl, 'FM999990.00'), '.', ',') using errcode = 'P0001';
  end if;
  v_discount := round(least(greatest(
    case when cp.type = 'percent' then p_freight * cp.value / 100 else cp.value end, 0), p_freight), 2);
  return jsonb_build_object('code', cp.code, 'type', cp.type, 'value', cp.value, 'label', cp.label,
                            'discountBRL', v_discount);
end;
$$;

-- O site confere o cupom antes de mostrar o desconto. p_store_count = lojas de coleta.
create or replace function public.check_coupon(p_code text, p_store_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pricing pricing_versions%rowtype;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  if p_store_count is null or p_store_count not between 1 and 11 then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;
  v_pricing := _pricing_at(now());
  return _coupon_check(p_code, v_uid, v_pricing.base_brl + (p_store_count - 1) * v_pricing.extra_store_brl);
end;
$$;

-- Lista do admin com as regras e o uso de cada cupom.
create or replace function public.admin_coupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('cupons', 'ver');
  return coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'code', cp.code, 'type', cp.type, 'value', cp.value, 'label', cp.label, 'active', cp.active,
      'validFrom', cp.valid_from, 'validUntil', cp.valid_until, 'maxUses', cp.max_uses,
      'maxUsesPerUser', cp.max_uses_per_user, 'minOrderBRL', cp.min_order_brl,
      'firstPurchaseOnly', cp.first_purchase_only, 'note', cp.note,
      'ownerUserId', cp.owner_user_id, 'ownerName', pr.name, 'createdAt', cp.created_at,
      'uses', u.uses, 'paidUses', u.paid_uses, 'discountTotal', u.discount_total, 'lastUsedAt', u.last_used))
      order by cp.owner_user_id is not null, cp.active desc, cp.created_at desc)
    from coupons cp
    left join profiles pr on pr.id = cp.owner_user_id
    cross join lateral (
      select count(*) filter (where o.status <> 'cancelled') as uses,
             count(*) filter (where o.status in ('active', 'completed')) as paid_uses,
             round(coalesce(sum(o.coupon_discount_brl) filter (where o.status in ('active', 'completed')), 0), 2)
               as discount_total,
             max(o.created_at) as last_used
      from orders o where o.coupon_code = cp.code) u), '[]'::jsonb);
end;
$$;

-- Pedidos que usaram o cupom (os 100 mais recentes).
create or replace function public.admin_coupon_orders(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('cupons', 'ver');
  return coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
    select o.created_at, jsonb_strip_nulls(jsonb_build_object('id', o.id, 'createdAt', o.created_at,
      'status', o.status, 'customerName', p.name, 'discountBRL', o.coupon_discount_brl,
      'amountDueBRL', o.amount_due_brl)) as j
    from orders o left join profiles p on p.id = o.user_id
    where o.coupon_code = upper(btrim(p_code))
    order by o.created_at desc limit 100) x), '[]'::jsonb);
end;
$$;

-- Criar ou editar cupom. Campos novos só mudam quando vêm no JSON (o site já
-- publicado manda só tipo, valor, rótulo e ativo e não apaga as regras).
create or replace function public.admin_upsert_coupon(p_code text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(p_code));
  v_type coupon_type;
  v_value numeric;
  v_from date;
  v_until date;
  v_max int;
  v_per int;
  v_min numeric;
begin
  perform _require_admin();
  if v_code = '' or char_length(v_code) > 30 or v_code !~ '^[A-Z0-9_-]+$'
     or coalesce(p ->> 'label', '') = '' or char_length(p ->> 'label') > 200 then
    raise exception 'Confira o código (letras, números, - ou _) e o rótulo do cupom.' using errcode = 'P0001';
  end if;
  v_type := (p ->> 'type')::coupon_type;
  v_value := (p ->> 'value')::numeric;
  if v_value is null or v_value <= 0 or (v_type = 'percent' and v_value > 100) then
    raise exception 'Confira o valor do cupom.' using errcode = 'P0001';
  end if;
  v_from := nullif(p ->> 'validFrom', '')::date;
  v_until := nullif(p ->> 'validUntil', '')::date;
  if v_from is not null and v_until is not null and v_until < v_from then
    raise exception 'A validade termina antes de começar.' using errcode = 'P0001';
  end if;
  v_max := nullif(p ->> 'maxUses', '')::int;
  v_per := nullif(p ->> 'maxUsesPerUser', '')::int;
  v_min := nullif(p ->> 'minOrderBRL', '')::numeric;
  if coalesce(v_max, 1) < 1 or coalesce(v_per, 1) < 1 or coalesce(v_min, 0) < 0 then
    raise exception 'Confira os limites do cupom.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'note', '')) > 500 then
    raise exception 'A observação pode ter até 500 caracteres.' using errcode = 'P0001';
  end if;

  insert into coupons (code, type, value, label, active, valid_from, valid_until, max_uses, max_uses_per_user,
                       min_order_brl, first_purchase_only, note)
  values (v_code, v_type, v_value, btrim(p ->> 'label'), coalesce((p ->> 'active')::boolean, true),
          v_from, v_until, v_max, v_per, round(v_min, 2), coalesce((p ->> 'firstPurchaseOnly')::boolean, false),
          nullif(btrim(coalesce(p ->> 'note', '')), ''))
  on conflict (code) do update set
    type = excluded.type, value = excluded.value, label = excluded.label, active = excluded.active,
    valid_from = case when p ? 'validFrom' then excluded.valid_from else coupons.valid_from end,
    valid_until = case when p ? 'validUntil' then excluded.valid_until else coupons.valid_until end,
    max_uses = case when p ? 'maxUses' then excluded.max_uses else coupons.max_uses end,
    max_uses_per_user = case when p ? 'maxUsesPerUser' then excluded.max_uses_per_user
                             else coupons.max_uses_per_user end,
    min_order_brl = case when p ? 'minOrderBRL' then excluded.min_order_brl else coupons.min_order_brl end,
    first_purchase_only = case when p ? 'firstPurchaseOnly' then excluded.first_purchase_only
                               else coupons.first_purchase_only end,
    note = case when p ? 'note' then excluded.note else coupons.note end;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range then
    raise exception 'Confira o tipo, o valor e os limites do cupom.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Crédito do cliente (extrato)
-- ---------------------------------------------------------------------------
create table customer_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_brl numeric(10,2) not null check (amount_brl <> 0),
  kind text not null check (kind in ('ocorrencia', 'ajuste', 'uso', 'estorno')),
  occurrence_id uuid references occurrences(id) on delete set null,
  resolution_id uuid unique references occurrence_resolutions(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_credits_user_idx on customer_credits (user_id, created_at desc);
create index customer_credits_order_idx on customer_credits (order_id);

alter table customer_credits enable row level security;
create policy "users read own credits" on customer_credits for select using (user_id = auth.uid());
create policy "staff read credits" on customer_credits for select using (has_perm('usuarios', 'ver'));
revoke insert, update, delete, truncate on customer_credits from anon, authenticated;

alter table orders add column credit_used_brl numeric(10,2) not null default 0
  constraint orders_credit_used_check check (credit_used_brl >= 0);

create or replace function public._credit_balance(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(coalesce(sum(amount_brl), 0), 2) from customer_credits where user_id = p_user;
$$;

-- Uma operação de crédito por cliente de cada vez (evita usar o mesmo saldo duas vezes).
create or replace function public._credit_lock(p_user uuid)
returns void
language sql
as $$
  select pg_advisory_xact_lock(hashtextextended('t1.credit:' || p_user::text, 0));
$$;

create or replace function public._credit_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'balance', _credit_balance(p_user),
    'entries', coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
      select cc.created_at, jsonb_strip_nulls(jsonb_build_object('id', cc.id, 'amount', cc.amount_brl,
        'kind', cc.kind, 'note', cc.note, 'orderId', cc.order_id, 'occurrenceId', cc.occurrence_id,
        'occurrenceNumber', oc.number, 'createdAt', cc.created_at, 'createdByName', pr.name)) as j
      from customer_credits cc
      left join occurrences oc on oc.id = cc.occurrence_id
      left join profiles pr on pr.id = cc.created_by
      where cc.user_id = p_user
      order by cc.created_at desc limit 200) x), '[]'::jsonb));
$$;

create or replace function public.my_credit()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  return _credit_json(auth.uid());
end;
$$;

create or replace function public.admin_user_credit(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('usuarios', 'ver');
  return _credit_json(p_user);
end;
$$;

-- Ajuste manual (positivo dá crédito, negativo tira). Motivo obrigatório.
create or replace function public.admin_adjust_credit(p_user uuid, p_amount numeric, p_note text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric := round(coalesce(p_amount, 0), 2);
begin
  perform _require_perm('usuarios', 'editar');
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;
  if v_amount = 0 or abs(v_amount) > 10000 then
    raise exception 'Informe um valor entre R$ 0,01 e R$ 10.000.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Informe o motivo do ajuste.' using errcode = 'P0001';
  end if;
  perform _credit_lock(p_user);
  if _credit_balance(p_user) + v_amount < 0 then
    raise exception 'O saldo não pode ficar negativo (saldo atual: R$ %).',
      replace(to_char(_credit_balance(p_user), 'FM999990.00'), '.', ',') using errcode = 'P0001';
  end if;
  insert into customer_credits (user_id, amount_brl, kind, note, created_by)
  values (p_user, v_amount, 'ajuste', left(btrim(p_note), 500), auth.uid());
  return _credit_balance(p_user);
end;
$$;

-- Pedido cancelado devolve o crédito usado (uma vez só).
create or replace function public._orders_credit_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.credit_used_brl > 0
     and not exists (select 1 from customer_credits where order_id = new.id and kind = 'estorno') then
    insert into customer_credits (user_id, amount_brl, kind, order_id, note)
    values (new.user_id, new.credit_used_brl, 'estorno', new.id,
            'Pedido #' || upper(left(new.id::text, 8)) || ' cancelado');
  end if;
  return new;
end;
$$;

create trigger orders_credit_refund
  after update of status on orders
  for each row execute function _orders_credit_refund();

-- Resoluções da ocorrência: "reembolso" e "sinistro" (0022), mais "crédito" (vira
-- saldo do cliente) e "cupom" (fica só do cliente, uso único).
create or replace function public._occ_resolution_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c occurrences%rowtype;
  o orders%rowtype;
  v_claim uuid;
begin
  select * into c from occurrences where id = new.occurrence_id;
  if c.order_id is null then
    return new;
  end if;
  select * into o from orders where id = c.order_id;
  if new.kind = 'reembolso' and new.amount_brl > 0 then
    insert into customer_refunds (occurrence_id, resolution_id, order_id, user_id, amount_brl, note)
    values (c.id, new.id, c.order_id, o.user_id, new.amount_brl, new.note);
  elsif new.kind = 'sinistro' then
    insert into claims (order_id, occurrence_id, resolution_id, description, declared_amount, coverage_brl,
                        suggested_amount, created_by)
    values (c.order_id, c.id, new.id, c.description, coalesce(new.amount_brl, 0), o.insurance_coverage_brl,
            least(coalesce(new.amount_brl, 0), o.insurance_coverage_brl), auth.uid())
    returning id into v_claim;
    perform _claim_log(v_claim, 'aberto', 'Aberto pela ocorrência OC-' || c.number);
  elsif new.kind = 'credito' and new.amount_brl > 0 then
    insert into customer_credits (user_id, amount_brl, kind, occurrence_id, resolution_id, order_id, note, created_by)
    values (o.user_id, new.amount_brl, 'ocorrencia', c.id, new.id, c.order_id,
            coalesce(new.note, 'Crédito da ocorrência OC-' || c.number), auth.uid());
  elsif new.kind = 'cupom' and new.coupon_code is not null then
    update coupons set owner_user_id = o.user_id, max_uses = 1, max_uses_per_user = 1,
                       note = coalesce(note, 'Ocorrência OC-' || c.number)
    where code = new.coupon_code;
  end if;
  return new;
end;
$$;

-- Créditos de ocorrência já resolvidos antes desta migração entram no saldo.
insert into customer_credits (user_id, amount_brl, kind, occurrence_id, resolution_id, order_id, note, created_by, created_at)
select o.user_id, r.amount_brl, 'ocorrencia', c.id, r.id, c.order_id,
       coalesce(r.note, 'Crédito da ocorrência OC-' || c.number), r.created_by, r.created_at
from occurrence_resolutions r
join occurrences c on c.id = r.occurrence_id
join orders o on o.id = c.order_id
where r.kind = 'credito' and r.amount_brl > 0
  and not exists (select 1 from customer_credits cc where cc.resolution_id = r.id);

-- ---------------------------------------------------------------------------
-- 4. Pedido: preço em vigor, cupom com regras e uso do crédito
-- ---------------------------------------------------------------------------
create or replace function public.create_order(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_origin_ids uuid[] := '{}';
  v_origin_names text[] := '{}';
  v_origin_count int;
  v_dest_id uuid;
  v_dest_name text;
  v_store_id uuid;
  v_store_name text;
  v_order uuid := gen_random_uuid();
  v_price numeric;
  v_pricing pricing_versions%rowtype;
  v_items_total numeric;
  v_opted boolean;
  v_needed numeric;
  v_coverage numeric := 100;
  v_extra numeric := 0;
  v_coupon jsonb;
  v_coupon_code text;
  v_discount numeric := 0;
  v_after numeric;
  v_credit numeric := 0;
  v_days_min int;
  v_days_max int;
  v_savings numeric;
  c jsonb;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'Perfil não encontrado.' using errcode = 'P0001';
  end if;

  -- Origens: 1 a 11 lojas distintas e existentes.
  if jsonb_typeof(p -> 'originStoreCodes') is distinct from 'array'
     or jsonb_array_length(p -> 'originStoreCodes') not between 1 and 11 then
    raise exception 'Selecione ao menos uma loja de origem.' using errcode = 'P0001';
  end if;
  for v_code in select jsonb_array_elements_text(p -> 'originStoreCodes') loop
    select id, name into v_store_id, v_store_name from stores where code = v_code;
    if v_store_id is null or v_store_id = any (v_origin_ids) then
      raise exception 'Loja de origem inválida.' using errcode = 'P0001';
    end if;
    v_origin_ids := v_origin_ids || v_store_id;
    v_origin_names := v_origin_names || v_store_name;
  end loop;
  v_origin_count := array_length(v_origin_ids, 1);

  select id, name into v_dest_id, v_dest_name from stores
    where code = p ->> 'destinationStoreCode' and is_pickup_point;
  if v_dest_id is null or v_dest_id = any (v_origin_ids) then
    raise exception 'Ponto de retirada inválido.' using errcode = 'P0001';
  end if;

  -- Frete da T1 pelo preço em vigor agora (pricing_versions).
  v_pricing := _pricing_at(now());
  v_price := v_pricing.base_brl + (v_origin_count - 1) * v_pricing.extra_store_brl;

  v_days_min := _json_num(p -> 'quote', 'estimatedDaysMin', 1, 60, true)::int;
  v_days_max := _json_num(p -> 'quote', 'estimatedDaysMax', 1, 60, true)::int;
  if v_days_max < v_days_min then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
  end if;
  v_savings := case when jsonb_typeof(p -> 'quote' -> 'cheapestSavingsBRL') = 'number'
                    then round(_json_num(p -> 'quote', 'cheapestSavingsBRL', 0, 100000), 2) end;

  -- Cupom: todas as regras (validade, limites, mínimo, primeira compra, dono).
  v_coupon_code := upper(btrim(coalesce(p ->> 'couponCode', '')));
  if v_coupon_code <> '' then
    v_coupon := _coupon_check(v_coupon_code, v_uid, v_price, true);
    v_discount := (v_coupon ->> 'discountBRL')::numeric;
  end if;
  v_after := greatest(v_price - v_discount, 0);

  insert into orders (
    id, user_id, status, destination_store_id, delivery_note, freight_after_discount_brl,
    amount_due_brl, quote_price_brl, quote_estimated_days_min, quote_estimated_days_max,
    quote_distance_label, quote_cheapest_savings_brl,
    coupon_code, coupon_type, coupon_value, coupon_discount_brl
  ) values (
    v_order, v_uid, 'pending-payment', v_dest_id, left(coalesce(p ->> 'deliveryNote', ''), 2000), v_after,
    v_after, v_price, v_days_min, v_days_max,
    array_to_string(v_origin_names, ', ') || ' → ' || v_dest_name, v_savings,
    nullif(v_coupon_code, ''), (v_coupon ->> 'type')::coupon_type, (v_coupon ->> 'value')::numeric,
    case when v_coupon_code <> '' then v_discount end
  );

  insert into order_origin_stores (order_id, store_id)
    select v_order, unnest(v_origin_ids);

  -- Concorrentes: só informativos (Uber/Loggi/Correios), no máximo 3.
  if jsonb_typeof(p -> 'quote' -> 'competitors') = 'array' then
    if jsonb_array_length(p -> 'quote' -> 'competitors') > 3 then
      raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
    end if;
    for c in select value from jsonb_array_elements(p -> 'quote' -> 'competitors') loop
      insert into order_quote_competitors (order_id, carrier, label, eta_label, total_brl)
      values (
        v_order, (c ->> 'carrier')::carrier_code, left(coalesce(c ->> 'label', ''), 80),
        left(coalesce(c ->> 'etaLabel', ''), 40), round(_json_num(c, 'totalBRL', 0, 1000000), 2)
      );
    end loop;
  end if;

  v_items_total := _insert_pedido_groups(v_order, null, p -> 'groups', v_origin_ids);

  v_opted := coalesce((p ->> 'insuranceOptedIn')::boolean, false);
  if v_opted then
    v_needed := _insurance_needed(v_items_total);
    v_coverage := v_needed;
    v_extra := (v_needed - 100) / 100 * v_pricing.insurance_per_100_brl;
  end if;

  -- Crédito: abate do total (frete com desconto + seguro), até o saldo.
  if coalesce((p ->> 'useCredit')::boolean, false) then
    perform _credit_lock(v_uid);
    v_credit := round(least(_credit_balance(v_uid), v_after + v_extra), 2);
    if v_credit > 0 then
      insert into customer_credits (user_id, amount_brl, kind, order_id, note)
      values (v_uid, -v_credit, 'uso', v_order, 'Usado no pedido #' || upper(left(v_order::text, 8)));
    else
      v_credit := 0;
    end if;
  end if;

  update orders set
    items_total_brl = v_items_total,
    insurance_opted_in = v_opted,
    insurance_coverage_brl = v_coverage,
    insurance_extra_cost_brl = v_extra,
    credit_used_brl = v_credit,
    amount_due_brl = v_after + v_extra - v_credit
  where id = v_order;

  return v_order;
exception
  when invalid_text_representation then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
end;
$$;

-- Igual à 0010, lendo o preço em vigor de pricing_versions.
create or replace function public.add_store_charge(p_order uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders%rowtype;
  v_code text;
  v_store uuid;
  v_new_ids uuid[] := '{}';
  v_charge uuid := gen_random_uuid();
  v_added numeric;
  v_fee numeric;
  v_pricing pricing_versions%rowtype;
  v_needed numeric;
  v_new_extra numeric;
  v_upgrade boolean := false;
  v_upgrade_cost numeric := 0;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre novamente.' using errcode = 'P0001';
  end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if not (v_order.status = 'pending-payment'
          or (v_order.status = 'active' and v_order.delivery_stage = 'aguardando-coleta')) then
    raise exception 'Este pedido não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p -> 'storeCodes') is distinct from 'array'
     or jsonb_array_length(p -> 'storeCodes') not between 1 and 10 then
    raise exception 'Selecione ao menos uma loja.' using errcode = 'P0001';
  end if;
  for v_code in select jsonb_array_elements_text(p -> 'storeCodes') loop
    select id into v_store from stores where code = v_code;
    if v_store is null
       or v_store = any (v_new_ids)
       or v_store = v_order.destination_store_id
       or exists (select 1 from order_origin_stores where order_id = p_order and store_id = v_store) then
      raise exception 'Loja inválida para este pedido.' using errcode = 'P0001';
    end if;
    v_new_ids := v_new_ids || v_store;
  end loop;

  insert into store_charges (id, order_id, amount_brl, status)
  values (v_charge, p_order, 0, 'pending-payment');
  insert into store_charge_stores (charge_id, store_id) select v_charge, unnest(v_new_ids);

  v_added := _insert_pedido_groups(null, v_charge, p -> 'groups', v_new_ids);
  v_pricing := _pricing_at(now());
  v_fee := v_pricing.added_store_brl * array_length(v_new_ids, 1);

  -- Upgrade opcional de seguro: só se o novo total ultrapassar a cobertura já contratada.
  if coalesce((p ->> 'insuranceUpgrade')::boolean, false) then
    v_needed := _insurance_needed(v_order.items_total_brl + v_added);
    if v_needed > v_order.insurance_coverage_brl then
      v_new_extra := (v_needed - 100) / 100 * v_pricing.insurance_per_100_brl;
      v_upgrade := true;
      v_upgrade_cost := greatest(0, v_new_extra - v_order.insurance_extra_cost_brl);
    end if;
  end if;

  update store_charges set
    amount_brl = v_fee + v_upgrade_cost,
    items_total_added_brl = v_added,
    insurance_upgrade_coverage_brl = case when v_upgrade then v_needed end,
    insurance_upgrade_extra_cost_brl = case when v_upgrade then v_new_extra end
  where id = v_charge;

  return v_charge;
exception
  when invalid_text_representation then
    raise exception 'Dados do pedido inválidos.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Painel financeiro: crédito usado sai da receita (como o desconto do cupom)
-- ---------------------------------------------------------------------------
create or replace function public._finance_month(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_start timestamptz := _month_start(v_month);
  v_end timestamptz := _month_start((v_month + interval '1 month')::date);
  v_freight numeric; v_insurance numeric; v_discount numeric; v_credits numeric; v_charges numeric;
  v_fuel numeric; v_stores numeric; v_team numeric; v_claims numeric; v_refunds numeric;
  v_exp jsonb; v_exp_total numeric;
  v_revenue numeric; v_costs numeric;
begin
  select coalesce(sum(freight_after_discount_brl), 0), coalesce(sum(insurance_extra_cost_brl), 0),
         coalesce(sum(coupon_discount_brl), 0), coalesce(sum(credit_used_brl), 0)
    into v_freight, v_insurance, v_discount, v_credits
    from orders where paid_at >= v_start and paid_at < v_end and status <> 'cancelled';
  select coalesce(sum(amount_brl), 0) into v_charges
    from store_charges where status = 'paid' and paid_at >= v_start and paid_at < v_end;
  select coalesce(sum(actual_fuel_cost), 0) into v_fuel
    from trips where status = 'concluida' and finished_at >= v_start and finished_at < v_end;
  select coalesce(sum((_store_statement(id, v_month) ->> 'total')::numeric), 0) into v_stores
    from stores where is_pickup_point and exists (select 1 from store_pay_rules r where r.store_id = stores.id);
  select coalesce(sum((_team_statement(id, v_month) ->> 'total')::numeric), 0) into v_team from team_members;
  select coalesce(sum(approved_amount), 0) into v_claims
    from claims where status = 'pago' and paid_at >= v_month and paid_at < (v_month + interval '1 month')::date;
  select coalesce(sum(amount_brl), 0) into v_refunds
    from customer_refunds where status = 'pago' and paid_at >= v_month and paid_at < (v_month + interval '1 month')::date;
  select coalesce(jsonb_object_agg(g.grp, g.total), '{}'::jsonb), coalesce(sum(g.total), 0)
    into v_exp, v_exp_total
    from (select c.grp, sum(e.amount_brl) as total from expenses e join expense_categories c on c.id = e.category_id
          where e.status in ('aprovada', 'paga') and e.competence >= v_month
            and e.competence < (v_month + interval '1 month')::date
          group by c.grp) g;
  v_revenue := v_freight + v_insurance + v_charges - v_credits;
  v_costs := v_fuel + v_stores + v_team + v_exp_total + v_claims + v_refunds;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'revenue', jsonb_build_object('freight', round(v_freight, 2), 'insurance', round(v_insurance, 2),
      'storeCharges', round(v_charges, 2), 'discounts', round(v_discount, 2), 'credits', round(v_credits, 2),
      'total', round(v_revenue, 2)),
    'costs', jsonb_build_object('fuel', round(v_fuel, 2), 'stores', round(v_stores, 2), 'team', round(v_team, 2),
      'expenses', v_exp, 'expensesTotal', round(v_exp_total, 2), 'claims', round(v_claims, 2),
      'refunds', round(v_refunds, 2), 'total', round(v_costs, 2)),
    'margin', round(v_revenue - v_costs, 2),
    'marginPct', case when v_revenue > 0 then round((v_revenue - v_costs) / v_revenue * 100, 1) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _pricing_at(timestamptz),
  _coupon_check(text, uuid, numeric, boolean),
  _credit_balance(uuid),
  _credit_lock(uuid),
  _credit_json(uuid),
  _orders_credit_refund(),
  _occ_resolution_finance(),
  admin_save_pricing(jsonb),
  admin_delete_pricing_version(uuid),
  admin_update_pricing(jsonb),
  check_coupon(text, int),
  admin_coupons(),
  admin_coupon_orders(text),
  admin_upsert_coupon(text, jsonb),
  my_credit(),
  admin_user_credit(uuid),
  admin_adjust_credit(uuid, numeric, text),
  create_order(jsonb),
  add_store_charge(uuid, jsonb),
  _finance_month(date)
from public, anon, authenticated;

grant execute on function
  admin_save_pricing(jsonb),
  admin_delete_pricing_version(uuid),
  admin_update_pricing(jsonb),
  check_coupon(text, int),
  admin_coupons(),
  admin_coupon_orders(text),
  admin_upsert_coupon(text, jsonb),
  my_credit(),
  admin_user_credit(uuid),
  admin_adjust_credit(uuid, numeric, text),
  create_order(jsonb),
  add_store_charge(uuid, jsonb)
to authenticated;
