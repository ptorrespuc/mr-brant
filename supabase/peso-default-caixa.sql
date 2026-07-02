-- ============================================================
-- Mr.Brant — Corrige o peso dos tamanhos para o padrão da caixa
-- OPÇÃO B (segura): só ajusta os tamanhos cujo peso está ABAIXO
-- do padrão da caixa. Não mexe nos que já estão iguais ou maiores
-- (peças pesadas cujo peso real pode ser maior que o padrão).
-- ============================================================

-- (Opcional) Conferir ANTES o que será alterado:
-- select p.name, ps.label, ps.weight_g as peso_atual,
--        bs.default_weight_g as peso_novo
-- from product_sizes ps
-- join box_sizes bs on bs.id = ps.box_size_id
-- left join products p on p.id = ps.product_id
-- where ps.weight_g < bs.default_weight_g
-- order by p.name, ps.label;

update product_sizes ps
set weight_g = bs.default_weight_g
from box_sizes bs
where ps.box_size_id = bs.id
  and ps.weight_g < bs.default_weight_g;

-- Conferir DEPOIS (nenhuma linha deve ter peso abaixo do padrão):
-- select p.name, ps.label, ps.weight_g, bs.default_weight_g
-- from product_sizes ps
-- join box_sizes bs on bs.id = ps.box_size_id
-- left join products p on p.id = ps.product_id
-- where ps.weight_g < bs.default_weight_g
-- order by p.name, ps.label;
