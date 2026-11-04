-- Backoffice, entrega 4: perfis e permissões, usuários do admin, equipe e convites.
-- Precisa da 0014 e da 0015. Ver supabase/migrations/rollback/0016_down.sql.
--
-- Antes: quem estava em `admins` fazia tudo. Agora cada pessoa do backoffice tem
-- um perfil (staff_roles) com permissões por área (ver/criar/editar/excluir).
-- Os admins de hoje viram "Administrador" (perfil de sistema = tudo liberado),
-- então ninguém perde acesso ao aplicar esta migração.
--
-- As funções admin_* que já existiam NÃO foram reescritas: _require_admin()
-- descobre quem a chamou (pilha de chamadas do Postgres) e confere a permissão
-- na tabela admin_function_perms. Função sem mapeamento exige Administrador.

-- ---------------------------------------------------------------------------
-- 1. Perfis e permissões
-- ---------------------------------------------------------------------------
-- Áreas = itens do menu do backoffice (src/lib/admin/access.ts) + "chamados".
create or replace function public._staff_areas()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'pedidos', 'chamados', 'coletas', 'pontos', 'ocorrencias',
    'lojas', 'kyc', 'formularios', 'desempenho',
    'precos', 'cupons', 'despesas', 'repasses', 'sinistros',
    'usuarios', 'pesquisa', 'comparador', 'comparativo',
    'pessoas', 'auditoria', 'integracoes'
  ];
$$;

create table staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 60),
  description text check (coalesce(char_length(description), 0) <= 300),
  -- Perfil de sistema (Administrador): tudo liberado, não edita nem apaga.
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table staff_role_permissions (
  role_id uuid not null references staff_roles(id) on delete cascade,
  area text not null check (area = any (_staff_areas())),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  primary key (role_id, area),
  -- Quem cria, edita ou exclui precisa ver.
  constraint staff_role_permissions_view_check
    check (can_view or not (can_create or can_edit or can_delete))
);

insert into staff_roles (id, name, description, is_system) values
  ('00000000-0000-4000-8000-000000000001', 'Administrador', 'Acesso total, inclusive Pessoas e permissões.', true),
  ('00000000-0000-4000-8000-000000000002', 'Operação', 'Pedidos, conferência, custódia e a operação do dia a dia.', false),
  ('00000000-0000-4000-8000-000000000003', 'Financeiro', 'Preços, cupons e o financeiro.', false),
  ('00000000-0000-4000-8000-000000000004', 'Atendimento', 'Clientes, chamados e formulários.', false);

insert into staff_role_permissions (role_id, area, can_view, can_create, can_edit, can_delete)
select r.id, x.area, true, x.c, x.e, x.d
from (values
  ('00000000-0000-4000-8000-000000000002'::uuid, 'dashboard', false, false, false),
  ('00000000-0000-4000-8000-000000000002', 'pedidos', true, true, false),
  ('00000000-0000-4000-8000-000000000002', 'chamados', false, true, false),
  ('00000000-0000-4000-8000-000000000002', 'coletas', true, true, false),
  ('00000000-0000-4000-8000-000000000002', 'pontos', true, true, false),
  ('00000000-0000-4000-8000-000000000002', 'ocorrencias', true, true, false),
  ('00000000-0000-4000-8000-000000000002', 'lojas', false, false, false),
  ('00000000-0000-4000-8000-000000000002', 'usuarios', false, false, false),
  ('00000000-0000-4000-8000-000000000003', 'dashboard', false, false, false),
  ('00000000-0000-4000-8000-000000000003', 'pedidos', false, false, false),
  ('00000000-0000-4000-8000-000000000003', 'precos', true, true, true),
  ('00000000-0000-4000-8000-000000000003', 'cupons', true, true, true),
  ('00000000-0000-4000-8000-000000000003', 'despesas', true, true, true),
  ('00000000-0000-4000-8000-000000000003', 'repasses', true, true, true),
  ('00000000-0000-4000-8000-000000000003', 'sinistros', true, true, true),
  ('00000000-0000-4000-8000-000000000003', 'comparador', false, false, false),
  ('00000000-0000-4000-8000-000000000004', 'dashboard', false, false, false),
  ('00000000-0000-4000-8000-000000000004', 'pedidos', false, false, false),
  ('00000000-0000-4000-8000-000000000004', 'chamados', false, true, false),
  ('00000000-0000-4000-8000-000000000004', 'usuarios', false, false, false),
  ('00000000-0000-4000-8000-000000000004', 'formularios', false, true, false)
) as x(role_id, area, c, e, d)
join staff_roles r on r.id = x.role_id;

-- ---------------------------------------------------------------------------
-- 2. Usuários do admin: perfil, função e status
-- ---------------------------------------------------------------------------
alter table admins
  add column role_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references staff_roles(id),
  add column status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  add column job_title text check (coalesce(char_length(job_title), 0) <= 80),
  add column added_by uuid references profiles(id) on delete set null;
create index admins_role_idx on admins (role_id);

-- "Tem acesso ativo ao backoffice" (inativo não entra em nada).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid() and status = 'ativo');
$$;

-- p_action: 'ver' | 'criar' | 'editar' | 'excluir' | 'upsert' (criar OU editar).
create or replace function public.has_perm(p_area text, p_action text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from admins a
    join staff_roles r on r.id = a.role_id
    left join staff_role_permissions p on p.role_id = r.id and p.area = p_area
    where a.user_id = auth.uid() and a.status = 'ativo'
      and (r.is_system or case p_action
        when 'ver' then p.can_view
        when 'criar' then p.can_create
        when 'editar' then p.can_edit
        when 'excluir' then p.can_delete
        when 'upsert' then p.can_create or p.can_edit
        else false end)
  );
$$;

create or replace function public.has_any_perm(p_areas text[], p_action text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from unnest(p_areas) a where has_perm(a, p_action));
$$;

create or replace function public.is_full_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admins a join staff_roles r on r.id = a.role_id
    where a.user_id = auth.uid() and a.status = 'ativo' and r.is_system
  );
$$;

create or replace function public._require_perm(p_area text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;
  if not has_perm(p_area, p_action) then
    raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
  end if;
end;
$$;

-- Qual permissão cada função antiga exige. 'upsert' = criar ou editar.
create table admin_function_perms (
  fn text primary key,
  area text not null check (area = any (_staff_areas())),
  action text not null check (action in ('ver', 'criar', 'editar', 'excluir', 'upsert'))
);
alter table admin_function_perms enable row level security;
revoke all on admin_function_perms from anon, authenticated;

insert into admin_function_perms (fn, area, action) values
  ('admin_move_order', 'pedidos', 'editar'),
  ('admin_cancel_order', 'pedidos', 'editar'),
  ('admin_complete_order', 'pedidos', 'editar'),
  ('advance_delivery_stage', 'pedidos', 'editar'),
  ('admin_save_item_checks', 'pedidos', 'editar'),
  ('admin_add_photo', 'pedidos', 'editar'),
  ('admin_delete_photo', 'pedidos', 'excluir'),
  ('admin_add_custody_event', 'pedidos', 'editar'),
  ('admin_set_ticket_resolved', 'chamados', 'editar'),
  ('admin_upsert_store', 'lojas', 'upsert'),
  ('admin_delete_store', 'lojas', 'excluir'),
  ('admin_upsert_freight_route', 'comparador', 'upsert'),
  ('admin_delete_freight_route', 'comparador', 'excluir'),
  ('admin_update_correios_rate', 'comparador', 'editar'),
  ('admin_upsert_comparison_carrier', 'comparativo', 'upsert'),
  ('admin_delete_comparison_carrier', 'comparativo', 'excluir'),
  ('admin_upsert_comparison_row', 'comparativo', 'upsert'),
  ('admin_delete_comparison_row', 'comparativo', 'excluir'),
  ('admin_upsert_comparison_value', 'comparativo', 'editar'),
  ('admin_upsert_coupon', 'cupons', 'upsert'),
  ('admin_update_pricing', 'precos', 'editar'),
  ('admin_set_lead_contacted', 'formularios', 'editar'),
  ('admin_set_suggestion_contacted', 'formularios', 'editar'),
  ('admin_list_users', 'usuarios', 'ver'),
  ('admin_add_admin', 'pessoas', 'criar'),
  ('admin_remove_admin', 'pessoas', 'excluir');

-- Chamada no começo de toda função admin_* antiga. Descobre a função que chamou
-- pela pilha (PG_CONTEXT: a 1ª linha é esta função, a 2ª é quem chamou).
create or replace function public._require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx text;
  v_caller text;
  v_perm admin_function_perms%rowtype;
begin
  if not is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'P0001';
  end if;
  get diagnostics v_ctx = pg_context;
  v_caller := (regexp_match(v_ctx, E'\\n[^\\n]*?function (?:public\\.)?"?([a-z0-9_]+)"?\\('))[1];
  select * into v_perm from admin_function_perms where fn = v_caller;
  if not found then
    if not is_full_admin() then
      raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
    end if;
    return;
  end if;
  if not has_perm(v_perm.area, v_perm.action) then
    raise exception 'Seu perfil não permite esta ação.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Leituras por área (as policies "admin lê tudo" antigas são trocadas)
-- ---------------------------------------------------------------------------
-- Dados de pedido que o Dashboard e a ficha do cliente também mostram.
drop policy "admins read all orders" on orders;
create policy "staff read all orders" on orders for select
  using (has_any_perm(array['pedidos', 'dashboard', 'usuarios'], 'ver'));
drop policy "admins read all order origin stores" on order_origin_stores;
create policy "staff read all order origin stores" on order_origin_stores for select
  using (has_any_perm(array['pedidos', 'dashboard', 'usuarios'], 'ver'));
drop policy "admins read all store charges" on store_charges;
create policy "staff read all store charges" on store_charges for select
  using (has_any_perm(array['pedidos', 'dashboard', 'usuarios'], 'ver'));
drop policy "admins read all support tickets" on support_tickets;
create policy "staff read all support tickets" on support_tickets for select
  using (has_any_perm(array['pedidos', 'dashboard', 'usuarios', 'chamados'], 'ver'));
drop policy "admins read all item checks" on order_item_checks;
create policy "staff read all item checks" on order_item_checks for select
  using (has_any_perm(array['pedidos', 'dashboard', 'usuarios'], 'ver'));

-- Detalhe do pedido: só quem vê Pedidos.
drop policy "admins read all order quote competitors" on order_quote_competitors;
create policy "staff read all order quote competitors" on order_quote_competitors for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all pedido groups" on pedido_groups;
create policy "staff read all pedido groups" on pedido_groups for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all pedido card items" on pedido_card_items;
create policy "staff read all pedido card items" on pedido_card_items for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all pedido accessory items" on pedido_accessory_items;
create policy "staff read all pedido accessory items" on pedido_accessory_items for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all store charge stores" on store_charge_stores;
create policy "staff read all store charge stores" on store_charge_stores for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all order events" on order_events;
create policy "staff read all order events" on order_events for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all order photos" on order_photos;
create policy "staff read all order photos" on order_photos for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all custody events" on custody_events;
create policy "staff read all custody events" on custody_events for select
  using (has_perm('pedidos', 'ver'));
drop policy "admins read all order pickups" on order_pickups;
create policy "staff read all order pickups" on order_pickups for select
  using (has_perm('pedidos', 'ver'));

drop policy "admins read all partner leads" on partner_leads;
create policy "staff read all partner leads" on partner_leads for select
  using (has_perm('formularios', 'ver'));
drop policy "admins read all store suggestions" on store_suggestions;
create policy "staff read all store suggestions" on store_suggestions for select
  using (has_perm('formularios', 'ver'));
drop policy "admins read all survey responses" on survey_responses;
create policy "staff read all survey responses" on survey_responses for select
  using (has_perm('pesquisa', 'ver'));
drop policy "admins read all preferred store links" on profile_preferred_stores;
create policy "staff read all preferred store links" on profile_preferred_stores for select
  using (has_perm('usuarios', 'ver'));
drop policy "admins read all custom preferred stores" on custom_preferred_stores;
create policy "staff read all custom preferred stores" on custom_preferred_stores for select
  using (has_perm('usuarios', 'ver'));
-- "admins read all profiles" continua com is_admin(): nome e e-mail de clientes
-- aparecem em várias áreas.

-- Cada um lê o próprio acesso; a lista completa é de quem vê Pessoas.
drop policy "admins read admins" on admins;
create policy "staff read own access" on admins for select using (user_id = auth.uid());
create policy "staff read all admins" on admins for select using (has_perm('pessoas', 'ver'));

-- Arquivos.
drop policy "admins upload store logos" on storage.objects;
drop policy "admins update store logos" on storage.objects;
drop policy "admins delete store logos" on storage.objects;
create policy "staff upload store logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'store-logos' and public.has_perm('lojas', 'upsert'));
create policy "staff update store logos" on storage.objects
  for update to authenticated using (bucket_id = 'store-logos' and public.has_perm('lojas', 'editar'));
create policy "staff delete store logos" on storage.objects
  for delete to authenticated using (bucket_id = 'store-logos' and public.has_perm('lojas', 'excluir'));

drop policy "admins upload order photos" on storage.objects;
drop policy "admins delete order photos" on storage.objects;
drop policy "admins and owners read order photos" on storage.objects;
create policy "staff upload order photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'order-photos' and public.has_perm('pedidos', 'editar'));
create policy "staff delete order photos" on storage.objects
  for delete to authenticated using (bucket_id = 'order-photos' and public.has_perm('pedidos', 'excluir'));
create policy "staff and owners read order photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-photos' and (
      public.has_perm('pedidos', 'ver')
      or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1] and o.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Equipe e convites
-- ---------------------------------------------------------------------------
create table team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('funcionario', 'prestador', 'entregador')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  phone text check (coalesce(char_length(phone), 0) <= 30),
  email text check (coalesce(char_length(email), 0) <= 200),
  document text check (coalesce(char_length(document), 0) <= 30),
  pix_key text check (coalesce(char_length(pix_key), 0) <= 120),
  notes text check (coalesce(char_length(notes), 0) <= 1000),
  user_id uuid unique references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table team_pay_rules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  kind text not null check (kind in (
    'fixo_mensal', 'por_rota', 'por_parada', 'por_coleta', 'por_entrega', 'por_volume', 'por_km', 'bonus'
  )),
  amount_brl numeric(10,2) not null check (amount_brl >= 0),
  note text check (coalesce(char_length(note), 0) <= 200),
  sort_order int not null default 0
);
create index team_pay_rules_member_idx on team_pay_rules (member_id);

create table staff_invites (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  role_id uuid not null references staff_roles(id) on delete cascade,
  job_title text check (coalesce(char_length(job_title), 0) <= 80),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null
);

alter table staff_roles enable row level security;
alter table staff_role_permissions enable row level security;
alter table team_members enable row level security;
alter table team_pay_rules enable row level security;
alter table staff_invites enable row level security;

create policy "staff read roles" on staff_roles for select using (has_perm('pessoas', 'ver'));
create policy "staff read role permissions" on staff_role_permissions for select using (has_perm('pessoas', 'ver'));
create policy "staff read team" on team_members for select using (has_perm('pessoas', 'ver'));
create policy "staff read team pay rules" on team_pay_rules for select using (has_perm('pessoas', 'ver'));
create policy "staff read invites" on staff_invites for select using (has_perm('pessoas', 'ver'));

revoke insert, update, delete on staff_roles, staff_role_permissions, team_members, team_pay_rules, staff_invites
  from anon, authenticated;
revoke select on staff_roles, staff_role_permissions, team_members, team_pay_rules, staff_invites from anon;

-- ---------------------------------------------------------------------------
-- 5. Meu acesso e lista de usuários do admin
-- ---------------------------------------------------------------------------
create or replace function public.my_staff_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when a.user_id is null then null else jsonb_build_object(
    'status', a.status,
    'roleId', r.id,
    'roleName', r.name,
    'isSystem', r.is_system,
    'jobTitle', a.job_title,
    'permissions', coalesce((
      select jsonb_object_agg(p.area, jsonb_build_object(
        'view', p.can_view, 'create', p.can_create, 'edit', p.can_edit, 'delete', p.can_delete))
      from staff_role_permissions p where p.role_id = r.id
    ), '{}'::jsonb)
  ) end
  from (select auth.uid() as uid) me
  left join admins a on a.user_id = me.uid
  left join staff_roles r on r.id = a.role_id;
$$;

create or replace function public.admin_list_staff()
returns table (
  user_id uuid,
  name text,
  email text,
  avatar_url text,
  job_title text,
  role_id uuid,
  role_name text,
  is_system_role boolean,
  status text,
  added_by_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_perm('pessoas', 'ver');
  return query
    select a.user_id, p.name, p.email, p.avatar_url, a.job_title, r.id, r.name, r.is_system,
           a.status, ab.name, a.created_at, u.last_sign_in_at
    from admins a
    join profiles p on p.id = a.user_id
    join staff_roles r on r.id = a.role_id
    left join profiles ab on ab.id = a.added_by
    left join auth.users u on u.id = a.user_id
    order by a.status, p.name;
end;
$$;

-- Sempre sobra ao menos um Administrador ativo.
create or replace function public._check_full_admin_left()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from admins a join staff_roles r on r.id = a.role_id
    where a.status = 'ativo' and r.is_system
  ) then
    raise exception 'É preciso manter ao menos um Administrador ativo.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_add_staff(p_email text, p_role uuid, p_job_title text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  perform _require_perm('pessoas', 'criar');
  if (select is_system from staff_roles where id = p_role) is null then
    raise exception 'Perfil inválido.' using errcode = 'P0001';
  end if;
  if (select is_system from staff_roles where id = p_role) and not is_full_admin() then
    raise exception 'Só um Administrador dá o perfil de Administrador.' using errcode = 'P0001';
  end if;
  select id into v_user from profiles where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Não encontramos uma conta com esse e-mail. Envie um link de convite.' using errcode = 'P0001';
  end if;
  if exists (select 1 from admins where user_id = v_user) then
    raise exception 'Essa pessoa já tem acesso ao backoffice.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_job_title, '')) > 80 then
    raise exception 'A função é longa demais.' using errcode = 'P0001';
  end if;
  insert into admins (user_id, role_id, job_title, added_by)
  values (v_user, p_role, nullif(btrim(coalesce(p_job_title, '')), ''), auth.uid());
  return v_user;
end;
$$;

create or replace function public.admin_update_staff(
  p_user uuid, p_role uuid, p_job_title text, p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_system boolean;
  v_new_system boolean;
begin
  perform _require_perm('pessoas', 'editar');
  select r.is_system into v_target_system
    from admins a join staff_roles r on r.id = a.role_id where a.user_id = p_user;
  if v_target_system is null then
    raise exception 'Usuário do admin não encontrado.' using errcode = 'P0001';
  end if;
  select is_system into v_new_system from staff_roles where id = p_role;
  if v_new_system is null then
    raise exception 'Perfil inválido.' using errcode = 'P0001';
  end if;
  if p_status not in ('ativo', 'inativo') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;
  if (v_target_system or v_new_system) and not is_full_admin() then
    raise exception 'Só um Administrador mexe no acesso de um Administrador.' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() and (p_status <> 'ativo' or (v_target_system and not v_new_system)) then
    raise exception 'Você não pode desativar nem reduzir o seu próprio acesso.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_job_title, '')) > 80 then
    raise exception 'A função é longa demais.' using errcode = 'P0001';
  end if;
  update admins set role_id = p_role, status = p_status,
    job_title = nullif(btrim(coalesce(p_job_title, '')), '')
    where user_id = p_user;
  perform _check_full_admin_left();
end;
$$;

-- As duas funções antigas da tela "Administradores" (0008): a de adicionar dá
-- o perfil Administrador, então passa a exigir um Administrador; a de remover
-- passa a proteger o último Administrador ativo (antes contava qualquer admin).
create or replace function public.admin_add_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  if not is_full_admin() then
    raise exception 'Só um Administrador dá o perfil de Administrador.' using errcode = 'P0001';
  end if;
  return admin_add_staff(p_email, '00000000-0000-4000-8000-000000000001', null);
end;
$$;

create or replace function public.admin_remove_admin(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  if p_target_user_id = auth.uid() then
    raise exception 'Você não pode remover seu próprio acesso.' using errcode = 'P0001';
  end if;
  if (select r.is_system from admins a join staff_roles r on r.id = a.role_id
      where a.user_id = p_target_user_id) and not is_full_admin() then
    raise exception 'Só um Administrador remove um Administrador.' using errcode = 'P0001';
  end if;
  delete from admins where user_id = p_target_user_id;
  if not found then
    raise exception 'Administrador não encontrado.' using errcode = 'P0001';
  end if;
  perform _check_full_admin_left();
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Perfis: criar, renomear, permissões, apagar
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_role(p_role uuid, p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_role is null then
    perform _require_perm('pessoas', 'criar');
  else
    perform _require_perm('pessoas', 'editar');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60
     or char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Confira o nome e a descrição do perfil.' using errcode = 'P0001';
  end if;
  if p_role is null then
    insert into staff_roles (name, description)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''))
    returning id into v_id;
  else
    if (select is_system from staff_roles where id = p_role) then
      raise exception 'O perfil Administrador não pode ser alterado.' using errcode = 'P0001';
    end if;
    update staff_roles set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), '')
      where id = p_role returning id into v_id;
    if v_id is null then
      raise exception 'Perfil não encontrado.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um perfil com esse nome.' using errcode = 'P0001';
end;
$$;

-- p: [{ "area", "view", "create", "edit", "delete" }]; quem cria/edita/exclui também vê.
create or replace function public.admin_set_role_permissions(p_role uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_c boolean; v_e boolean; v_d boolean;
begin
  perform _require_perm('pessoas', 'editar');
  if (select is_system from staff_roles where id = p_role) is null then
    raise exception 'Perfil não encontrado.' using errcode = 'P0001';
  end if;
  if (select is_system from staff_roles where id = p_role) then
    raise exception 'O perfil Administrador não pode ser alterado.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'array' then
    raise exception 'Permissões inválidas.' using errcode = 'P0001';
  end if;
  delete from staff_role_permissions where role_id = p_role;
  for it in select value from jsonb_array_elements(p) loop
    if not ((it ->> 'area') = any (_staff_areas())) then
      raise exception 'Área inválida: %.', it ->> 'area' using errcode = 'P0001';
    end if;
    v_c := coalesce((it ->> 'create')::boolean, false);
    v_e := coalesce((it ->> 'edit')::boolean, false);
    v_d := coalesce((it ->> 'delete')::boolean, false);
    if coalesce((it ->> 'view')::boolean, false) or v_c or v_e or v_d then
      insert into staff_role_permissions (role_id, area, can_view, can_create, can_edit, can_delete)
      values (p_role, it ->> 'area', true, v_c, v_e, v_d)
      on conflict (role_id, area) do update set
        can_view = true, can_create = excluded.can_create,
        can_edit = excluded.can_edit, can_delete = excluded.can_delete;
    end if;
  end loop;
exception
  when invalid_text_representation then
    raise exception 'Permissões inválidas.' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_delete_role(p_role uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pessoas', 'excluir');
  if (select is_system from staff_roles where id = p_role) is null then
    raise exception 'Perfil não encontrado.' using errcode = 'P0001';
  end if;
  if (select is_system from staff_roles where id = p_role) then
    raise exception 'O perfil Administrador não pode ser apagado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from admins where role_id = p_role) then
    raise exception 'Há usuários com este perfil. Troque o perfil deles antes.' using errcode = 'P0001';
  end if;
  delete from staff_roles where id = p_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Convites
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_invite(p_role uuid, p_job_title text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_system boolean;
begin
  perform _require_perm('pessoas', 'criar');
  select is_system into v_system from staff_roles where id = p_role;
  if v_system is null then
    raise exception 'Perfil inválido.' using errcode = 'P0001';
  end if;
  if v_system and not is_full_admin() then
    raise exception 'Só um Administrador convida um Administrador.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_job_title, '')) > 80 then
    raise exception 'A função é longa demais.' using errcode = 'P0001';
  end if;
  insert into staff_invites (token, role_id, job_title, created_by)
  values (v_token, p_role, nullif(btrim(coalesce(p_job_title, '')), ''), auth.uid());
  return v_token;
end;
$$;

create or replace function public.admin_revoke_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_perm('pessoas', 'excluir');
  update staff_invites set revoked_at = now()
    where token = p_token and used_at is null and revoked_at is null;
  if not found then
    raise exception 'Convite não encontrado ou já usado.' using errcode = 'P0001';
  end if;
end;
$$;

-- Público: o que a página /convite/<token> mostra antes de aceitar.
create or replace function public.invite_lookup(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'found', true,
      'roleName', r.name,
      'jobTitle', i.job_title,
      'state', case
        when i.used_at is not null then 'used'
        when i.revoked_at is not null then 'revoked'
        when i.expires_at < now() then 'expired'
        else 'valid' end,
      'expiresAt', i.expires_at
    )
    from staff_invites i join staff_roles r on r.id = i.role_id
    where i.token = p_token
  ), jsonb_build_object('found', false));
$$;

create or replace function public.accept_staff_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv staff_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar o convite.' using errcode = 'P0001';
  end if;
  select * into v_inv from staff_invites where token = p_token for update;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0001';
  end if;
  if v_inv.used_at is not null then
    raise exception 'Este convite já foi usado.' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'Este convite foi cancelado.' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Este convite venceu. Peça um novo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Sua conta já tem acesso ao backoffice.' using errcode = 'P0001';
  end if;
  insert into admins (user_id, role_id, job_title, added_by)
  values (v_uid, v_inv.role_id, v_inv.job_title, v_inv.created_by);
  update staff_invites set used_at = now(), used_by = v_uid where token = p_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Equipe
-- ---------------------------------------------------------------------------
-- p: { name, kind, status, phone, email, document, pixKey, notes, linkEmail }
-- linkEmail: e-mail da conta a ligar ("" desliga).
create or replace function public.admin_upsert_team_member(p_member uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid;
  v_link text := btrim(coalesce(p ->> 'linkEmail', ''));
begin
  if p_member is null then
    perform _require_perm('pessoas', 'criar');
  else
    perform _require_perm('pessoas', 'editar');
  end if;
  if char_length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 120 then
    raise exception 'Informe o nome.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'kind', '') not in ('funcionario', 'prestador', 'entregador') then
    raise exception 'Escolha o tipo.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'status', 'ativo') not in ('ativo', 'inativo') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;
  if v_link <> '' then
    select id into v_user from profiles where lower(email) = lower(v_link);
    if v_user is null then
      raise exception 'Não encontramos uma conta com esse e-mail.' using errcode = 'P0001';
    end if;
  end if;

  if p_member is null then
    insert into team_members (name, kind, status, phone, email, document, pix_key, notes, user_id)
    values (
      btrim(p ->> 'name'), p ->> 'kind', coalesce(p ->> 'status', 'ativo'),
      nullif(btrim(coalesce(p ->> 'phone', '')), ''), nullif(btrim(coalesce(p ->> 'email', '')), ''),
      nullif(btrim(coalesce(p ->> 'document', '')), ''), nullif(btrim(coalesce(p ->> 'pixKey', '')), ''),
      nullif(btrim(coalesce(p ->> 'notes', '')), ''), v_user
    )
    returning id into v_id;
  else
    update team_members set
      name = btrim(p ->> 'name'), kind = p ->> 'kind', status = coalesce(p ->> 'status', 'ativo'),
      phone = nullif(btrim(coalesce(p ->> 'phone', '')), ''), email = nullif(btrim(coalesce(p ->> 'email', '')), ''),
      document = nullif(btrim(coalesce(p ->> 'document', '')), ''), pix_key = nullif(btrim(coalesce(p ->> 'pixKey', '')), ''),
      notes = nullif(btrim(coalesce(p ->> 'notes', '')), ''), user_id = v_user, updated_at = now()
    where id = p_member
    returning id into v_id;
    if v_id is null then
      raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Essa conta já está ligada a outra pessoa da equipe.' using errcode = 'P0001';
  when check_violation then
    raise exception 'Algum campo passou do limite de tamanho.' using errcode = 'P0001';
end;
$$;

-- p: [{ kind, amountBRL, note }] — substitui todas as regras da pessoa.
create or replace function public.admin_set_team_pay_rules(p_member uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_i int := 0;
begin
  perform _require_perm('pessoas', 'editar');
  if not exists (select 1 from team_members where id = p_member) then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 20 then
    raise exception 'Regras de remuneração inválidas.' using errcode = 'P0001';
  end if;
  delete from team_pay_rules where member_id = p_member;
  for it in select value from jsonb_array_elements(p) loop
    v_i := v_i + 1;
    insert into team_pay_rules (member_id, kind, amount_brl, note, sort_order)
    values (p_member, it ->> 'kind', round((it ->> 'amountBRL')::numeric, 2),
            nullif(btrim(coalesce(it ->> 'note', '')), ''), v_i);
  end loop;
exception
  when invalid_text_representation or check_violation or not_null_violation then
    raise exception 'Confira o tipo e o valor de cada regra.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function
  _staff_areas(),
  has_any_perm(text[], text),
  is_full_admin(),
  _require_perm(text, text),
  _check_full_admin_left(),
  my_staff_access(),
  admin_list_staff(),
  admin_add_staff(text, uuid, text),
  admin_update_staff(uuid, uuid, text, text),
  admin_upsert_role(uuid, text, text),
  admin_set_role_permissions(uuid, jsonb),
  admin_delete_role(uuid),
  admin_create_invite(uuid, text),
  admin_revoke_invite(text),
  invite_lookup(text),
  accept_staff_invite(text),
  admin_upsert_team_member(uuid, jsonb),
  admin_set_team_pay_rules(uuid, jsonb)
from public, anon, authenticated;

-- has_perm e is_admin são usados nas policies: precisam ser executáveis por quem consulta.
grant execute on function has_perm(text, text), has_any_perm(text[], text) to anon, authenticated;
grant execute on function
  my_staff_access(),
  admin_list_staff(),
  admin_add_staff(text, uuid, text),
  admin_update_staff(uuid, uuid, text, text),
  admin_upsert_role(uuid, text, text),
  admin_set_role_permissions(uuid, jsonb),
  admin_delete_role(uuid),
  admin_create_invite(uuid, text),
  admin_revoke_invite(text),
  accept_staff_invite(text),
  admin_upsert_team_member(uuid, jsonb),
  admin_set_team_pay_rules(uuid, jsonb)
to authenticated;
grant execute on function invite_lookup(text) to anon, authenticated;
