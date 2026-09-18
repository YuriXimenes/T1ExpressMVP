-- Número da rua separado do logradouro no perfil. Puramente aditivo.
alter table profiles add column if not exists street_number text;
