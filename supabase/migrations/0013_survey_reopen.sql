-- Reabre a pesquisa de quem já tinha CONCLUÍDO antes do bloco "Simulação de
-- Caso" existir, para essas pessoas responderem só o bloco novo.
--
-- Não apaga nem altera nenhuma resposta: só tira a marca de "concluída". O
-- banner de /conta volta para elas, que respondem apenas o que falta e ficam
-- "Concluída" de novo ao enviar. Quem já respondeu a simulação não é afetado.
--
-- RODE SÓ DEPOIS de o código com o bloco novo estar publicado no site.
-- É seguro rodar mais de uma vez.

update survey_responses
set completed_at = null
where completed_at is not null
  and coalesce(answers ->> 'sim_decision', '') = '';
