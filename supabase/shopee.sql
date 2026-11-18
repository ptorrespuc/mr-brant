-- ============================================================
-- Mr.Brant — Link do produto na Shopee
-- Se preenchido, a página do produto mostra também o botão
-- "Comprar na Shopee". Coluna opcional: não afeta o site atual.
-- Rode no SQL Editor.
-- ============================================================
alter table products add column if not exists shopee_url text;
