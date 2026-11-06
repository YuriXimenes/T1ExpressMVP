-- Desfaz a 0025_system.sql (auditoria, avisos lidos e erros registrados são apagados).
do $$
declare
  t text;
begin
  foreach t in array array['stores','freight_routes','carrier_flat_rates','comparison_carriers','comparison_rows',
    'comparison_values','coupons','pricing_versions','orders','store_charges','order_item_checks','order_photos',
    'custody_events','order_pickups','support_tickets','partner_leads','store_suggestions','admins','staff_roles',
    'staff_role_permissions','staff_invites','team_members','team_pay_rules','vehicles','fuel_prices','ops_settings',
    'store_closures','trips','routes','route_stops','route_stop_orders','occurrence_types','occurrences',
    'occurrence_resolutions','occurrence_attachments','store_partner_profiles','partner_onboardings',
    'partner_documents','store_members','store_invites','store_pay_rules','store_payouts','team_adjustments',
    'team_payouts','customer_refunds','expense_categories','expenses','expense_files','claims','customer_credits'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
  end loop;
end;
$$;
drop function if exists system_health();
drop function if exists admin_resolve_error(uuid);
drop function if exists admin_errors(text);
drop function if exists log_client_error(jsonb);
drop table if exists app_errors;
drop function if exists admin_mark_notifications(text[]);
drop function if exists admin_notifications();
drop table if exists admin_notification_reads;
drop function if exists admin_audit(jsonb);
drop function if exists _audit();
drop function if exists _audit_label(text, jsonb);
drop function if exists _audit_value(text, jsonb);
drop table if exists audit_log;
drop function if exists _schema_version();
