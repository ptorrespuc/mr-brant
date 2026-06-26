-- ============================================================
-- Mr.Brant — Catálogo de tamanhos (caixas)
-- Cada tamanho = uma caixa com dimensões e peso padrão (opcional).
-- O produto referencia um tamanho; o peso é informado por produto
-- (pré-preenchido pelo padrão do tamanho).
-- Rode no SQL Editor depois do schema.sql e do frete.sql.
-- ============================================================

create table if not exists box_sizes (
  id                uuid primary key default gen_random_uuid(),
  label             text not null,        -- ex.: "30 cm"
  length_cm         int,                  -- comprimento da caixa
  width_cm          int,                  -- largura
  height_cm         int,                  -- altura
  default_weight_g  int,                  -- peso padrão (opcional)
  sort              int not null default 0,
  created_at        timestamptz not null default now()
);

alter table box_sizes enable row level security;
drop policy if exists "public read box_sizes" on box_sizes;
create policy "public read box_sizes" on box_sizes for select using (true);
drop policy if exists "auth write box_sizes" on box_sizes;
create policy "auth write box_sizes" on box_sizes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- product_sizes passa a referenciar um tamanho do catálogo.
-- (As colunas antigas de dimensão continuam por compatibilidade.)
alter table product_sizes add column if not exists box_size_id uuid references box_sizes(id) on delete set null;

-- ---------- Tamanhos iniciais (dimensões/pesos ESTIMADOS — ajuste depois) ----------
insert into box_sizes (label, length_cm, width_cm, height_cm, default_weight_g, sort) values
  ('18 cm', 20, 15, 15,  500, 0),
  ('20 cm', 22, 16, 16,  600, 1),
  ('22 cm', 25, 17, 17,  700, 2),
  ('25 cm', 28, 18, 18,  900, 3),
  ('30 cm', 33, 20, 20, 1200, 4),
  ('40 cm', 45, 25, 25, 2000, 5),
  ('50 cm', 55, 30, 30, 3500, 6),
  ('60 cm', 65, 35, 35, 5000, 7)
on conflict do nothing;

-- ---------- Religa os tamanhos atuais dos produtos ao catálogo (por label) ----------
update product_sizes ps
set box_size_id = bs.id
from box_sizes bs
where ps.box_size_id is null and ps.label = bs.label;
