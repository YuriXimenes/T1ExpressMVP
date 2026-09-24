-- Etapa 5 (painel admin): pedidos passam a poder ser cancelados por um
-- administrador. Isolado numa migração própria porque o Postgres não deixa
-- usar um valor de enum novo na mesma transação em que ele foi criado — o
-- resto da Etapa 5 (0008_admin_panel.sql), que referencia 'cancelled', só
-- pode rodar depois que esta migração já tiver sido aplicada e commitada.
--
-- Não existe "down" fácil para isto: o Postgres não permite remover um valor
-- de enum (só recriar o tipo do zero, o que exigiria recriar todas as
-- colunas que o usam). Ver a nota em rollback/0008_down.sql.

alter type order_status add value 'cancelled';
