// ============================================================
// Mr.Brant — Catálogo dinâmico (carrega do Supabase)
// ============================================================
const { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, WHATSAPP } = window.MB_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const view = $('#view');

// ---------- estado ----------
let CATEGORIES = [];
let SUBCATEGORIES = [];
let PRODUCTS = [];
let RELATIONS = []; // { product_id, related_product_id }
let SETTINGS = {}; // { whatsapp, hero_eyebrow, hero_title, hero_subtitle, hero_featured_id }
const state = {
  screen: 'home', catSlug: 'imagens', sub: 'Todas', prodId: null,
  gIndex: 0, selSizeId: null, qty: 1, cart: loadCart(),
};

// ---------- util ----------
function brl(cents) { return 'R$ ' + (cents / 100).toFixed(2).replace('.', ','); }
function photoUrl(path) { return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl; }
function loadCart() { try { return JSON.parse(localStorage.getItem('mrbrant_cart')) || []; } catch (e) { return []; } }
function saveCart() { try { localStorage.setItem('mrbrant_cart', JSON.stringify(state.cart)); } catch (e) {} }
function esc(s) { return (s || '').toString().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function prodById(id) { return PRODUCTS.find((p) => p.id === id); }
function prodImages(p) { return (p.product_images || []).slice().sort((a, b) => a.sort - b.sort); }
function prodSizes(p) { return (p.product_sizes || []).slice().sort((a, b) => a.sort - b.sort); }
function prodMinPrice(p) { const s = prodSizes(p); return s.length ? Math.min(...s.map((x) => x.price_cents)) : null; }
function priceLabel(p) { const m = prodMinPrice(p); return m == null ? 'Sob consulta' : 'a partir de ' + brl(m); }
function mainPhoto(p) { const im = prodImages(p); return im[0] ? photoUrl(im[0].path) : ''; }
function imgFitStyle(p) {
  const fit = (p && p.image_fit) || 'cover';
  if (fit === 'contain') return 'background-size:contain;background-position:center;';
  const posY = (p && p.image_pos != null) ? p.image_pos : 50;
  const posX = (p && p.image_pos_x != null) ? p.image_pos_x : 50;
  const zoom = (p && p.image_zoom != null) ? p.image_zoom : 100;
  return `background-size:${zoom}%;background-position:${posX}% ${posY}%;`;
}
function subName(p) { const s = SUBCATEGORIES.find((x) => x.id === p.subcategory_id); return s ? s.name : ''; }
function catBySlug(slug) { return CATEGORIES.find((c) => c.slug === slug); }
function imagensSubs() { const cat = catBySlug('imagens'); return cat ? SUBCATEGORIES.filter((s) => s.category_id === cat.id) : []; }

function waNumber() { return (SETTINGS.whatsapp || WHATSAPP || '').replace(/\D/g, ''); }
function waLink(text) { return 'https://wa.me/' + waNumber() + (text ? '?text=' + encodeURIComponent(text) : ''); }

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>${esc(msg)}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- carregar dados ----------
async function loadData() {
  const [cats, subs, prods, rels, sett] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    sb.from('subcategories').select('*').order('sort'),
    sb.from('products').select('*, product_images(*), product_sizes(*)').eq('active', true).order('sort'),
    sb.from('product_relations').select('*'),
    sb.from('settings').select('*'),
  ]);
  CATEGORIES = cats.data || [];
  SUBCATEGORIES = subs.data || [];
  PRODUCTS = prods.data || [];
  RELATIONS = rels.data || [];
  SETTINGS = {};
  (sett.data || []).forEach((r) => { SETTINGS[r.key] = r.value; });
}

// ---------- navegação ----------
function go(screen, opts = {}) {
  Object.assign(state, { screen }, opts);
  closeMega();
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function openProduct(id) {
  const p = prodById(id); if (!p) return;
  const sizes = prodSizes(p);
  go('product', { prodId: id, gIndex: 0, qty: 1, selSizeId: sizes[0] ? sizes[0].id : null });
}

// ---------- cart ----------
function cartCount() { return state.cart.reduce((n, it) => n + it.qty, 0); }
function updateCartBadge() {
  const c = cartCount();
  const el = $('#cartCount');
  el.textContent = c;
  el.classList.toggle('hidden', c === 0);
}
function addToCart() {
  const p = prodById(state.prodId); if (!p) return;
  const size = prodSizes(p).find((s) => s.id === state.selSizeId) || prodSizes(p)[0];
  if (!size) { toast('Produto sem tamanho cadastrado'); return; }
  const i = state.cart.findIndex((it) => it.sizeId === size.id);
  if (i >= 0) state.cart[i].qty += state.qty;
  else state.cart.push({ prodId: p.id, sizeId: size.id, qty: state.qty });
  saveCart(); updateCartBadge(); toast('Adicionado à sacola');
}
function cartLineInfo(it) {
  const p = prodById(it.prodId);
  const size = p && prodSizes(p).find((s) => s.id === it.sizeId);
  return { p, size };
}
function cartSubtotal() {
  return state.cart.reduce((sum, it) => {
    const { size } = cartLineInfo(it);
    return sum + (size ? size.price_cents * it.qty : 0);
  }, 0);
}

// ---------- render principal ----------
function render() {
  updateCartBadge();
  if (state.screen === 'home') return renderHome();
  if (state.screen === 'category') return renderCategory();
  if (state.screen === 'product') return renderProduct();
  if (state.screen === 'cart') return renderCart();
}

// ---------- HOME ----------
function renderHome() {
  const featured = (SETTINGS.hero_featured_id && prodById(SETTINGS.hero_featured_id))
    || PRODUCTS.find((p) => prodImages(p).length) || PRODUCTS[0];
  const homeProds = PRODUCTS.slice(0, 4);
  const subs = imagensSubs();
  const heroEyebrow = SETTINGS.hero_eyebrow || 'Umbanda · Artigos Religiosos';
  const heroTitle = SETTINGS.hero_title || 'A força e a beleza dos guias, em cada peça.';
  const heroSubtitle = SETTINGS.hero_subtitle || 'Imagens sacras pintadas à mão, com a energia e o respeito que a sua fé merece.';

  view.innerHTML = `
    <section style="position:relative;background:var(--hero);overflow:hidden;">
      <div style="position:absolute;top:-120px;right:-80px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(205,163,82,.16),transparent 65%);pointer-events:none;"></div>
      <div class="hero" style="max-width:1240px;margin:0 auto;padding:66px 28px 72px;display:grid;grid-template-columns:1.05fr .95fr;gap:50px;align-items:center;position:relative;">
        <div>
          <div class="eyebrow" style="color:#cda352;">${esc(heroEyebrow)}</div>
          <h1 style="font-weight:600;font-size:54px;line-height:1.08;margin:18px 0 0;color:#f4ecdb;">${esc(heroTitle)}</h1>
          <p style="color:#b7a98d;font-size:18px;max-width:480px;margin:20px 0 0;">${esc(heroSubtitle)}</p>
          <div style="display:flex;gap:12px;margin-top:30px;flex-wrap:wrap;">
            <button class="btn-gold" data-nav="imagens">Ver as imagens</button>
            <a class="btn-out" href="${waLink('Olá! Vim pelo site da Mr.Brant.')}" target="_blank" rel="noopener">Falar no WhatsApp</a>
          </div>
          <div style="display:flex;gap:22px;margin-top:34px;flex-wrap:wrap;color:#8f8470;font-size:13px;">
            <span>Feito à mão</span><span style="color:rgba(205,163,82,.5);">·</span><span>PLA &amp; PETG premium</span><span style="color:rgba(205,163,82,.5);">·</span><span>Frete pra todo o Brasil</span>
          </div>
        </div>
        ${featured ? `
        <div style="position:relative;">
          <div style="position:relative;border-radius:20px;overflow:hidden;aspect-ratio:4/5;border:1px solid rgba(205,163,82,.35);box-shadow:0 30px 60px rgba(0,0,0,.55);background:#0d0a05 no-repeat;${imgFitStyle(featured)}background-image:url('${mainPhoto(featured)}');cursor:pointer;" data-prod="${featured.id}">
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(8,5,2,.85) 0%,rgba(8,5,2,0) 45%);"></div>
            <div style="position:absolute;left:24px;right:24px;bottom:22px;">
              <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#e7cd8e;font-weight:600;">Destaque</div>
              <div style="font-family:Cinzel,serif;font-size:24px;color:#f4ecdb;margin:6px 0 2px;">${esc(featured.name)}</div>
              <div style="color:#cda352;font-size:16px;margin-top:8px;">${esc(priceLabel(featured))}</div>
            </div>
          </div>
        </div>` : ''}
      </div>
    </section>

    <div style="background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);">
      <div style="max-width:1240px;margin:0 auto;padding:20px 28px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;">
        ${['Feito e pintado à mão', 'PLA & PETG de alta qualidade', 'Envio para todo o Brasil', 'Personalizamos nas suas cores'].map((t) => `
          <div style="display:flex;align-items:center;gap:11px;color:var(--text);font-size:14px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.7"><path d="M20 6 9 17l-5-5"/></svg>${t}</div>`).join('')}
      </div>
    </div>

    <section style="max-width:1240px;margin:0 auto;padding:64px 28px 24px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:30px;">
        <div><div class="eyebrow">Imagens em destaque</div><h2 style="font-size:32px;margin:8px 0 0;">Nossas peças</h2></div>
        <button class="btn-out" data-nav="imagens">Ver todas →</button>
      </div>
      <div class="grid4">${homeProds.map(cardProd).join('')}</div>
    </section>

    <section style="background:var(--bg2);margin-top:48px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);">
      <div style="max-width:1240px;margin:0 auto;padding:56px 28px;">
        <div class="eyebrow">Navegue por guia</div>
        <h2 style="font-size:30px;margin:8px 0 26px;">Linhas de trabalho</h2>
        <div class="grid6">${subs.map((s) => `<button class="chip" style="border-radius:12px;padding:18px 12px;font-family:Cinzel,serif;justify-content:center;" data-sub="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>
      </div>
    </section>

    <section class="about-cols" style="max-width:1240px;margin:0 auto;padding:70px 28px;display:grid;grid-template-columns:1fr .9fr;gap:54px;align-items:center;">
      <div>
        <div class="eyebrow">Sobre a Mr.Brant</div>
        <h2 style="font-size:34px;margin:10px 0 16px;">Devoção em cada detalhe</h2>
        <p style="color:var(--muted);font-size:16.5px;max-width:520px;">Somos dedicados a artigos religiosos de Umbanda. Cada imagem é feita em PLA de alta qualidade e finalizada e pintada à mão — peças únicas, feitas com respeito à fé, aos guias e a quem as recebe.</p>
        <div style="margin-top:26px;background:var(--surface);border:1px solid var(--line2);border-radius:16px;padding:22px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <div style="font-family:Cinzel,serif;font-size:19px;color:var(--gold2);">Personalizamos com as suas cores</div>
            <div style="color:var(--muted);font-size:14px;margin-top:5px;">Encomende a sua peça do jeito do seu guia. Fale com a gente pelo WhatsApp.</div>
          </div>
          <a href="${waLink('Olá! Quero encomendar uma peça personalizada.')}" target="_blank" rel="noopener" style="padding:12px 22px;border-radius:999px;background:var(--green);color:#fff;font-weight:600;text-decoration:none;font-size:14px;white-space:nowrap;">Encomendar</a>
        </div>
      </div>
      ${featured ? `<div style="border-radius:20px;overflow:hidden;height:480px;border:1px solid var(--line2);box-shadow:0 24px 50px var(--shadow);background:#0d0a05 no-repeat;${imgFitStyle(featured)}background-image:url('${mainPhoto(featured)}');"></div>` : '<div></div>'}
    </section>

    <section style="background:var(--bg2);border-top:1px solid var(--line);">
      <div style="max-width:1240px;margin:0 auto;padding:56px 28px;">
        <div class="eyebrow">Catálogo</div>
        <h2 style="font-size:30px;margin:8px 0 26px;">Todas as categorias</h2>
        <div class="grid-cats">${CATEGORIES.map((c) => {
          const n = PRODUCTS.filter((p) => p.category_id === c.id).length;
          return `<button class="chip" style="border-radius:12px;padding:16px 18px;justify-content:space-between;display:flex;text-align:left;" data-cat="${esc(c.slug)}"><span style="font-family:Cinzel,serif;font-size:15px;">${esc(c.name)}</span><span style="font-size:11px;letter-spacing:.06em;color:var(--muted);text-transform:uppercase;">${n ? n + ' peça' + (n > 1 ? 's' : '') : 'Em breve'}</span></button>`;
        }).join('')}</div>
      </div>
    </section>
  `;
  bindCards();
}

function cardProd(p) {
  return `
    <div class="card-prod" data-prod="${p.id}">
      <div class="ph" style="${imgFitStyle(p)}background-image:url('${mainPhoto(p)}')">
        ${subName(p) ? `<div class="tag">${esc(subName(p))}</div>` : ''}
      </div>
      <div class="bd">
        <div class="nm">${esc(p.name)}</div>
        <div class="pr">${esc(priceLabel(p))}</div>
        <div class="sm">Pintura artesanal</div>
      </div>
    </div>`;
}

// ---------- CATEGORY ----------
function renderCategory() {
  const cat = catBySlug(state.catSlug) || catBySlug('imagens');
  let prods = PRODUCTS.filter((p) => p.category_id === cat.id);
  const isImagens = cat.slug === 'imagens';
  const subs = isImagens ? imagensSubs() : [];

  if (isImagens && state.sub !== 'Todas') {
    const sObj = subs.find((s) => s.name === state.sub);
    if (sObj) prods = prods.filter((p) => p.subcategory_id === sObj.id);
  }

  const chips = isImagens ? `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:30px;">
      <button class="chip ${state.sub === 'Todas' ? 'active' : ''}" data-sub="Todas">Todas</button>
      ${subs.map((s) => `<button class="chip ${state.sub === s.name ? 'active' : ''}" data-sub="${esc(s.name)}">${esc(s.name)}</button>`).join('')}
    </div>` : '';

  const grid = prods.length ? `<div class="grid4">${prods.map(cardProd).join('')}</div>` : `
    <div style="border:1px dashed var(--line2);border-radius:18px;padding:56px 28px;text-align:center;background:var(--surface);">
      <div style="font-family:Cinzel,serif;font-size:22px;color:var(--text);">Em breve nesta linha</div>
      <p style="color:var(--muted);max-width:440px;margin:12px auto 24px;">Estamos preparando esta linha. Enquanto isso, conheça as nossas Imagens ou fale com a gente.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn-gold" data-nav="imagens">Ver Imagens</button>
        <a class="btn-out" href="${waLink('')}" target="_blank" rel="noopener">Falar no WhatsApp</a>
      </div>
    </div>`;

  view.innerHTML = `
    <div style="max-width:1240px;margin:0 auto;padding:38px 28px 70px;min-height:60vh;">
      <div class="breadcrumb"><span data-nav="home">Início</span> &nbsp;/&nbsp; <span class="cur">${esc(cat.name)}</span></div>
      <h1 style="font-size:38px;margin:0 0 22px;">${esc(cat.name)}</h1>
      ${chips}
      ${grid}
    </div>`;
  bindCards();
}

// ---------- PRODUCT ----------
function renderProduct() {
  const p = prodById(state.prodId);
  if (!p) return go('home');
  const imgs = prodImages(p);
  const sizes = prodSizes(p);
  const sel = sizes.find((s) => s.id === state.selSizeId) || sizes[0];
  const mainUrl = imgs[state.gIndex] ? photoUrl(imgs[state.gIndex].path) : (imgs[0] ? photoUrl(imgs[0].path) : '');
  const descs = p.descriptions || [];
  const specs = p.specs || [];
  const relIds = RELATIONS.filter((r) => r.product_id === p.id).map((r) => r.related_product_id);
  const related = PRODUCTS.filter((x) => relIds.includes(x.id)).slice(0, 3);

  view.innerHTML = `
    <div style="max-width:1240px;margin:0 auto;padding:34px 28px 72px;">
      <div class="breadcrumb"><span data-nav="home">Início</span> /&nbsp;<span data-nav="imagens">Imagens</span>${subName(p) ? ` /&nbsp;<span class="cur">${esc(subName(p))}</span>` : ''} /&nbsp;<span class="cur">${esc(p.name)}</span></div>
      <div class="prod-cols" style="display:grid;grid-template-columns:1.02fr 1fr;gap:48px;">
        <div>
          <div style="position:relative;border-radius:18px;overflow:hidden;aspect-ratio:4/5;background:#0d0a05 center/contain no-repeat;border:1px solid var(--line);background-image:url('${mainUrl}')"></div>
          <div style="display:flex;gap:10px;margin-top:13px;flex-wrap:wrap;">
            ${imgs.map((im, i) => `<div data-g="${i}" style="width:78px;height:78px;border-radius:11px;background:#0d0a05 top/cover no-repeat;border:1px solid ${i === state.gIndex ? 'var(--gold)' : 'var(--line2)'};cursor:pointer;background-image:url('${photoUrl(im.path)}')"></div>`).join('')}
          </div>
        </div>
        <div>
          ${subName(p) ? `<div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold);font-weight:600;">${esc(subName(p))}</div>` : ''}
          <h1 style="font-size:34px;line-height:1.15;margin:10px 0 8px;">${esc(p.name)}</h1>
          <p style="color:var(--muted);font-size:16px;margin:0 0 20px;">${esc(p.tagline)}</p>
          <div style="display:flex;align-items:baseline;gap:10px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);">
            <span style="color:var(--muted);font-size:14px;">${sel ? 'preço' : ''}</span>
            <span style="font-family:Cinzel,serif;font-size:29px;color:var(--gold);">${sel ? brl(sel.price_cents) : 'Sob consulta'}</span>
          </div>
          ${sizes.length ? `
          <div style="margin-top:22px;">
            <div style="font-size:13px;color:var(--text);margin-bottom:10px;">Tamanho</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${sizes.map((s) => `<button class="size-opt ${s.id === (sel && sel.id) ? 'active' : ''}" data-size="${s.id}">${esc(s.label)}</button>`).join('')}
            </div>
          </div>` : ''}
          ${p.note ? `<div style="margin-top:16px;display:inline-flex;align-items:center;gap:8px;color:var(--gold2);font-size:13.5px;background:var(--surface);border:1px solid var(--line2);border-radius:10px;padding:9px 14px;">${esc(p.note)}</div>` : ''}
          <div style="display:flex;gap:12px;align-items:center;margin-top:24px;flex-wrap:wrap;">
            <div class="qtybox">
              <button id="decQty">−</button>
              <span id="qtyVal" style="min-width:34px;text-align:center;font-size:16px;">${state.qty}</span>
              <button id="incQty">+</button>
            </div>
            <button class="btn-gold" id="addCart" style="flex:1;min-width:170px;">Adicionar à sacola</button>
          </div>
          <a id="buyNow" style="display:flex;justify-content:center;align-items:center;gap:9px;margin-top:12px;padding:14px;border-radius:999px;background:var(--green);color:#fff;font-weight:600;cursor:pointer;font-size:15px;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.9.9-2.7-.2-.3A8 8 0 1 1 12 20z"/></svg>
            Comprar agora pelo WhatsApp
          </a>
          ${p.obs ? `<div style="margin-top:14px;color:var(--muted);font-size:13px;font-style:italic;">${esc(p.obs)}</div>` : ''}
        </div>
      </div>

      <div class="prod-cols" style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px;margin-top:56px;padding-top:44px;border-top:1px solid var(--line);">
        <div>
          <h3 style="font-size:22px;margin:0 0 16px;">Descrição</h3>
          ${descs.map((d) => `<p style="color:var(--muted);font-size:16px;margin:0 0 14px;line-height:1.65;">${esc(d)}</p>`).join('') || '<p style="color:var(--muted);">—</p>'}
        </div>
        <div>
          <h3 style="font-size:22px;margin:0 0 16px;">Características</h3>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;">
            ${specs.map((sp) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:13px 18px;border-bottom:1px solid var(--line);"><span style="color:var(--muted);font-size:13.5px;">${esc(sp.k)}</span><span style="color:var(--text);font-size:13.5px;text-align:right;">${esc(sp.v)}</span></div>`).join('') || '<div style="padding:13px 18px;color:var(--muted);">—</div>'}
          </div>
        </div>
      </div>

      ${related.length ? `
      <div style="margin-top:56px;">
        <h3 style="font-size:24px;margin:0 0 22px;">Você também pode gostar</h3>
        <div class="grid3">${related.map(cardProd).join('')}</div>
      </div>` : ''}
    </div>`;

  // binds específicos
  $('#decQty').onclick = () => { state.qty = Math.max(1, state.qty - 1); $('#qtyVal').textContent = state.qty; };
  $('#incQty').onclick = () => { state.qty += 1; $('#qtyVal').textContent = state.qty; };
  $('#addCart').onclick = addToCart;
  $('#buyNow').onclick = () => {
    const sz = sizes.find((s) => s.id === state.selSizeId) || sizes[0];
    const txt = `Olá! Tenho interesse na peça *${p.name}*` + (sz ? ` (${sz.label} — ${brl(sz.price_cents)})` : '') + `. Quantidade: ${state.qty}.`;
    window.open(waLink(txt), '_blank');
  };
  $$('[data-size]').forEach((b) => b.onclick = () => { state.selSizeId = b.dataset.size; renderProduct(); });
  $$('[data-g]').forEach((b) => b.onclick = () => { state.gIndex = +b.dataset.g; renderProduct(); });
  bindCards();
}

// ---------- CART ----------
function renderCart() {
  const lines = state.cart.map((it, idx) => ({ ...cartLineInfo(it), it, idx })).filter((l) => l.p && l.size);
  const empty = lines.length === 0;

  view.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:40px 28px 80px;min-height:60vh;">
      <h1 style="font-size:36px;margin:0 0 26px;">Sua sacola</h1>
      ${empty ? `
        <div style="border:1px dashed var(--line2);border-radius:18px;padding:60px 28px;text-align:center;background:var(--surface);">
          <div style="font-family:Cinzel,serif;font-size:22px;">Sua sacola está vazia</div>
          <p style="color:var(--muted);margin:12px 0 24px;">Escolha uma imagem para começar o seu pedido.</p>
          <button class="btn-gold" data-nav="imagens">Ver Imagens</button>
        </div>` : `
        <div class="cart-cols" style="display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:start;">
          <div style="display:flex;flex-direction:column;gap:14px;">
            ${lines.map((l) => `
              <div style="display:flex;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;">
                <div style="width:88px;aspect-ratio:4/5;border-radius:10px;overflow:hidden;background:#0d0a05 no-repeat;${imgFitStyle(l.p)}flex:none;background-image:url('${mainPhoto(l.p)}')"></div>
                <div style="flex:1;display:flex;flex-direction:column;">
                  <div style="font-family:Cinzel,serif;font-size:16px;line-height:1.25;">${esc(l.p.name)}</div>
                  <div style="color:var(--muted);font-size:13px;margin-top:3px;">Tamanho: ${esc(l.size.label)}</div>
                  <div style="margin-top:auto;display:flex;align-items:center;gap:14px;">
                    <div class="qtybox">
                      <button data-dec="${l.idx}" style="width:34px;height:36px;font-size:18px;">−</button>
                      <span style="min-width:26px;text-align:center;font-size:14px;">${l.it.qty}</span>
                      <button data-inc="${l.idx}" style="width:34px;height:36px;font-size:18px;">+</button>
                    </div>
                    <button data-rm="${l.idx}" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:13px;text-decoration:underline;">Remover</button>
                  </div>
                </div>
                <div style="color:var(--gold);font-size:14px;white-space:nowrap;">${brl(l.size.price_cents * l.it.qty)}</div>
              </div>`).join('')}
          </div>
          <div style="background:var(--surface);border:1px solid var(--line2);border-radius:16px;padding:22px 24px;">
            <div style="font-family:Cinzel,serif;font-size:19px;margin-bottom:16px;">Resumo do pedido</div>
            <div style="display:flex;justify-content:space-between;font-size:15px;margin-bottom:10px;"><span>Subtotal</span><span style="color:var(--gold);">${brl(cartSubtotal())}</span></div>
            <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:14px;margin-bottom:16px;"><span>Frete</span><span>combinado no WhatsApp</span></div>
            <div style="color:var(--muted);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px;margin-bottom:18px;">Confirmamos o total e o frete pelo WhatsApp ao fechar o pedido.</div>
            <a id="finalize" style="display:flex;justify-content:center;align-items:center;gap:9px;padding:14px;border-radius:999px;background:var(--green);color:#fff;font-weight:600;cursor:pointer;font-size:15px;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.9.9-2.7-.2-.3A8 8 0 1 1 12 20z"/></svg>
              Finalizar pelo WhatsApp
            </a>
            <button class="btn-out" data-nav="imagens" style="width:100%;margin-top:11px;justify-content:center;">Continuar comprando</button>
          </div>
        </div>`}
    </div>`;

  $$('[data-dec]').forEach((b) => b.onclick = () => { const i = +b.dataset.dec; state.cart[i].qty = Math.max(1, state.cart[i].qty - 1); saveCart(); renderCart(); updateCartBadge(); });
  $$('[data-inc]').forEach((b) => b.onclick = () => { const i = +b.dataset.inc; state.cart[i].qty += 1; saveCart(); renderCart(); updateCartBadge(); });
  $$('[data-rm]').forEach((b) => b.onclick = () => { state.cart.splice(+b.dataset.rm, 1); saveCart(); renderCart(); updateCartBadge(); });
  const fin = $('#finalize');
  if (fin) fin.onclick = () => {
    let msg = 'Olá! Quero finalizar este pedido:\n';
    state.cart.forEach((it) => { const { p, size } = cartLineInfo(it); if (p && size) msg += `\n• ${p.name} — ${size.label} — ${it.qty}x — ${brl(size.price_cents * it.qty)}`; });
    msg += `\n\nSubtotal: ${brl(cartSubtotal())}`;
    window.open(waLink(msg), '_blank');
  };
  bindCards();
}

// ---------- binds genéricos ----------
function bindCards() {
  $$('[data-prod]').forEach((el) => el.onclick = () => openProduct(el.dataset.prod));
  $$('[data-nav]').forEach((el) => el.onclick = () => {
    const t = el.dataset.nav;
    if (t === 'home') go('home');
    else if (t === 'imagens') go('category', { catSlug: 'imagens', sub: 'Todas' });
    else if (t === 'cart') go('cart');
  });
  $$('[data-cat]').forEach((el) => el.onclick = () => go('category', { catSlug: el.dataset.cat, sub: 'Todas' }));
  $$('[data-sub]').forEach((el) => el.onclick = () => go('category', { catSlug: 'imagens', sub: el.dataset.sub }));
}

// ---------- mega menu ----------
function buildMega() {
  const subs = imagensSubs();
  const others = CATEGORIES.filter((c) => c.slug !== 'imagens');
  const half = Math.ceil(others.length / 2);
  const colA = others.slice(0, half), colB = others.slice(half);
  const colCat = (arr) => arr.map((c) => {
    const n = PRODUCTS.filter((p) => p.category_id === c.id).length;
    return `<button data-cat="${esc(c.slug)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><span style="color:var(--text);">${esc(c.name)}</span><span style="font-size:11px;color:var(--muted);">${n ? n : 'em breve'}</span></button>`;
  }).join('');

  $('#mega').innerHTML = `
    <div class="mega-in">
      <div>
        <h4>Imagens — por guia</h4>
        <div class="subs">${subs.map((s) => `<button data-sub="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>
      </div>
      <div><h4>Linhas</h4>${colCat(colA)}</div>
      <div><h4>&nbsp;</h4>${colCat(colB)}</div>
    </div>`;
  bindCards();
}
function toggleMega() { $('#mega').classList.toggle('hidden'); if (!$('#mega').classList.contains('hidden')) buildMega(); }
function closeMega() { $('#mega').classList.add('hidden'); }

// ---------- tema ----------
function applyTheme(t) {
  document.body.classList.toggle('light', t === 'claro');
  try { localStorage.setItem('mrbrant_theme', t); } catch (e) {}
}

// ---------- init ----------
function bindChrome() {
  $('#catsToggle').onclick = toggleMega;
  $('#themeBtn').onclick = () => applyTheme(document.body.classList.contains('light') ? 'escuro' : 'claro');
  $('#contatoBtn').onclick = () => { closeMega(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); };
  $('#waTop').href = waLink('Olá! Vim pelo site da Mr.Brant.');
  $('#waFooter').href = waLink('Olá! Vim pelo site da Mr.Brant.');
  $$('[data-nav]').forEach((el) => el.onclick = () => {
    const t = el.dataset.nav;
    if (t === 'home') go('home');
    else if (t === 'imagens') go('category', { catSlug: 'imagens', sub: 'Todas' });
    else if (t === 'cart') go('cart');
  });
  // footer cats preenchido após dados
}
function fillFooterCats() {
  $('#footerCats').innerHTML = CATEGORIES.map((c) => `<div class="lnk" data-cat="${esc(c.slug)}">${esc(c.name)}</div>`).join('');
  $$('#footerCats [data-cat]').forEach((el) => el.onclick = () => go('category', { catSlug: el.dataset.cat, sub: 'Todas' }));
}

async function init() {
  try { const t = localStorage.getItem('mrbrant_theme'); if (t) applyTheme(t); } catch (e) {}
  bindChrome();
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div style="min-height:60vh;display:grid;place-items:center;color:var(--red);padding:40px;text-align:center;">Não foi possível carregar o catálogo.<br><span style="color:var(--muted);font-size:13px;">${esc(err.message || err)}</span></div>`;
    return;
  }
  fillFooterCats();
  refreshWaLinks();
  updateCartBadge();
  render();
}

function refreshWaLinks() {
  const href = waLink('Olá! Vim pelo site da Mr.Brant.');
  $('#waTop').href = href;
  $('#waFooter').href = href;
}

init();
