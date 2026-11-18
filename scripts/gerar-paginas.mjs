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

// "Pretos Velhos" → "pretos-velhos" (igual ao catalog.js: subSlug)
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// texto de abertura de cada página de categoria ({nomes} = exemplos do catálogo)
const SUB_TEXTO = {
  'Exus': 'Os Exus são os guardiões dos caminhos na Umbanda e na Quimbanda: protegem, abrem caminhos e fazem a ligação entre os mundos. Aqui você encontra imagens de {nomes}, entre outros.',
  'Pombagiras': 'As Pombagiras trazem a força feminina, a proteção e a sabedoria das encruzilhadas da vida. Aqui você encontra imagens de {nomes}, entre outras.',
  'Orixás': 'Os Orixás são as forças da natureza cultuadas na Umbanda e no Candomblé. Aqui você encontra imagens de {nomes}.',
  'Caboclos': 'Os Caboclos trazem a força das matas, a cura e a sabedoria dos povos originários. Aqui você encontra imagens de {nomes}.',
  'Pretos Velhos': 'Os Pretos Velhos são símbolo de humildade, paciência e sabedoria, sempre com uma palavra de conforto. Aqui você encontra imagens de {nomes}.',
  'Crianças': 'As Crianças (Erês) trazem alegria, pureza e renovação para o terreiro e para o lar. Aqui você encontra imagens de {nomes}.',
};
const TEXTO_PADRAO = 'Imagens de {sub} para Umbanda: {nomes}.';
const FECHO = 'Todas as peças são feitas em impressão 3D com preenchimento em gesso e pintadas à mão, e podem ser personalizadas nas cores do seu guia. Enviamos para todo o Brasil.';

function linhaReligiosa(sub) {
  if (/exu|pombagira/i.test(sub || '')) return 'Umbanda e Quimbanda';
  if (/orix/i.test(sub || '')) return 'Umbanda e Candomblé';
  return 'Umbanda';
}

// ---------- dados ----------
const produtos = (await rest('products?select=id,slug,name,tagline,note,obs,descriptions,specs,sort,updated_at,shopee_url,subcategories(name),product_images(path,sort),product_sizes(label,price_cents,weight_g,sort)&active=eq.true&order=sort'))
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
  p.subSlug = p.sub ? slugify(p.sub) : '';
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
${[...porSub].map(([sub, ps]) => `<div style="break-inside:avoid;margin-bottom:16px;"><h2 style="font-size:15px;"><a href="/imagens/${slugify(sub)}/" style="color:var(--text);">Imagens de ${esc(sub)}</a></h2>${ps.map((p) => `<a href="/imagem/${p.slug}/" style="color:inherit;display:block;">${esc(p.nome)}</a>`).join('')}</div>`).join('\n')}
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
      ...(p.sub ? [{ '@type': 'ListItem', position: 2, name: `Imagens de ${p.sub}`, item: `${SITE}/imagens/${p.subSlug}/` }] : []),
      { '@type': 'ListItem', position: p.sub ? 3 : 2, name: `Imagem ${p.nome}`, item: p.url },
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
  <nav class="breadcrumb" aria-label="Você está em"><a href="/" style="color:inherit;">Início</a> / ${p.sub ? `<a href="/imagens/${p.subSlug}/" style="color:inherit;">${esc(p.sub)}</a> / ` : ''}<span class="cur">${esc(p.nome)}</span></nav>
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

// ---------- páginas de categoria: /imagens/ e /imagens/<sub>/ ----------
function paginaCategoria({ sub, slug, ps }) {
  const url = `${SITE}/imagens/${slug ? slug + '/' : ''}`;
  const nomes = ps.slice(0, 5).map((p) => p.nome);
  const lista = nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] : (nomes[0] || '');
  const intro = sub
    ? (SUB_TEXTO[sub] || TEXTO_PADRAO).replace('{nomes}', lista).replace('{sub}', sub) + ' ' + FECHO
    : `Imagens de Exus, Pombagiras, Orixás, Caboclos e outras linhas da Umbanda. ${FECHO}`;
  const h1 = sub ? `Imagens de ${sub}` : 'Imagens de Umbanda';
  const titulo = sub ? `Imagens de ${sub} | ${linhaReligiosa(sub)} | Pintadas à mão | ${MARCA}` : `Imagens de Umbanda pintadas à mão | Todas as imagens | ${MARCA}`;
  const descricao = corta(intro, 160);
  const img = ps.find((p) => p.fotos[0])?.fotos[0] || `${SITE}/assets/logo-mb.png`;
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, url, description: descricao,
      mainEntity: { '@type': 'ItemList', numberOfItems: ps.length, itemListElement: ps.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: `Imagem ${p.nome}` })) },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
        ...(sub ? [{ '@type': 'ListItem', position: 2, name: 'Imagens', item: `${SITE}/imagens/` }] : []),
        { '@type': 'ListItem', position: sub ? 3 : 2, name: h1, item: url },
      ],
    },
  ];
  const seo = `<!-- seo:start -->
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${MARCA}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(`${h1} | ${MARCA}`)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<!-- seo:end -->`;
  const outrasSubs = [...porSub.keys()].filter((s) => s !== sub);
  const corpo = `
<section class="seo-categoria" style="max-width:1240px;margin:0 auto;padding:34px 28px 72px;">
  <nav class="breadcrumb" aria-label="Você está em"><a href="/" style="color:inherit;">Início</a> / ${sub ? `<a href="/imagens/" style="color:inherit;">Imagens</a> / ` : ''}<span class="cur">${esc(h1)}</span></nav>
  <h1 style="font-size:34px;margin:14px 0 10px;">${esc(h1)}</h1>
  <p style="color:var(--muted);max-width:760px;line-height:1.65;margin-bottom:26px;">${esc(intro)}</p>
  <div class="grid4">${ps.map((p) => `<a class="card-prod" href="/imagem/${p.slug}/"><div class="ph" style="background-image:url('${esc(p.fotos[0] || '')}')"></div><div class="bd"><div class="nm">${esc(p.nome)}</div><div class="pr">${p.min != null ? (p.min === p.max ? brl(p.min) : 'a partir de ' + brl(p.min)) : 'Sob consulta'}</div><div class="sm">Pintura artesanal</div></div></a>`).join('')}</div>
  ${outrasSubs.length ? `<p style="margin-top:30px;color:var(--muted);">Veja também: ${outrasSubs.map((s) => `<a href="/imagens/${slugify(s)}/" style="color:inherit;">Imagens de ${esc(s)}</a>`).join(' · ')}</p>` : ''}
</section>`;
  return comMain(comBase(index.replace(bloco('seo'), seo)), corpo);
}

const PASTA_CAT = join(ROOT, 'imagens');
const categorias = [{ sub: '', slug: '', ps: produtos }, ...[...porSub].filter(([s]) => s !== 'Outras').map(([sub, ps]) => ({ sub, slug: slugify(sub), ps }))];
rmSync(PASTA_CAT, { recursive: true, force: true });
for (const c of categorias) {
  const dir = c.slug ? join(PASTA_CAT, c.slug) : PASTA_CAT;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), paginaCategoria(c));
}

// ---------- páginas institucionais (conteúdo fixo; o catalog.js não substitui) ----------
const settings = Object.fromEntries((await rest('settings?select=key,value&key=in.(whatsapp)')).map((r) => [r.key, r.value]));
const waNum = String(settings.whatsapp || pick('WHATSAPP') || '').replace(/\D/g, '');
const waHref = `https://wa.me/${waNum}?text=${encodeURIComponent('Olá! Quero solicitar uma troca/devolução. Pedido nº ')}`;
const PAGINAS = [
  {
    path: 'trocas-e-devolucoes',
    titulo: `Trocas e devoluções | ${MARCA}`,
    descricao: 'Política de trocas e devoluções da Mr.Brant: 7 dias para arrependimento, troca ou reembolso de peças com defeito ou danificadas no transporte, com frete por nossa conta.',
    h1: 'Trocas e devoluções',
    corpo: `
<p><em>Atualizada em 18 de novembro de 2026.</em></p>
<h2>Arrependimento: 7 dias</h2>
<p>Comprou pelo site e mudou de ideia? Você pode desistir da compra em até <strong>7 dias corridos a partir do recebimento</strong> da peça, como garante o Código de Defesa do Consumidor (art. 49). Devolvemos <strong>o valor integral pago, incluindo o frete</strong>, e o envio da devolução é por nossa conta: mandamos o código de postagem dos Correios.</p>
<p>A peça deve voltar sem sinais de uso, de preferência na embalagem original.</p>
<h2>Peça com defeito ou danificada no transporte</h2>
<p>Se a peça chegar quebrada, danificada ou com defeito, avise em até <strong>7 dias do recebimento</strong>, com fotos da peça e da embalagem. Você escolhe: <strong>troca por uma peça nova</strong> ou <strong>reembolso integral</strong>, com todo o frete por nossa conta. Defeitos de fabricação podem ser reclamados em até 90 dias (art. 26 do CDC).</p>
<h2>Peças personalizadas</h2>
<p>As imagens pintadas nas cores escolhidas por você têm os mesmos direitos de arrependimento, troca e reembolso descritos acima.</p>
<h2>Como solicitar</h2>
<p>Fale com a gente pelo <a href="${waHref}" target="_blank" rel="noopener">WhatsApp</a> informando o número do pedido e o motivo. Respondemos de segunda a sábado, das 9h às 18h, e enviamos as instruções e o código de postagem.</p>
<h2>Reembolso</h2>
<p>O reembolso é feito pela mesma forma de pagamento: no cartão (Mercado Pago), o estorno aparece na fatura conforme o prazo da operadora; no Pix, devolvemos em até 5 dias úteis depois de recebermos a peça de volta (ou depois de confirmarmos o defeito pelas fotos).</p>`,
  },
];
function paginaInstitucional(pg) {
  const url = `${SITE}/${pg.path}/`;
  const seo = `<!-- seo:start -->
<title>${esc(pg.titulo)}</title>
<meta name="description" content="${esc(pg.descricao)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${MARCA}">
<meta property="og:title" content="${esc(pg.titulo)}">
<meta property="og:description" content="${esc(pg.descricao)}">
<meta property="og:url" content="${url}">
<!-- seo:end -->`;
  const corpo = `
<article class="seo-pagina" data-pagina-fixa="${pg.path}" style="max-width:820px;margin:0 auto;padding:34px 28px 72px;line-height:1.7;">
  <nav class="breadcrumb" aria-label="Você está em"><a href="/" style="color:inherit;">Início</a> / <span class="cur">${esc(pg.h1)}</span></nav>
  <h1 style="font-size:34px;margin:14px 0 18px;">${esc(pg.h1)}</h1>
  <div class="texto-pagina">${pg.corpo}</div>
</article>`;
  return comMain(comBase(index.replace(bloco('seo'), seo)), corpo);
}
for (const pg of PAGINAS) {
  rmSync(join(ROOT, pg.path), { recursive: true, force: true });
  mkdirSync(join(ROOT, pg.path), { recursive: true });
  writeFileSync(join(ROOT, pg.path, 'index.html'), paginaInstitucional(pg));
}

// ---------- arquivo de produtos para o Google Merchant Center ----------
// Um item por tamanho (variação), agrupados por produto (item_group_id).
// O Merchant Center busca https://mrbrant.com.br/merchant/produtos.xml uma vez por dia.
const slugTam = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '');
const textoPlano = (p) => corta(semEmoji([p.tagline, ...(p.descriptions || [])].filter(Boolean).join('\n')).replace(/^\s*[-*•]\s+/gm, '').replace(/[#*_`]+/g, '').replace(/\s*\n\s*/g, ' '), 4900)
  || `Imagem de ${p.nome} em impressão 3D com gesso, pintada à mão.`;
const itens = [];
for (const p of produtos) {
  if (!p.fotos.length) continue;
  for (const s of p.tamanhos) {
    const peso = s.weight_g || null;
    itens.push(`  <item>
    <g:id>${esc(`${p.slug}-${slugTam(s.label)}`)}</g:id>
    <g:item_group_id>${esc(p.slug)}</g:item_group_id>
    <title>${esc(corta(`Imagem ${p.nome} ${s.label} - Pintada à Mão - ${linhaReligiosa(p.sub)}`, 150))}</title>
    <description>${esc(textoPlano(p))}</description>
    <link>${esc(`${p.url}?tamanho=${slugTam(s.label)}`)}</link>
    <g:image_link>${esc(p.fotos[0])}</g:image_link>
${p.fotos.slice(1, 10).map((f) => `    <g:additional_image_link>${esc(f)}</g:additional_image_link>`).join('\n')}
    <g:availability>in_stock</g:availability>
    <g:price>${(s.price_cents / 100).toFixed(2)} BRL</g:price>
    <g:condition>new</g:condition>
    <g:brand>${MARCA}</g:brand>
    <g:identifier_exists>no</g:identifier_exists>
    <g:size>${esc(s.label)}</g:size>
    <g:material>Gesso</g:material>
    <g:product_type>${esc(`Imagens religiosas > ${p.sub || 'Imagens'}`)}</g:product_type>
${peso ? `    <g:shipping_weight>${peso} g</g:shipping_weight>` : ''}
  </item>`.replace(/\n\n/g, '\n'));
  }
}
mkdirSync(join(ROOT, 'merchant'), { recursive: true });
writeFileSync(join(ROOT, 'merchant', 'produtos.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${MARCA} — Imagens de Umbanda pintadas à mão</title>
  <link>${SITE}/</link>
  <description>Catálogo de produtos da ${MARCA}</description>
${itens.join('\n')}
</channel>
</rss>
`);

// ---------- 404 (abre o site; o catalog.js decide a tela pelo endereço) ----------
const seo404 = `<!-- seo:start -->\n<title>Página não encontrada | ${MARCA}</title>\n<meta name="robots" content="noindex">\n<!-- seo:end -->`;
writeFileSync(join(ROOT, '404.html'), comBase(index.replace(bloco('seo'), seo404)));

// ---------- sitemap e robots ----------
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const ultima = produtos.map((p) => dia(p.updated_at)).filter(Boolean).sort().pop();
const urls = [
  `  <url><loc>${SITE}/</loc>${ultima ? `<lastmod>${ultima}</lastmod>` : ''}</url>`,
  ...categorias.map((c) => {
    const lm = c.ps.map((p) => dia(p.updated_at)).filter(Boolean).sort().pop();
    return `  <url><loc>${SITE}/imagens/${c.slug ? c.slug + '/' : ''}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`;
  }),
  ...PAGINAS.map((pg) => `  <url><loc>${SITE}/${pg.path}/</loc></url>`),
  ...produtos.map((p) => `  <url><loc>${p.url}</loc>${dia(p.updated_at) ? `<lastmod>${dia(p.updated_at)}</lastmod>` : ''}${p.fotos.slice(0, 3).map((f) => `<image:image><image:loc>${esc(f)}</image:loc></image:image>`).join('')}</url>`),
];
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin\nDisallow: /prototype.html\nDisallow: /Mr.Brant.dc.html\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`${produtos.length} páginas de produto geradas; sitemap com ${urls.length} endereços; ${itens.length} itens no arquivo do Merchant Center.`);
