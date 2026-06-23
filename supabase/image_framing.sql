-- ============================================================
-- Mr.Brant — Enquadramento de imagem por produto
-- Rode no SQL Editor (depois do schema.sql).
-- ============================================================

-- image_fit: 'cover' (preenche, pode cortar) ou 'contain' (mostra a peça inteira)
alter table products add column if not exists image_fit text not null default 'cover';

-- image_pos: posição vertical no modo 'cover' (0 = topo, 100 = base)
alter table products add column if not exists image_pos int not null default 50;

-- image_pos_x: posição horizontal no modo 'cover' (0 = esquerda, 100 = direita)
alter table products add column if not exists image_pos_x int not null default 50;

-- image_zoom: zoom no modo 'cover' em % (100 = largura do espaço; maior = zoom in)
alter table products add column if not exists image_zoom int not null default 100;
