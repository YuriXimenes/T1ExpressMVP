-- Preserva a ordem de exibição atual dos pontos de retirada (home / /pontos-t1),
-- que não segue a ordem alfabética nem a ordem dos códigos das lojas.
-- Puramente aditivo: só adiciona uma coluna opcional.

alter table stores add column if not exists pickup_sort_order int;

update stores set pickup_sort_order = 1 where code = 'fs-01'; -- Cards of Paradise
update stores set pickup_sort_order = 2 where code = 'fs-11'; -- Konklave
update stores set pickup_sort_order = 3 where code = 'fs-05'; -- Magic Store Brasil
update stores set pickup_sort_order = 4 where code = 'fs-09'; -- Collect & Play
