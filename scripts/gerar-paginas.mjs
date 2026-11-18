// Mr.Brant — gera as páginas estáticas para o Google (SEO)
//
// Lê os produtos ativos do Supabase e escreve:
//   imagem/<slug>/index.html  → uma página por produto, com título, descrição,
//                               dados estruturados (schema.org Product) e o conteúdo
//                               já no HTML; o site (catalog.js) assume ao carregar.
//   index.html                → atualiza a lista de links do catálogo (bloco "catalogo").
//   404.html                  → página de erro que abre o site normalmente.
//   sitemap.xml, robots.txt
//
// Uso: node scripts/gerar-paginas.mjs   (Node 22, sem dependências)
// Roda sozinho no GitHub Actions (.github/workflows/paginas.yml).

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE_URL || 'https://mrbrant.com.br').replace(/\/$/, '');
const MARCA = 'Mr.Brant';

// chaves públicas lidas do próprio site (js/config.js)
const cfg = readFileSync(join(ROOT, 'js/config.js'), 'utf8');
const pick = (k) => (cfg.match(new RegExp(k + "\\s*:\\s*'([^']+)'")) || [])[1];
const SB_URL = pick('SUPABASE_URL');
const SB_KEY = pick('SUPABASE_KEY');
const BUCKET = pick('STORAGE_BUCKET') || 'products';
if (!SB_URL || !SB_KEY) throw new Error('Não achei SUPABASE_URL/SUPABASE_KEY em js/config.js');

async function rest(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

// ---------- texto ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const semEmoji = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]+/g, ' ');
const corta = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const PEQUENAS = new Set(['de', 'da', 'das', 'do', 'dos', 'e', 'com', 'no', 'na']);
const ROMANO = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/i;

// "EXU DO OURO Mod II" → "Exu do Ouro Mod II"; "Mod  I I I" → "Mod III"; tira "Imagem" do início
function nomeBonito(nome) {
  let s = String(nome).replace(/\s+/g, ' ').trim().replace(/^imagem\s+(de\s+)?/i, '');
  s = s.replace(/\bMod\.?\s*((?:[IVX]\s*){1,4})\b/gi, (_, r) => 'Mod ' + r.replace(/\s/g, '').toUpperCase());
  s = s.split(' ').map((w, i) => {
    if (/^Mod$/i.test(w)) return 'Mod';
    if (ROMANO.test(w) && i > 0 && /^Mod$/i.test(s.split(' ')[i - 1])) return w.toUpperCase();
    if (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w)) {
      const low = w.toLowerCase();
      return i > 0 && PEQUENAS.has(low) ? low : low[0].toUpperCase() + low.slice(1);
    }
    return w;
  }).join(' ');
  return s;
}

const cm = (label) => parseInt(String(label).replace(/\D/g, ''), 10) || null;
const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
const fotoUrl = (path) => `${SB_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

function linhaReligiosa(sub) {
  if (/exu|pombagira/i.test(sub || '')) return 'Umbanda e Quimbanda';
  if (/orix/i.test(sub || '')) return 'Umbanda e Candomblé';
  return 'Umbanda';
}

// ---------- dados ----------
const produtos = (await rest('products?select=id,slug,name,tagline,note,obs,descriptions,specs,sort,updated_at,shopee_url,subcategories(name),product_images(path,sort),product_sizes(label,price_cents,sort)&active=eq.true&order=sort'))
  .filter((p) => p.slug && /^[a-z0-9-]+$/.test(p.slug));

for (const p of produtos) {
  p.nome = nomeBonito(p.name);
  p.sub = p.subcategories?.name || '';
  p.fotos = (p.product_images || []).sort((a, b) => a.sort - b.sort).map((i) => fotoUrl(i.path));
  p.tamanhos = (p.product_sizes || []).filter((s) => s.price_cents > 0).sort((a, b) => a.sort - b.sort);
  const medidas = p.tamanhos.map((s) => cm(s.label)).filter(Boolean).sort((a, b) => a - b);
  p.faixa = medidas.length ? (medidas[0] === medidas[medidas.length - 1] ? `${medidas[0]} cm` : `${medidas[0]} a ${medidas[medidas.length - 1]} cm`) : '';
  const precos = p.tamanhos.map((s) => s.price_cents);
  p.min = precos.length ? Math.min(...precos) : null;
  p.max = precos.length ? Math.max(...precos) : null;
  p.url = `${SITE}/imagem/${p.slug}/`;
  p.titulo = `Imagem ${p.nome}${p.faixa ? ' ' + p.faixa : ''} | ${linhaReligiosa(p.sub)} | ${MARCA}`;
  const tag = semEmoji(p.tagline).trim();
  p.descricao = corta(`${tag ? tag.replace(/[.!]?$/, '. ') : ''}Imagem de ${p.nome} em impressão 3D com gesso, pintada à mão nas cores que você escolher${p.faixa ? `, de ${p.faixa}` : ''}. Envio para todo o Brasil.`, 160);
}

// ---------- modelo (index.html) ----------
const INDEX = join(ROOT, 'index.html');
let index = readFileSync(INDEX, 'utf8');
const bloco = (nome) => new RegExp(`<!-- ${nome}:start -->[\\s\\S]*?<!-- ${nome}:end -->`);
for (const b of ['seo', 'catalogo']) if (!bloco(b).test(index)) throw new Error(`index.html sem o bloco <!-- ${b}:start --> ... <!-- ${b}:end -->`);

// lista de links do catálogo (aparece enquanto o site carrega e ajuda o Google a achar as páginas)
const porSub = new Map();
for (const p of produtos) { const k = p.sub || 'Outras'; if (!porSub.has(k)) porSub.set(k, []); porSub.get(k).push(p); }
const listaCatalogo = `<!-- catalogo:start --><div class="seo-catalogo" style="max-width:1240px;margin:0 auto;padding:40px 28px 60px;color:var(--muted);">
<p style="text-align:center;margin-bottom:28px;">Carregando catálogo…</p>
<nav aria-label="Catálogo de imagens" style="font-size:14px;line-height:1.9;columns:220px;">
${[...porSub].map(([sub, ps]) => `<div style="break-inside:avoid;margin-bottom:16px;"><h2 style="font-size:15px;color:var(--text);">Imagens de ${esc(sub)}</h2>${ps.map((p) => `<a href="/imagem/${p.slug}/" style="color:inherit;display:block;">${esc(p.nome)}</a>`).join('')}</div>`).join('\n')}
</nav></div><!-- catalogo:end -->`;
index = index.replace(bloco('catalogo'), listaCatalogo);
writeFileSync(INDEX, index);

// páginas fora da raiz precisam de <base href="/"> para achar assets/ e js/
const comBase = (html) => html.replace(/<meta charset="utf-8">/i, '<meta charset="utf-8">\n<base href="/">');
const comMain = (html, conteudo) => html.replace(/(<main id="view">)[\s\S]*?(<\/main>)/, `$1${conteudo}$2`);

// ---------- página de cada produto ----------
function paginaProduto(p) {
  const outros = produtos.filter((x) => x !== p && x.sub === p.sub).slice(0, 6);
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Imagem ${p.nome}`,
    description: corta(semEmoji([p.tagline, ...(p.descriptions || [])].filter(Boolean).join(' ')), 5000),
    image: p.fotos.slice(0, 6),
    sku: p.slug,
    url: p.url,
    brand: { '@type': 'Brand', name: MARCA },
    category: `Imagens religiosas > ${p.sub || 'Imagens'}`,
    material: 'PLA com preenchimento em gesso, pintura artesanal',
  };
  if (p.min != null) {
    jsonld.offers = {
      '@type': 'AggregateOffer', priceCurrency: 'BRL',
      lowPrice: (p.min / 100).toFixed(2), highPrice: (p.max / 100).toFixed(2), offerCount: p.tamanhos.length,
      availability: 'https://schema.org/InStock', url: p.url,
      seller: { '@type': 'Organization', name: MARCA },
    };
  }
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: `Imagem ${p.nome}`, item: p.url },
    ],
  };
  const img = p.fotos[0] || `${SITE}/assets/logo-mb.png`;
  const seo = `<!-- seo:start -->
<title>${esc(p.titulo)}</title>
<meta name="description" content="${esc(p.descricao)}">
<link rel="canonical" href="${p.url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="${MARCA}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(`Imagem ${p.nome}${p.faixa ? ' — ' + p.faixa : ''} | ${MARCA}`)}">
<meta property="og:description" content="${esc(p.descricao)}">
<meta property="og:url" content="${p.url}">
<meta property="og:image" content="${esc(img)}">
${p.min != null ? `<meta property="product:price:amount" content="${(p.min / 100).toFixed(2)}">\n<meta property="product:price:currency" content="BRL">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/</g, '\\u003c')}</script>
<!-- seo:end -->`;

  const descHtml = (p.descriptions || []).map((d) => `<p style="margin:0 0 14px;line-height:1.65;">${esc(d).replace(/\n/g, '<br>')}</p>`).join('');
  const specs = (p.specs || []).filter((s) => s.k || s.v);
  const corpo = `
<article class="seo-produto" style="max-width:1240px;margin:0 auto;padding:34px 28px 72px;">
  <nav class="breadcrumb" aria-label="Você está em"><a href="/" style="color:inherit;">Início</a> / ${p.sub ? `${esc(p.sub)} / ` : ''}<span class="cur">${esc(p.nome)}</span></nav>
  <div class="prod-cols" style="display:grid;grid-template-columns:1.02fr 1fr;gap:48px;">
    <div>${p.fotos[0] ? `<img src="${esc(p.fotos[0])}" alt="Imagem ${esc(p.nome)} pintada à mão — ${esc(linhaReligiosa(p.sub))}" style="width:100%;aspect-ratio:4/5;object-fit:contain;background:#0d0a05;border-radius:18px;border:1px solid var(--line);">` : ''}</div>
    <div>
      ${p.sub ? `<div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold);font-weight:600;">${esc(p.sub)}</div>` : ''}
      <h1 style="font-size:34px;line-height:1.15;margin:10px 0 8px;">Imagem ${esc(p.nome)}</h1>
      ${p.tagline ? `<p style="color:var(--muted);font-size:16px;margin:0 0 18px;">${esc(p.tagline)}</p>` : ''}
      ${p.min != null ? `<p style="font-family:Cinzel,serif;font-size:26px;color:var(--gold);">${p.min === p.max ? brl(p.min) : 'a partir de ' + brl(p.min)}</p>
      <ul style="list-style:none;margin:14px 0;color:var(--muted);">${p.tamanhos.map((s) => `<li>${esc(s.label)} — ${brl(s.price_cents)}</li>`).join('')}</ul>` : '<p>Preço sob consulta</p>'}
      <p style="color:var(--muted);">Impressão 3D com gesso · Pintada à mão · Cores personalizadas · Envio para todo o Brasil</p>
    </div>
  </div>
  <section style="margin-top:44px;"><h2 style="font-size:22px;margin-bottom:14px;">Descrição</h2>${descHtml || '<p>—</p>'}</section>
  ${specs.length ? `<section style="margin-top:28px;"><h2 style="font-size:22px;margin-bottom:14px;">Características</h2><ul>${specs.map((s) => `<li>${esc([s.k, s.v].filter(Boolean).join(': '))}</li>`).join('')}</ul></section>` : ''}
  ${outros.length ? `<section style="margin-top:28px;"><h2 style="font-size:22px;margin-bottom:14px;">Outras imagens de ${esc(p.sub)}</h2><ul>${outros.map((o) => `<li><a href="/imagem/${o.slug}/" style="color:inherit;">Imagem ${esc(o.nome)}</a></li>`).join('')}</ul></section>` : ''}
</article>`;
  return comMain(comBase(index.replace(bloco('seo'), seo)), corpo);
}

const PASTA = join(ROOT, 'imagem');
const ativos = new Set(produtos.map((p) => p.slug));
if (existsSync(PASTA)) for (const d of readdirSync(PASTA)) if (!ativos.has(d)) rmSync(join(PASTA, d), { recursive: true, force: true });
for (const p of produtos) {
  mkdirSync(join(PASTA, p.slug), { recursive: true });
  writeFileSync(join(PASTA, p.slug, 'index.html'), paginaProduto(p));
}

// ---------- 404 (abre o site; o catalog.js decide a tela pelo endereço) ----------
const seo404 = `<!-- seo:start -->\n<title>Página não encontrada | ${MARCA}</title>\n<meta name="robots" content="noindex">\n<!-- seo:end -->`;
writeFileSync(join(ROOT, '404.html'), comBase(index.replace(bloco('seo'), seo404)));

// ---------- sitemap e robots ----------
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const ultima = produtos.map((p) => dia(p.updated_at)).filter(Boolean).sort().pop();
const urls = [
  `  <url><loc>${SITE}/</loc>${ultima ? `<lastmod>${ultima}</lastmod>` : ''}</url>`,
  ...produtos.map((p) => `  <url><loc>${p.url}</loc>${dia(p.updated_at) ? `<lastmod>${dia(p.updated_at)}</lastmod>` : ''}${p.fotos.slice(0, 3).map((f) => `<image:image><image:loc>${esc(f)}</image:loc></image:image>`).join('')}</url>`),
];
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin\nDisallow: /prototype.html\nDisallow: /Mr.Brant.dc.html\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`${produtos.length} páginas de produto geradas; sitemap com ${urls.length} endereços.`);
