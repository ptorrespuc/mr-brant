-- ============================================================
-- Mr.Brant — Geração de etiqueta (Melhor Envio)
-- Rode no SQL Editor.
-- ============================================================

-- dados de frete/etiqueta no pedido
alter table orders add column if not exists shipping_service_id int;     -- id do serviço (Correios PAC=1, SEDEX=2...)
alter table orders add column if not exists ship_weight_g  int;          -- peso do pacote (g)
alter table orders add column if not exists ship_length_cm int;
alter table orders add column if not exists ship_width_cm  int;
alter table orders add column if not exists ship_height_cm int;
alter table orders add column if not exists melhorenvio_id text;          -- id do envio no Melhor Envio
alter table orders add column if not exists label_url      text;          -- PDF da etiqueta + declaração

-- configurações do remetente (para a etiqueta/declaração)
insert into settings (key, value) values
  ('remet_nome',       ''),
  ('remet_documento',  ''),   -- CPF/CNPJ (só dígitos)
  ('remet_telefone',   ''),
  ('remet_endereco',   ''),
  ('remet_numero',     ''),
  ('remet_complemento',''),
  ('remet_bairro',     ''),
  ('remet_cidade',     ''),
  ('remet_uf',         ''),
  ('melhorenvio_sandbox', 'false')  -- 'true' = ambiente de teste do Melhor Envio
on conflict (key) do nothing;
