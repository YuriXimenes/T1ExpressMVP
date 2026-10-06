-- Admin: área "Usuários" (somente leitura).
--
-- 1. Admin passa a ler as lojas preferidas de qualquer usuário (policies
--    paralelas às existentes; nenhuma policy antiga é alterada).
-- 2. admin_list_users(): lista todos os usuários com dados que só existem em
--    auth.users (último acesso, e-mail confirmado), que o app não alcança.

create policy "admins read all preferred store links" on profile_preferred_stores
  for select using (public.is_admin());

create policy "admins read all custom preferred stores" on custom_preferred_stores
  for select using (public.is_admin());

create or replace function public.admin_list_users()
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  city text,
  state text,
  avatar_url text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  order_count bigint,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_admin();
  return query
    select
      p.id, p.name, p.email, p.phone, p.city, p.state, p.avatar_url,
      coalesce(u.created_at, p.created_at),
      u.last_sign_in_at,
      u.email_confirmed_at is not null,
      (select count(*) from orders o where o.user_id = p.id),
      exists (select 1 from admins a where a.user_id = p.id)
    from profiles p
    left join auth.users u on u.id = p.id
    order by coalesce(u.created_at, p.created_at) desc;
end;
$$;

revoke all on function admin_list_users() from public, anon, authenticated;
grant execute on function admin_list_users() to authenticated;
