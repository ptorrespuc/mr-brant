-- ============================================================
-- Mr.Brant — Cupons de desconto
-- Rode no SQL Editor (depois de pedidos.sql).
-- ============================================================

create table if not exists coupons (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,                     -- ex.: BEMVINDO10
  type         text not null check (type in ('percent', 'fixed', 'free_shipping')),
  value        int  not null default 0,                  -- percent: 1-100 | fixed: centavos | free_shipping: ignorado
  valid_from   date,
  valid_until  date,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table coupons enable row level security;
-- só o admin (autenticado) lê/gerencia; a validação no checkout passa pela
-- Edge Function validar-cupom (service role), sem expor a lista de códigos.
drop policy if exists "admin coupons" on coupons;
create policy "admin coupons" on coupons for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Guarda o cupom e o desconto aplicado no pedido
alter table orders add column if not exists coupon_code   text;
alter table orders add column if not exists discount_cents int not null default 0;

-- (para bancos que já tinham a tabela) habilita o tipo "free_shipping"
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check check (type in ('percent', 'fixed', 'free_shipping'));
alter table coupons alter column value set default 0;
