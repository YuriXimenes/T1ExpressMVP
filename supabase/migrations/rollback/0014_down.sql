-- Desfaz 0014_order_events.sql. APAGA toda a linha do tempo dos pedidos.
-- Os pedidos em si não mudam.
drop trigger if exists support_tickets_log_events on support_tickets;
drop trigger if exists store_charges_log_events on store_charges;
drop trigger if exists orders_log_events on orders;
drop function if exists public.admin_move_order(uuid, text, text);
drop function if exists public._support_tickets_log_events();
drop function if exists public._store_charges_log_events();
drop function if exists public._orders_log_events();
drop function if exists public._log_order_event(uuid, uuid, text, text, text, jsonb, text);
drop function if exists public._order_event_actor(uuid);
drop table if exists order_events;
