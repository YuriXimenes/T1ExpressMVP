-- Etapas novas do pedido (parte 1 de 2). Aplicar ANTES da 0019_stage_flow.sql:
-- o Postgres só deixa usar um valor novo de enum depois que ele foi gravado.
-- Só acrescenta valores; não muda nenhum pedido.
--
-- Ordem final: aguardando-coleta → em-transporte-coleta → em-transporte
-- ("A caminho da central": já coletado em todas as lojas) → recebido-na-central
-- → em-transporte-retirada → disponivel-para-retirada.
alter type delivery_stage add value if not exists 'em-transporte-coleta' before 'em-transporte';
alter type delivery_stage add value if not exists 'recebido-na-central' after 'em-transporte';
alter type delivery_stage add value if not exists 'em-transporte-retirada' after 'recebido-na-central';
