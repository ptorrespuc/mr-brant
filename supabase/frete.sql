-- ============================================================
-- Mr.Brant — Cálculo de frete (Melhor Envio)
-- Rode no SQL Editor (depois do schema.sql e settings.sql).
-- ============================================================

-- Peso e dimensões por tamanho (para o cálculo de frete)
alter table product_sizes add column if not exists weight_g  int;  -- peso em gramas
alter table product_sizes add column if not exists length_cm int;  -- comprimento (cm)
alter table product_sizes add column if not exists width_cm  int;  -- largura (cm)
alter table product_sizes add column if not exists height_cm int;  -- altura (cm)

-- Configurações de frete (CEP de origem + pacote padrão usado quando o tamanho não tem medidas)
insert into settings (key, value) values
  ('frete_cep_origem',   ''),     -- CEP de onde você envia (só dígitos)
  ('frete_peso_padrao',  '500'),  -- gramas
  ('frete_comp_padrao',  '20'),   -- cm
  ('frete_larg_padrao',  '15'),   -- cm
  ('frete_alt_padrao',   '15'),   -- cm
  ('frete_sandbox',      'true'),  -- 'true' = ambiente de teste do Melhor Envio
  ('frete_empresas',     '')       -- transportadoras permitidas (ex.: 'Correios'); vazio = todas
on conflict (key) do nothing;
