-- Desfaz 0022a: tira a função e reativa a categoria "Salários". O nome da categoria
-- "Combustível fora das viagens" volta para o original.
drop function if exists public.admin_expenses_auto(date);
update expense_categories set active = true where grp = 'pessoal' and name = 'Salários';
update expense_categories set name = 'Combustível avulso'
  where grp = 'operacao' and name = 'Combustível fora das viagens'
    and not exists (select 1 from expense_categories where grp = 'operacao' and name = 'Combustível avulso');
