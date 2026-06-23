-- ============================================================
-- Mr.Brant — Configurações do site (hero + WhatsApp)
-- Rode no SQL Editor depois do schema.sql.
-- ============================================================

create table if not exists settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table settings enable row level security;

drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);

drop policy if exists "auth write settings" on settings;
create policy "auth write settings" on settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- valores padrão (não sobrescreve se já existirem)
insert into settings (key, value) values
  ('whatsapp',         '5521975646365'),
  ('hero_eyebrow',     'Umbanda · Artigos Religiosos'),
  ('hero_title',       'A força e a beleza dos guias, em cada peça.'),
  ('hero_subtitle',    'Imagens sacras pintadas à mão, com a energia e o respeito que a sua fé merece.'),
  ('hero_featured_id', '')
on conflict (key) do nothing;
