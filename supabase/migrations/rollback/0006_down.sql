-- Desfaz 0006_public_leads.sql. Só rode se precisar voltar atrás (o código
-- antigo não usa nada disso). As tabelas só devem ter dado de teste até o
-- deploy real acontecer.

revoke execute on function submit_partner_lead(jsonb), submit_store_suggestion(jsonb)
  from anon, authenticated;
drop function if exists public.submit_store_suggestion(jsonb);
drop function if exists public.submit_partner_lead(jsonb);
drop table if exists store_suggestions;
drop table if exists partner_leads;
