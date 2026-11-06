-- "Precisa de ajuda?" do pedido passa a usar as ocorrências também para dúvidas
-- (conversa, status e prazo em um lugar só). Cria o tipo que o cliente escolhe
-- quando não é um problema da lista. Pode ser aplicada de novo sem efeito colateral.
-- Ver rollback/0023a_down.sql.
insert into occurrence_types (name, description, customer_can, driver_can, requires_photo, deadline_hours, sort)
values ('Dúvida ou outro assunto', 'Perguntas sobre o pedido, a retirada ou o pagamento.', true, false, false, 72, 90)
on conflict (name) do update set customer_can = true, active = true;
