-- Desfaz 0011_admin_users.sql.
drop function if exists public.admin_list_users();
drop policy if exists "admins read all custom preferred stores" on custom_preferred_stores;
drop policy if exists "admins read all preferred store links" on profile_preferred_stores;
