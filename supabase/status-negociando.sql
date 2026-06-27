-- ============================================================
-- Mr.Brant — Novo status "negociando" (pedidos via WhatsApp)
-- Separa pedidos em negociação (WhatsApp) dos pendentes (checkout
-- abandonado de cartão). Rode no SQL Editor.
-- ============================================================

-- permite o novo status no check
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pendente', 'negociando', 'pago', 'cancelado', 'enviado', 'entregue'));

-- migra pedidos WhatsApp já existentes que estavam como "pendente"
update orders
set status = 'negociando'
where payment_method = 'whatsapp' and status = 'pendente';
