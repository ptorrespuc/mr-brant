-- ============================================================
-- Mr.Brant — CPF do cliente (necessário para a Declaração de Conteúdo)
-- Rode no SQL Editor.
-- ============================================================
alter table orders    add column if not exists customer_cpf text;
alter table customers add column if not exists cpf          text;
