-- Desfaz 0009_store_logos.sql. Só rode se precisar voltar atrás.
--
-- NÃO apaga o bucket `store-logos` nem os arquivos dele: o Supabase não deixa
-- remover objetos do Storage por SQL, e lojas podem estar apontando para esses
-- logos. Se quiser apagar, esvazie e remova o bucket pelo painel do Supabase.

drop policy if exists "admins upload store logos" on storage.objects;
drop policy if exists "admins update store logos" on storage.objects;
drop policy if exists "admins delete store logos" on storage.objects;

-- admin_upsert_store volta à versão da 0008 (sem validar logo/coordenadas).
create or replace function public.admin_upsert_store(p_store_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_next_num int;
begin
  perform _require_admin();
  if coalesce(p ->> 'name', '') = '' or coalesce(p ->> 'address', '') = ''
     or coalesce(p ->> 'city', '') = '' or char_length(coalesce(p ->> 'state', '')) <> 2 then
    raise exception 'Confira os dados da loja.' using errcode = 'P0001';
  end if;
  if char_length(p ->> 'name') > 200 or char_length(p ->> 'address') > 300
     or coalesce(char_length(p ->> 'neighborhood'), 0) > 120 or char_length(p ->> 'city') > 120
     or coalesce(char_length(p ->> 'logoPath'), 0) > 300 then
    raise exception 'Confira os dados da loja — algum campo passou do limite de tamanho.' using errcode = 'P0001';
  end if;

  if p_store_id is null then
    select coalesce(max(substring(code from '^fs-([0-9]+)$')::int), 0) + 1 into v_next_num from stores;
    v_code := 'fs-' || lpad(v_next_num::text, 2, '0');
    insert into stores (code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point, pickup_sort_order)
    values (
      v_code, btrim(p ->> 'name'), btrim(p ->> 'address'), nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      btrim(p ->> 'city'), upper(btrim(p ->> 'state')),
      nullif(p ->> 'lat', '')::double precision, nullif(p ->> 'lng', '')::double precision,
      nullif(btrim(coalesce(p ->> 'logoPath', '')), ''), coalesce((p ->> 'logoOnDark')::boolean, false),
      coalesce((p ->> 'isPickupPoint')::boolean, false), nullif(p ->> 'pickupSortOrder', '')::int
    )
    returning id into v_id;
  else
    update stores set
      name = btrim(p ->> 'name'), address = btrim(p ->> 'address'),
      neighborhood = nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      city = btrim(p ->> 'city'), state = upper(btrim(p ->> 'state')),
      lat = nullif(p ->> 'lat', '')::double precision, lng = nullif(p ->> 'lng', '')::double precision,
      logo_path = nullif(btrim(coalesce(p ->> 'logoPath', '')), ''),
      logo_on_dark = coalesce((p ->> 'logoOnDark')::boolean, false),
      is_pickup_point = coalesce((p ->> 'isPickupPoint')::boolean, false),
      pickup_sort_order = nullif(p ->> 'pickupSortOrder', '')::int
    where id = p_store_id
    returning id into v_id;
    if not found then
      raise exception 'Loja não encontrada.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when invalid_text_representation then
    raise exception 'Confira os números informados (latitude, longitude, ordem).' using errcode = 'P0001';
end;
$$;
