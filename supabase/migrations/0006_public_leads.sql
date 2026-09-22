-- Etapa 4 (formulários públicos): "Quero ser um Ponto T1" e "Sugerir loja"
-- passam a gravar no banco. São formulários públicos (sem login), então as
-- tabelas não têm nenhuma RLS de leitura — só o service_role lê (painel
-- admin, Etapa 5). Escrita só pelas funções abaixo, que validam e aplicam
-- uma defesa simples contra spam (honeypot + limite por e-mail). Ver
-- supabase/migrations/rollback/0006_down.sql.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table partner_leads (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  wants_pickup boolean not null default false,
  wants_dropoff boolean not null default false,
  street text not null,
  number text not null,
  complement text,
  city text not null,
  state text not null,
  contact_name text not null,
  contact_phone text not null,
  contact_email text not null,
  website text,
  games game_tag[] not null default '{}',
  other_games text[] not null default '{}',
  message text,
  contacted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint partner_leads_lengths_check check (
    char_length(store_name) between 1 and 200
    and char_length(street) between 1 and 200
    and char_length(number) between 1 and 20
    and coalesce(char_length(complement), 0) <= 200
    and char_length(city) between 1 and 120
    and char_length(state) = 2
    and char_length(contact_name) between 1 and 200
    and char_length(contact_phone) between 1 and 20
    and char_length(contact_email) between 5 and 200
    and coalesce(char_length(website), 0) <= 300
    and coalesce(char_length(message), 0) <= 2000
    and (wants_pickup or wants_dropoff)
  )
);
create index partner_leads_contact_email_created_at_idx
  on partner_leads (contact_email, created_at);

create table store_suggestions (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  store_address text not null,
  comment text,
  contacted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint store_suggestions_lengths_check check (
    char_length(store_name) between 1 and 200
    and char_length(store_address) between 1 and 300
    and coalesce(char_length(comment), 0) <= 2000
  )
);

-- Sem RLS de leitura para ninguém (nem dono: são anônimas). Ativar RLS sem
-- nenhuma policy já bloqueia select/insert/update/delete para anon e
-- authenticated; só service_role (que ignora RLS) lê.
alter table partner_leads enable row level security;
alter table store_suggestions enable row level security;
revoke all on partner_leads, store_suggestions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Funções (únicas portas de escrita)
-- ---------------------------------------------------------------------------

create or replace function public.submit_partner_lead(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p ->> 'contactEmail', '')));
  v_games game_tag[];
  v_recent_count int;
begin
  -- Honeypot: campo armadilha que só um robô preenche. Finge sucesso, sem gravar.
  if coalesce(p ->> 'company', '') <> '' then
    return;
  end if;

  -- Rejeita textos acima do limite em vez de cortar silenciosamente (o
  -- usuário precisa saber que o que digitou não coube, não ter parte do
  -- texto descartada sem aviso).
  if char_length(coalesce(p ->> 'storeName', '')) > 200
     or char_length(coalesce(p ->> 'street', '')) > 200
     or char_length(coalesce(p ->> 'number', '')) > 20
     or char_length(coalesce(p ->> 'complement', '')) > 200
     or char_length(coalesce(p ->> 'city', '')) > 120
     or char_length(coalesce(p ->> 'contactName', '')) > 200
     or char_length(coalesce(p ->> 'contactPhone', '')) > 20
     or char_length(v_email) > 200
     or char_length(coalesce(p ->> 'website', '')) > 300
     or char_length(coalesce(p ->> 'message', '')) > 2000 then
    raise exception 'Confira os dados do formulário — algum campo passou do limite de tamanho.' using errcode = 'P0001';
  end if;

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Confira o e-mail informado.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'storeName', '') = '' or coalesce(p ->> 'street', '') = ''
     or coalesce(p ->> 'number', '') = '' or coalesce(p ->> 'city', '') = ''
     or char_length(coalesce(p ->> 'state', '')) <> 2
     or coalesce(p ->> 'contactName', '') = '' or coalesce(p ->> 'contactPhone', '') = ''
     or not coalesce((p ->> 'wantsPickup')::boolean, false)
        and not coalesce((p ->> 'wantsDropoff')::boolean, false) then
    raise exception 'Confira os dados do formulário.' using errcode = 'P0001';
  end if;

  begin
    select array_agg(value::game_tag) into v_games
      from jsonb_array_elements_text(coalesce(p -> 'games', '[]'::jsonb));
  exception
    when invalid_text_representation then
      raise exception 'Confira os jogos selecionados.' using errcode = 'P0001';
  end;
  if v_games is null or array_length(v_games, 1) is null then
    raise exception 'Selecione ao menos um jogo.' using errcode = 'P0001';
  end if;

  select count(*) into v_recent_count from partner_leads
    where contact_email = v_email and created_at > now() - interval '24 hours';
  if v_recent_count >= 3 then
    raise exception 'Muitas tentativas. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;

  insert into partner_leads (
    store_name, wants_pickup, wants_dropoff, street, number, complement, city, state,
    contact_name, contact_phone, contact_email, website, games, other_games, message
  ) values (
    left(btrim(p ->> 'storeName'), 200),
    coalesce((p ->> 'wantsPickup')::boolean, false),
    coalesce((p ->> 'wantsDropoff')::boolean, false),
    left(btrim(p ->> 'street'), 200),
    left(btrim(p ->> 'number'), 20),
    nullif(left(btrim(coalesce(p ->> 'complement', '')), 200), ''),
    left(btrim(p ->> 'city'), 120),
    upper(btrim(p ->> 'state')),
    left(btrim(p ->> 'contactName'), 200),
    left(btrim(p ->> 'contactPhone'), 20),
    v_email,
    nullif(left(btrim(coalesce(p ->> 'website', '')), 300), ''),
    v_games,
    coalesce((select array_agg(left(value, 60)) from jsonb_array_elements_text(coalesce(p -> 'otherGames', '[]'::jsonb))), '{}'),
    nullif(left(btrim(coalesce(p ->> 'message', '')), 2000), '')
  );
exception
  when invalid_text_representation then
    raise exception 'Confira os dados do formulário.' using errcode = 'P0001';
end;
$$;

create or replace function public.submit_store_suggestion(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Honeypot: este formulário não tem campo de site de verdade, então
  -- "website" preenchido só pode ser um robô. Finge sucesso, sem gravar.
  if coalesce(p ->> 'website', '') <> '' then
    return;
  end if;

  if coalesce(p ->> 'storeName', '') = '' or coalesce(p ->> 'storeAddress', '') = '' then
    raise exception 'Confira os dados do formulário.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'storeName', '')) > 200
     or char_length(coalesce(p ->> 'storeAddress', '')) > 300
     or char_length(coalesce(p ->> 'comment', '')) > 2000 then
    raise exception 'Confira os dados do formulário — algum campo passou do limite de tamanho.' using errcode = 'P0001';
  end if;

  insert into store_suggestions (store_name, store_address, comment)
  values (
    left(btrim(p ->> 'storeName'), 200),
    left(btrim(p ->> 'storeAddress'), 300),
    nullif(left(btrim(coalesce(p ->> 'comment', '')), 2000), '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permissões: qualquer visitante (anon) ou usuário logado pode chamar.
-- ---------------------------------------------------------------------------
revoke all on function submit_partner_lead(jsonb), submit_store_suggestion(jsonb)
  from public, anon, authenticated;
grant execute on function submit_partner_lead(jsonb), submit_store_suggestion(jsonb)
  to anon, authenticated;
