-- Desfaz 0012_survey.sql. APAGA todas as respostas da pesquisa.
drop function if exists public.complete_survey();
drop function if exists public.save_survey_answers(jsonb);
drop function if exists public.start_survey();
drop function if exists public._brl(numeric);
drop table if exists survey_responses;
