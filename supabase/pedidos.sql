-- ============================================================
-- Mr.Brant — Pedidos (checkout + pagamento)
-- Rode no SQL Editor depois do schema.sql.
-- ============================================================

-- Clientes (chave = e-mail). Liga vários pedidos ao mesmo e-mail.
create table if not exists customers (
  email       text primary key,
  name        text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sequência para o número amigável do pedido
create sequence if not exists order_number_seq;

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  number          text unique,
  token           text unique not null default gen_random_uuid()::text,
  status          text not null default 'pendente'
                  check (status in ('pendente','negociando','pago','cancelado','enviado','entregue')),

  customer_email  text not null,
  customer_name   text,
  customer_phone  text,

  ship_cep        text,
  ship_street     text,
  ship_number     text,
  ship_complement text,
  ship_district   text,
  ship_city       text,
  ship_state      text,

  shipping_method text,
  shipping_price_cents int not null default 0,
  subtotal_cents  int not null default 0,
  total_cents     int not null default 0,

  payment_id      text,
  payment_method  text,
  tracking_code   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  -- snapshots (registro histórico, não muda se o produto mudar depois)
  product_name     text not null,
  size_label       text,
  unit_price_cents int not null,
  qty              int not null,
  line_total_cents int not null
);

-- Gera o número MB-AAAA-00001 ao inserir
create or replace function set_order_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    new.number := 'MB-' || to_char(now(),'YYYY') || '-' ||
                  lpad(nextval('order_number_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_order_number on orders;
create trigger trg_order_number before insert on orders
  for each row execute function set_order_number();

drop trigger if exists trg_order_updated on orders;
create trigger trg_order_updated before update on orders
  for each row execute function set_updated_at();

-- ============================================================
-- RLS: dados sensíveis. Cliente NÃO acessa direto (privacidade).
-- Leitura/escrita do cliente passa pelas Edge Functions (service role,
-- que ignora RLS). O admin logado pode ler e atualizar.
-- ============================================================
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table customers   enable row level security;

create policy "admin read orders"   on orders      for select using (auth.role() = 'authenticated');
create policy "admin update orders"  on orders      for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin read items"     on order_items for select using (auth.role() = 'authenticated');
create policy "admin read customers" on customers   for select using (auth.role() = 'authenticated');

-- Configurações do pagamento e e-mail
insert into settings (key, value) values
  ('mp_sandbox', 'true'),  -- 'true' = credenciais de teste do Mercado Pago
  ('resend_from', 'Mr.Brant <onboarding@resend.dev>'),  -- remetente dos e-mails
  ('site_url', 'https://mrbrant.com.br')  -- usada nos links dos e-mails
on conflict (key) do nothing;
