-- Desfaz a 0024_platform_metrics.sql (as simulações registradas são apagadas).
drop function if exists admin_metrics_summary(date, date);
drop function if exists admin_metrics_comparator(int);
drop function if exists admin_metrics_store_requests();
drop function if exists admin_metrics_abandoned(date, date);
drop function if exists admin_metrics_customers(date, date);
drop function if exists admin_metrics_pricing(date, date);
drop function if exists admin_metrics_demand(date, date);
drop function if exists admin_metrics_funnel(date, date);
drop function if exists _savings_bucket(boolean, numeric, numeric, numeric, numeric);
drop function if exists _route_label(uuid[], uuid);
drop function if exists _in_days(timestamptz, date, date);
drop function if exists mark_simulation(uuid, text, text, uuid);
drop function if exists log_simulation(jsonb);
drop table if exists freight_simulations;

drop trigger if exists freight_routes_touch on freight_routes;
drop function if exists _freight_routes_touch();
alter table freight_routes drop column if exists updated_at;

delete from staff_role_permissions where area = 'indicadores';
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
