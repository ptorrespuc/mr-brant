-- ============================================================
-- Mr.Brant — Catálogo de tamanhos (caixas)
-- Cada tamanho = uma caixa com dimensões e peso padrão (opcional).
-- O produto referencia um tamanho; o peso é informado por produto
-- (pré-preenchido pelo padrão do tamanho).
-- Rode no SQL Editor depois do schema.sql e do frete.sql.
-- ============================================================

create table if not exists box_sizes (
  id                uuid primary key default gen_random_uuid(),
  label             text not null unique, -- ex.: "30 cm"
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

-- ---------- Tamanhos iniciais (dimensões/pesos informados; 40 cm estimado) ----------
insert into box_sizes (label, length_cm, width_cm, height_cm, default_weight_g, sort) values
  ('18 cm', 25, 25, 25,  400, 0),
  ('20 cm', 25, 25, 25,  400, 1),
  ('22 cm', 25, 25, 25,  400, 2),
  ('25 cm', 20, 20, 30,  800, 3),
  ('30 cm', 20, 20, 40,  800, 4),
  ('40 cm', 25, 25, 50, 3000, 5),
  ('50 cm', 30, 30, 60, 3000, 6),
  ('60 cm', 30, 40, 70, 4000, 7)
on conflict (label) do nothing;

-- ---------- Religa os tamanhos atuais dos produtos ao catálogo (por label) ----------
update product_sizes ps
set box_size_id = bs.id
from box_sizes bs
where ps.box_size_id is null and ps.label = bs.label;
