-- ============================================================
-- Mr.Brant — Registro de visitas (analytics próprio)
-- Rode no SQL Editor.
-- ============================================================

create table if not exists page_views (
  id          uuid primary key default gen_random_uuid(),
  path        text not null,        -- chave da página (ex.: 'product:oxum')
  title       text,                 -- rótulo legível (ex.: 'Produto: Oxum')
  session_id  text,                 -- id anônimo do navegador (visitante único)
  created_at  timestamptz not null default now()
);

create index if not exists idx_page_views_created on page_views (created_at);

alter table page_views enable row level security;

-- qualquer visitante pode registrar a sua visita...
drop policy if exists "public insert page_views" on page_views;
create policy "public insert page_views" on page_views for insert with check (true);

-- ...mas só o admin (autenticado) lê os relatórios
drop policy if exists "admin read page_views" on page_views;
create policy "admin read page_views" on page_views for select using (auth.role() = 'authenticated');
