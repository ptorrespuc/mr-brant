-- ============================================================
-- Mr.Brant — Schema do catálogo
-- Rode este arquivo no Supabase: SQL Editor → New query → cole tudo → Run
-- ============================================================

-- ---------- CATEGORIAS ----------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- SUBCATEGORIAS (ex.: Orixás, Exus — dentro de "Imagens") ----------
create table if not exists subcategories (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id) on delete cascade,
  slug         text not null,
  name         text not null,
  sort         int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (category_id, slug)
);

-- ---------- PRODUTOS (as imagens/peças) ----------
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  tagline         text default '',
  category_id     uuid references categories(id) on delete set null,
  subcategory_id  uuid references subcategories(id) on delete set null,
  note            text default '',
  obs             text default '',
  descriptions    jsonb not null default '[]'::jsonb,  -- lista de parágrafos
  specs           jsonb not null default '[]'::jsonb,  -- [{ "k": "Material", "v": "PLA" }, ...]
  active          boolean not null default true,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- PREÇO POR TAMANHO ----------
create table if not exists product_sizes (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  label        text not null,            -- ex.: "30 cm"
  price_cents  int  not null,            -- ex.: 18990 = R$ 189,90
  sort         int  not null default 0
);

-- ---------- FOTOS (caminho no Storage, não a imagem em si) ----------
create table if not exists product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  path        text not null,             -- ex.: "exu-caveira/1.jpeg" no bucket
  sort        int  not null default 0
);

-- ---------- RELACIONAMENTOS ENTRE IMAGENS ----------
create table if not exists product_relations (
  product_id          uuid not null references products(id) on delete cascade,
  related_product_id  uuid not null references products(id) on delete cascade,
  primary key (product_id, related_product_id),
  check (product_id <> related_product_id)
);

-- atualiza updated_at automaticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- Leitura: pública (qualquer visitante vê o catálogo)
-- Escrita: apenas usuários autenticados (você, no admin)
-- ============================================================
alter table categories       enable row level security;
alter table subcategories    enable row level security;
alter table products         enable row level security;
alter table product_sizes    enable row level security;
alter table product_images   enable row level security;
alter table product_relations enable row level security;

-- leitura pública
create policy "public read categories"   on categories        for select using (true);
create policy "public read subcategories" on subcategories     for select using (true);
create policy "public read products"      on products          for select using (true);
create policy "public read sizes"         on product_sizes     for select using (true);
create policy "public read images"        on product_images    for select using (true);
create policy "public read relations"     on product_relations for select using (true);

-- escrita só autenticado
create policy "auth write categories"   on categories        for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write subcategories" on subcategories     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write products"      on products          for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write sizes"         on product_sizes     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write images"        on product_images    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write relations"     on product_relations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
