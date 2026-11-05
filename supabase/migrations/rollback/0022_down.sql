-- Desfaz 0022_finance.sql. APAGA despesas, categorias, ajustes e pagamentos da
-- equipe, reembolsos e sinistros. Arquivos do bucket finance-docs não são
-- apagados por SQL (o bucket fica).
drop policy if exists "finance docs upload" on storage.objects;
drop policy if exists "finance docs read" on storage.objects;
drop policy if exists "finance docs delete" on storage.objects;
drop policy if exists "finance staff upload store receipts" on storage.objects;
drop policy if exists "finance staff read store receipts" on storage.objects;
drop trigger if exists occurrence_resolutions_finance on occurrence_resolutions;

create or replace function public._occ_json(p_occ uuid, p_role text, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', c.id,
    'number', c.number,
    'typeId', c.type_id,
    'typeName', t.name,
    'systemKind', t.system_kind,
    'orderId', c.order_id,
    'storeCode', s.code,
    'storeName', s.name,
    'tripId', c.trip_id,
    'stopId', c.stop_id,
    'openedKind', c.opened_kind,
    'openedByName', case when p_role = 'admin' or c.opened_kind = 'customer' then op.name end,
    'description', c.description,
    'status', c.status,
    'assigneeId', case when p_role = 'admin' then c.assignee_id end,
    'assigneeName', case when p_role = 'admin' then asg.name end,
    'dueAt', c.due_at,
    'resolvedAt', c.resolved_at,
    'autoCloseAt', c.auto_close_at,
    'closedAt', c.closed_at,
    'lat', case when p_role in ('admin', 'driver') then c.lat end,
    'lng', case when p_role in ('admin', 'driver') then c.lng end,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at,
    'updates', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', u.id, 'kind', u.kind, 'body', u.body, 'from', u.from_value, 'to', u.to_value,
        'internal', u.internal, 'authorKind', u.author_kind,
        'authorName', case when p_role = 'admin' or u.author_kind <> 'admin' then au.name end,
        'createdAt', u.created_at)) order by u.created_at, u.id)
      from occurrence_updates u left join profiles au on au.id = u.author_id
      where u.occurrence_id = c.id and (p_role = 'admin' or not u.internal)), '[]'::jsonb) end,
    'attachments', case when p_full then coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'mime', a.mime,
        'authorKind', a.author_kind, 'createdAt', a.created_at) order by a.created_at)
      from occurrence_attachments a where a.occurrence_id = c.id), '[]'::jsonb) end,
    'resolutions', case when p_full then coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'kind', r.kind,
        'amountBrl', r.amount_brl, 'couponCode', r.coupon_code,
        'couponType', (select cp.type from coupons cp where cp.code = r.coupon_code), 'newGuardUntil', r.new_guard_until,
        'note', case when p_role = 'admin' then r.note end, 'createdAt', r.created_at)) order by r.created_at)
      from occurrence_resolutions r where r.occurrence_id = c.id), '[]'::jsonb) end
  ))
  from occurrences c
  join occurrence_types t on t.id = c.type_id
  left join stores s on s.id = c.store_id
  left join profiles op on op.id = c.opened_by
  left join profiles asg on asg.id = c.assignee_id
  where c.id = p_occ;
$$;

drop function if exists public.admin_finance_overview(date);
drop function if exists public._finance_month(date);
drop function if exists public.admin_pay_claim(uuid, date, text, text);
drop function if exists public.admin_set_claim_status(uuid, text, numeric, text);
drop function if exists public.admin_set_claim_items(uuid, jsonb);
drop function if exists public.admin_open_claim(uuid, text);
drop function if exists public.admin_claim(uuid);
drop function if exists public.admin_claims();
drop function if exists public._claim_json(uuid, boolean);
drop function if exists public.admin_cancel_refund(uuid, text);
drop function if exists public.admin_pay_refund(uuid, date, text, text);
drop function if exists public.admin_finance_store_payout(text, date, numeric, date, text, text);
drop function if exists public.admin_register_team_payout(uuid, date, numeric, date, text, text);
drop function if exists public.admin_remove_team_adjustment(uuid);
drop function if exists public.admin_add_team_adjustment(uuid, date, numeric, text);
drop function if exists public.admin_payouts_month(date);
drop function if exists public.admin_add_expense_file(uuid, text, text, text);
drop function if exists public.admin_delete_expense(uuid);
drop function if exists public.admin_pay_expense(uuid, date, text);
drop function if exists public.admin_review_expense(uuid, boolean, text);
drop function if exists public.admin_save_expense(uuid, jsonb);
drop function if exists public.admin_upsert_expense_category(uuid, jsonb);
drop function if exists public.admin_expenses(date, date);
drop function if exists public._occ_resolution_finance();
drop function if exists public._claim_log(uuid, text, text);
drop function if exists public._claim_declared(jsonb);
drop function if exists public._team_statement(uuid, date);
drop function if exists public._finance_folder_area(text);

drop table if exists claim_events;
drop table if exists claims;
drop table if exists customer_refunds;
drop table if exists team_payouts;
drop table if exists team_adjustments;
drop table if exists expense_files;
drop table if exists expenses;
drop table if exists expense_categories;
