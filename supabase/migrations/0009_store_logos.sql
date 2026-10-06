-- Logos das lojas enviados pelo admin (upload em vez de digitar caminho).
--
-- 1. Bucket público `store-logos`: qualquer um lê pela URL pública (é o que o
--    site exibe); só admin envia, troca ou apaga. Tipos e tamanho limitados no
--    próprio bucket. SVG fica de fora de propósito: pode carregar script.
-- 2. `admin_upsert_store` passa a recusar logo que o site não consegue exibir
--    (ex.: um caminho do computador como `C:\...`, que derrubava páginas) e
--    coordenadas fora da faixa ou pela metade.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-logos', 'store-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Sem policy de select: a URL pública funciona sem ela, e assim ninguém lista
-- o conteúdo do bucket pela API.
create policy "admins upload store logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'store-logos' and public.is_admin());

create policy "admins update store logos" on storage.objects
  for update to authenticated using (bucket_id = 'store-logos' and public.is_admin());

create policy "admins delete store logos" on storage.objects
  for delete to authenticated using (bucket_id = 'store-logos' and public.is_admin());

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
  v_logo text := nullif(btrim(coalesce(p ->> 'logoPath', '')), '');
  v_lat double precision;
  v_lng double precision;
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
  if v_logo is not null
     and v_logo !~ '^/logos/[A-Za-z0-9_.-]+$'
     and v_logo !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/store-logos/[A-Za-z0-9_./-]+$' then
    raise exception 'Logo inválido. Envie a imagem pelo botão "Enviar logo".' using errcode = 'P0001';
  end if;

  v_lat := nullif(p ->> 'lat', '')::double precision;
  v_lng := nullif(p ->> 'lng', '')::double precision;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'Informe latitude e longitude juntas (ou deixe as duas em branco).' using errcode = 'P0001';
  end if;
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Latitude ou longitude fora da faixa válida.' using errcode = 'P0001';
  end if;

  if p_store_id is null then
    select coalesce(max(substring(code from '^fs-([0-9]+)$')::int), 0) + 1 into v_next_num from stores;
    v_code := 'fs-' || lpad(v_next_num::text, 2, '0');
    insert into stores (code, name, address, neighborhood, city, state, lat, lng, logo_path, logo_on_dark, is_pickup_point, pickup_sort_order)
    values (
      v_code, btrim(p ->> 'name'), btrim(p ->> 'address'), nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      btrim(p ->> 'city'), upper(btrim(p ->> 'state')),
      v_lat, v_lng,
      v_logo, coalesce((p ->> 'logoOnDark')::boolean, false),
      coalesce((p ->> 'isPickupPoint')::boolean, false), nullif(p ->> 'pickupSortOrder', '')::int
    )
    returning id into v_id;
  else
    update stores set
      name = btrim(p ->> 'name'), address = btrim(p ->> 'address'),
      neighborhood = nullif(btrim(coalesce(p ->> 'neighborhood', '')), ''),
      city = btrim(p ->> 'city'), state = upper(btrim(p ->> 'state')),
      lat = v_lat, lng = v_lng,
      logo_path = v_logo,
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

-- `create or replace` mantém os grants da 0008 (execute só para authenticated).
