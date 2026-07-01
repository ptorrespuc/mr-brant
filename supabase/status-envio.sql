-- ============================================================
-- Mr.Brant — Status "preparando_envio" (etiqueta gerada, aguardando postagem)
-- Rode no SQL Editor.
-- ============================================================
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pendente', 'negociando', 'pago', 'preparando_envio', 'enviado', 'entregue', 'cancelado'));
