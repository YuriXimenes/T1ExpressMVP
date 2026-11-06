-- Desfaz a 0023a: desativa o tipo (não apaga, porque ocorrências podem usá-lo).
update occurrence_types set active = false where name = 'Dúvida ou outro assunto';
