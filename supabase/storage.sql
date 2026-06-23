-- ============================================================
-- Mr.Brant — Políticas do Storage (bucket "products")
-- Rode DEPOIS de criar o bucket "products" como PÚBLICO.
-- (Storage → New bucket → nome: products → marque "Public bucket")
-- ============================================================

-- Leitura pública das fotos
create policy "public read product photos"
  on storage.objects for select
  using (bucket_id = 'products');

-- Upload / atualização / remoção só autenticado (você, no admin)
create policy "auth upload product photos"
  on storage.objects for insert
  with check (bucket_id = 'products' and auth.role() = 'authenticated');

create policy "auth update product photos"
  on storage.objects for update
  using (bucket_id = 'products' and auth.role() = 'authenticated');

create policy "auth delete product photos"
  on storage.objects for delete
  using (bucket_id = 'products' and auth.role() = 'authenticated');
