-- ============================================================
-- Mr.Brant — Limpar os 2 eventos de TESTE de conversão
-- (criados ao validar o funil em 2026-07-06)
-- Rode UMA vez no SQL Editor do Supabase e depois pode apagar este arquivo.
-- Deleta pelos IDs exatos — não afeta nenhum evento real.
-- ============================================================

delete from page_views
where id in (
  '961d2260-7b6e-43ca-bc81-3ef5844c15a5',  -- event:add_to_cart (teste)
  '6312357c-ea34-495b-8e24-6d44347e0ff2'   -- event:checkout_whatsapp (teste)
);
