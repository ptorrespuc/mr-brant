// ============================================================
// Mr.Brant — Admin
// ============================================================
const { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } = window.MB_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

let CATEGORIES = [];
let SUBCATEGORIES = [];
let ALL_PRODUCTS = [];
let editing = null; // produto em edição (null = novo)
let pendingPhotos = []; // { file?, path, url, sort } — fotos do produto atual

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function publicUrl(path) {
  return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function slugify(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------- AUTH ----------
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) enterApp();
  else show($('login'));
}

$('loginBtn').onclick = async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  hide($('loginErr'));
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $('loginErr').textContent = 'E-mail ou senha inválidos.';
    show($('loginErr'));
  } else {
    enterApp();
  }
};
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });

$('logoutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function enterApp() {
  hide($('login'));
  show($('app'));
  await loadReference();
  await loadProducts();
}

// ---------- PEDIDOS ----------
const ORDER_STATUS = ['pendente', 'pago', 'enviado', 'entregue', 'cancelado'];
const brl = (c) => 'R$ ' + ((c || 0) / 100).toFixed(2).replace('.', ',');
function hideAllViews() { ['listView', 'editView', 'settingsView', 'ordersView', 'orderView'].forEach((v) => hide($(v))); }

$('ordersBtn').onclick = openOrders;
$('ordersBack').onclick = () => { hide($('ordersView')); show($('listView')); };
$('orderBack').onclick = () => { hide($('orderView')); openOrders(); };

async function openOrders() {
  hideAllViews(); show($('ordersView'));
  window.scrollTo(0, 0);
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  const list = $('ordersList');
  if (error) { list.innerHTML = `<p class="muted">Erro ao carregar pedidos. (Rodou o pedidos.sql?)</p>`; return; }
  if (!data.length) { list.innerHTML = ''; show($('ordersEmpty')); return; }
  hide($('ordersEmpty'));
  list.innerHTML = data.map((o) => `
    <div class="card" data-order="${o.id}" style="cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap;">
      <div>
        <div style="font-weight:600;">${o.number || '—'} <span class="badge">${o.status}</span></div>
        <div class="muted" style="font-size:13px;">${o.customer_name || ''} · ${o.customer_email} · ${new Date(o.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <div style="color:var(--gold);font-weight:600;">${brl(o.total_cents)}</div>
    </div>`).join('');
  list.querySelectorAll('[data-order]').forEach((el) => el.onclick = () => openOrder(el.dataset.order));
}

async function openOrder(id) {
  hideAllViews(); show($('orderView'));
  window.scrollTo(0, 0);
  const { data: o } = await sb.from('orders').select('*, order_items(*)').eq('id', id).single();
  $('orderTitle').textContent = `Pedido ${o.number || ''}`;
  const addr = [o.ship_street, o.ship_number, o.ship_complement, o.ship_district, o.ship_city, o.ship_state, o.ship_cep].filter(Boolean).join(', ');
  $('orderDetail').innerHTML = `
    <div class="card">
      <h3 style="font-size:16px;margin-bottom:10px;">Cliente</h3>
      <p>${o.customer_name || ''} — ${o.customer_email}${o.customer_phone ? ' — ' + o.customer_phone : ''}</p>
      <p class="muted" style="margin-top:6px;">${addr || 'Sem endereço'}</p>
    </div>
    <div class="card">
      <h3 style="font-size:16px;margin-bottom:10px;">Itens</h3>
      ${(o.order_items || []).map((i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);"><span>${i.product_name}${i.size_label ? ' · ' + i.size_label : ''} · ${i.qty}x</span><span style="color:var(--gold);">${brl(i.line_total_cents)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--muted);"><span>Frete${o.shipping_method ? ' (' + o.shipping_method + ')' : ''}</span><span>${brl(o.shipping_price_cents)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-weight:600;"><span>Total</span><span style="color:var(--gold);">${brl(o.total_cents)}</span></div>
      <p class="muted" style="font-size:12px;margin-top:8px;">Pagamento: ${o.payment_method || '—'} · ID: ${o.payment_id || '—'}</p>
    </div>
    <div class="card">
      <h3 style="font-size:16px;margin-bottom:14px;">Gerenciar</h3>
      <div class="row">
        <div class="field"><label>Status</label>
          <select id="o_status">${ORDER_STATUS.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Código de rastreio</label><input id="o_tracking" value="${o.tracking_code || ''}" placeholder="Ex.: AA123456789BR"></div>
      </div>
      <button id="o_save" class="btn gold">Salvar</button>
    </div>`;
  $('o_save').onclick = async () => {
    show($('loader'));
    const { error } = await sb.from('orders').update({ status: $('o_status').value, tracking_code: $('o_tracking').value.trim() || null }).eq('id', id);
    hide($('loader'));
    toast(error ? 'Erro ao salvar' : 'Pedido atualizado');
  };
}

// ---------- CONFIGURAÇÕES ----------
$('settingsBtn').onclick = openSettings;
$('settingsBack').onclick = () => { hide($('settingsView')); show($('listView')); };

async function openSettings() {
  hideAllViews(); show($('settingsView'));
  window.scrollTo(0, 0);
  // popula select de destaque
  $('s_hero_featured').innerHTML = '<option value="">— nenhum —</option>' +
    ALL_PRODUCTS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  // carrega valores atuais
  const { data } = await sb.from('settings').select('*');
  const map = {};
  (data || []).forEach((r) => { map[r.key] = r.value; });
  $('s_whatsapp').value = map.whatsapp || '';
  $('s_hero_eyebrow').value = map.hero_eyebrow || '';
  $('s_hero_title').value = map.hero_title || '';
  $('s_hero_subtitle').value = map.hero_subtitle || '';
  $('s_hero_featured').value = map.hero_featured_id || '';
  $('s_frete_cep').value = map.frete_cep_origem || '';
  $('s_frete_peso').value = map.frete_peso_padrao || '';
  $('s_frete_comp').value = map.frete_comp_padrao || '';
  $('s_frete_larg').value = map.frete_larg_padrao || '';
  $('s_frete_alt').value = map.frete_alt_padrao || '';
  $('s_frete_sandbox').checked = (map.frete_sandbox || 'true') === 'true';
  $('s_mp_sandbox').checked = (map.mp_sandbox || 'true') === 'true';
}

$('settingsSave').onclick = async () => {
  show($('loader'));
  try {
    const rows = [
      { key: 'whatsapp',         value: $('s_whatsapp').value.replace(/\D/g, '') },
      { key: 'hero_eyebrow',     value: $('s_hero_eyebrow').value.trim() },
      { key: 'hero_title',       value: $('s_hero_title').value.trim() },
      { key: 'hero_subtitle',    value: $('s_hero_subtitle').value.trim() },
      { key: 'hero_featured_id', value: $('s_hero_featured').value },
      { key: 'frete_cep_origem', value: $('s_frete_cep').value.replace(/\D/g, '') },
      { key: 'frete_peso_padrao', value: $('s_frete_peso').value.trim() },
      { key: 'frete_comp_padrao', value: $('s_frete_comp').value.trim() },
      { key: 'frete_larg_padrao', value: $('s_frete_larg').value.trim() },
      { key: 'frete_alt_padrao', value: $('s_frete_alt').value.trim() },
      { key: 'frete_sandbox', value: $('s_frete_sandbox').checked ? 'true' : 'false' },
      { key: 'mp_sandbox', value: $('s_mp_sandbox').checked ? 'true' : 'false' },
    ];
    const { error } = await sb.from('settings').upsert(rows, { onConflict: 'key' });
    if (error) throw error;
    hide($('loader'));
    toast('Configurações salvas!');
    hide($('settingsView')); show($('listView'));
  } catch (err) {
    hide($('loader'));
    toast('Erro ao salvar: ' + (err.message || err));
  }
};

// ---------- REFERÊNCIA (categorias/subcategorias) ----------
async function loadReference() {
  const [cats, subs] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    sb.from('subcategories').select('*').order('sort'),
  ]);
  CATEGORIES = cats.data || [];
  SUBCATEGORIES = subs.data || [];
}

// ---------- LISTAGEM ----------
async function loadProducts() {
  const { data } = await sb.from('products')
    .select('*, product_images(*), product_sizes(*)')
    .order('sort');
  ALL_PRODUCTS = data || [];
  renderList();
}

function renderList() {
  const list = $('prodList');
  list.innerHTML = '';
  if (!ALL_PRODUCTS.length) { show($('emptyMsg')); return; }
  hide($('emptyMsg'));
  ALL_PRODUCTS.forEach((p) => {
    const imgs = (p.product_images || []).sort((a, b) => a.sort - b.sort);
    const thumb = imgs[0] ? publicUrl(imgs[0].path) : '';
    const sizes = (p.product_sizes || []).sort((a, b) => a.price_cents - b.price_cents);
    const minPrice = sizes.length ? 'a partir de R$ ' + (sizes[0].price_cents / 100).toFixed(2).replace('.', ',') : 'sem preço';
    const el = document.createElement('div');
    el.className = 'prod-item';
    el.innerHTML = `
      <div class="thumb" style="background-image:url('${thumb}')"></div>
      <div class="body">
        <div class="name">${p.name}</div>
        <div class="muted">${minPrice}</div>
        <span class="badge ${p.active ? '' : 'off'}">${p.active ? 'Ativo' : 'Inativo'}</span>
      </div>`;
    el.onclick = () => openEditor(p);
    list.appendChild(el);
  });
}

// ---------- EDITOR ----------
$('newBtn').onclick = () => openEditor(null);
$('backBtn').onclick = () => { hide($('editView')); show($('listView')); };

function fillCategorySelect() {
  $('f_category').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  fillSubcategorySelect();
}
function fillSubcategorySelect() {
  const catId = $('f_category').value;
  const subs = SUBCATEGORIES.filter((s) => s.category_id === catId);
  $('f_subcategory').innerHTML = '<option value="">— nenhuma —</option>' +
    subs.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
}
$('f_category').onchange = fillSubcategorySelect;
$('f_name').addEventListener('blur', () => {
  if (!$('f_slug').value) $('f_slug').value = slugify($('f_name').value);
});

async function openEditor(p) {
  editing = p;
  hideAllViews();
  show($('editView'));
  $('editTitle').textContent = p ? 'Editar imagem' : 'Nova imagem';
  $('deleteBtn').classList.toggle('hidden', !p);

  fillCategorySelect();

  $('f_name').value = p?.name || '';
  $('f_slug').value = p?.slug || '';
  $('f_tagline').value = p?.tagline || '';
  $('f_note').value = p?.note || '';
  $('f_obs').value = p?.obs || '';
  $('f_active').checked = p ? p.active : true;
  if (p?.category_id) $('f_category').value = p.category_id;
  fillSubcategorySelect();
  if (p?.subcategory_id) $('f_subcategory').value = p.subcategory_id;

  // fotos
  pendingPhotos = (p?.product_images || []).slice().sort((a, b) => a.sort - b.sort)
    .map((img) => ({ path: img.path, url: publicUrl(img.path) }));
  renderThumbs();

  // enquadramento
  $('f_fit').value = p?.image_fit || 'cover';
  $('f_pos').value = p?.image_pos != null ? p.image_pos : 50;
  $('f_posx').value = p?.image_pos_x != null ? p.image_pos_x : 50;
  $('f_zoom').value = p?.image_zoom != null ? p.image_zoom : 100;
  updateFitPreview();

  // tamanhos
  $('sizes').innerHTML = '';
  const sizes = (p?.product_sizes || []).slice().sort((a, b) => a.sort - b.sort);
  if (sizes.length) sizes.forEach((s) => addSizeRow(s));
  else addSizeRow({});

  // descrições
  $('descs').innerHTML = '';
  const descs = p?.descriptions || [];
  if (descs.length) descs.forEach((d) => addDescRow(d));
  else addDescRow();

  // specs
  $('specs').innerHTML = '';
  const specs = p?.specs || [];
  if (specs.length) specs.forEach((s) => addSpecRow(s.k, s.v));
  else addSpecRow();

  // relacionamentos
  await renderRelations(p);

  $('f_photos').value = '';
  window.scrollTo(0, 0);
}

// ---------- FOTOS ----------
$('f_photos').onchange = (e) => {
  Array.from(e.target.files).forEach((file) => {
    pendingPhotos.push({ file, url: URL.createObjectURL(file) });
  });
  renderThumbs();
  updateFitPreview();
};

// ---------- ENQUADRAMENTO ----------
function updateFitPreview() {
  const box = $('fitPreview');
  const first = pendingPhotos[0];
  box.style.backgroundImage = first ? `url('${first.url}')` : 'none';
  const fit = $('f_fit').value;
  const pos = $('f_pos').value;
  const posx = $('f_posx').value;
  const zoom = $('f_zoom').value;
  $('posWrap').style.display = fit === 'cover' ? '' : 'none';
  box.style.backgroundRepeat = 'no-repeat';
  box.style.backgroundColor = '#0d0a05';
  if (fit === 'contain') {
    box.style.backgroundSize = 'contain';
    box.style.backgroundPosition = 'center';
  } else {
    box.style.backgroundSize = `${zoom}%`;
    box.style.backgroundPosition = `${posx}% ${pos}%`;
  }
}
$('f_fit').onchange = updateFitPreview;
$('f_pos').oninput = updateFitPreview;
$('f_posx').oninput = updateFitPreview;
$('f_zoom').oninput = updateFitPreview;
function renderThumbs() {
  const c = $('thumbs');
  c.innerHTML = '';
  pendingPhotos.forEach((ph, i) => {
    const box = document.createElement('div');
    box.className = 'thumb-box';
    box.style.backgroundImage = `url('${ph.url}')`;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.onclick = () => { pendingPhotos.splice(i, 1); renderThumbs(); };
    box.appendChild(rm);
    c.appendChild(box);
  });
}

// ---------- TAMANHOS ----------
$('addSize').onclick = () => addSizeRow({});
function addSizeRow(s = {}) {
  const v = (x) => (x == null ? '' : x);
  const row = document.createElement('div');
  row.style.cssText = 'background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;';
  row.className = 'size-block';
  row.innerHTML = `
    <div class="size-row">
      <input class="s-label" placeholder="Tamanho (ex.: 30 cm)" value="${v(s.label)}">
      <input class="s-price" type="number" step="0.01" placeholder="Preço (189,90)" value="${s.price_cents == null ? '' : (s.price_cents / 100).toFixed(2)}">
      <button class="btn sm danger" type="button">×</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
      <input class="s-weight" type="number" placeholder="Peso (g)" value="${v(s.weight_g)}" style="flex:1;min-width:90px;">
      <input class="s-len" type="number" placeholder="Compr. (cm)" value="${v(s.length_cm)}" style="flex:1;min-width:90px;">
      <input class="s-wid" type="number" placeholder="Larg. (cm)" value="${v(s.width_cm)}" style="flex:1;min-width:90px;">
      <input class="s-hei" type="number" placeholder="Alt. (cm)" value="${v(s.height_cm)}" style="flex:1;min-width:90px;">
    </div>
    <p class="muted" style="margin-top:6px;font-size:12px;">Peso e dimensões são usados no cálculo do frete. Se ficar vazio, usa o padrão das Configurações.</p>`;
  row.querySelector('button').onclick = () => row.remove();
  $('sizes').appendChild(row);
}

// ---------- DESCRIÇÕES ----------
$('addDesc').onclick = () => addDescRow();
function addDescRow(text = '') {
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `<textarea class="d-text" placeholder="Parágrafo da descrição...">${text}</textarea><button class="btn sm danger">×</button>`;
  row.querySelector('button').onclick = () => row.remove();
  $('descs').appendChild(row);
}

// ---------- SPECS ----------
$('addSpec').onclick = () => addSpecRow();
function addSpecRow(k = '', v = '') {
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input class="sp-k" placeholder="Material" value="${k}">
    <input class="sp-v" placeholder="PLA" value="${v}">
    <button class="btn sm danger">×</button>`;
  row.querySelector('button').onclick = () => row.remove();
  $('specs').appendChild(row);
}

// ---------- RELACIONAMENTOS ----------
async function renderRelations(p) {
  let related = [];
  if (p) {
    const { data } = await sb.from('product_relations').select('related_product_id').eq('product_id', p.id);
    related = (data || []).map((r) => r.related_product_id);
  }
  const c = $('relations');
  c.innerHTML = '';
  ALL_PRODUCTS.filter((o) => !p || o.id !== p.id).forEach((o) => {
    const item = document.createElement('label');
    item.className = 'rel-item';
    item.innerHTML = `<input type="checkbox" value="${o.id}" ${related.includes(o.id) ? 'checked' : ''}><span>${o.name}</span>`;
    c.appendChild(item);
  });
}

// ---------- SALVAR ----------
$('saveBtn').onclick = async () => {
  const name = $('f_name').value.trim();
  if (!name) { toast('Informe o nome'); return; }
  const slug = $('f_slug').value.trim() || slugify(name);

  show($('loader'));
  try {
    // coletar campos
    const descriptions = Array.from(document.querySelectorAll('.d-text'))
      .map((t) => t.value.trim()).filter(Boolean);
    const specs = Array.from(document.querySelectorAll('#specs .spec-row'))
      .map((r) => ({ k: r.querySelector('.sp-k').value.trim(), v: r.querySelector('.sp-v').value.trim() }))
      .filter((s) => s.k || s.v);
    const intOrNull = (el) => { const n = parseInt(el.value, 10); return Number.isFinite(n) ? n : null; };
    const sizes = Array.from(document.querySelectorAll('#sizes .size-block'))
      .map((r, i) => ({
        label: r.querySelector('.s-label').value.trim(),
        price_cents: Math.round(parseFloat(r.querySelector('.s-price').value.replace(',', '.')) * 100) || 0,
        weight_g: intOrNull(r.querySelector('.s-weight')),
        length_cm: intOrNull(r.querySelector('.s-len')),
        width_cm: intOrNull(r.querySelector('.s-wid')),
        height_cm: intOrNull(r.querySelector('.s-hei')),
        sort: i,
      }))
      .filter((s) => s.label);

    const payload = {
      name, slug,
      tagline: $('f_tagline').value.trim(),
      category_id: $('f_category').value || null,
      subcategory_id: $('f_subcategory').value || null,
      note: $('f_note').value.trim(),
      obs: $('f_obs').value.trim(),
      descriptions, specs,
      active: $('f_active').checked,
      image_fit: $('f_fit').value,
      image_pos: parseInt($('f_pos').value, 10) || 0,
      image_pos_x: parseInt($('f_posx').value, 10) || 0,
      image_zoom: parseInt($('f_zoom').value, 10) || 100,
    };

    // upsert do produto
    let productId;
    if (editing) {
      const { error } = await sb.from('products').update(payload).eq('id', editing.id);
      if (error) throw error;
      productId = editing.id;
    } else {
      const { data, error } = await sb.from('products').insert(payload).select('id').single();
      if (error) throw error;
      productId = data.id;
    }

    // upload de novas fotos
    for (const ph of pendingPhotos) {
      if (ph.file) {
        const ext = ph.file.name.split('.').pop().toLowerCase();
        ph.path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await sb.storage.from(STORAGE_BUCKET).upload(ph.path, ph.file, { upsert: true });
        if (error) throw error;
      }
    }

    // regravar product_images (apaga e recria na ordem atual)
    await sb.from('product_images').delete().eq('product_id', productId);
    if (pendingPhotos.length) {
      await sb.from('product_images').insert(pendingPhotos.map((ph, i) => ({
        product_id: productId, path: ph.path, sort: i,
      })));
    }

    // regravar tamanhos
    await sb.from('product_sizes').delete().eq('product_id', productId);
    if (sizes.length) {
      await sb.from('product_sizes').insert(sizes.map((s) => ({ ...s, product_id: productId })));
    }

    // regravar relacionamentos (bidirecional)
    const relIds = Array.from(document.querySelectorAll('#relations input:checked')).map((i) => i.value);
    await sb.from('product_relations').delete().eq('product_id', productId);
    // limpa o lado inverso desse produto também e recria
    await sb.from('product_relations').delete().eq('related_product_id', productId);
    if (relIds.length) {
      const rows = [];
      relIds.forEach((rid) => {
        rows.push({ product_id: productId, related_product_id: rid });
        rows.push({ product_id: rid, related_product_id: productId });
      });
      await sb.from('product_relations').insert(rows);
    }

    hide($('loader'));
    toast('Imagem salva!');
    await loadProducts();
    hide($('editView'));
    show($('listView'));
  } catch (err) {
    hide($('loader'));
    console.error(err);
    toast('Erro ao salvar: ' + (err.message || err));
  }
};

// ---------- EXCLUIR ----------
$('deleteBtn').onclick = async () => {
  if (!editing) return;
  if (!confirm(`Excluir "${editing.name}"? Isso remove o produto e suas fotos do catálogo.`)) return;
  show($('loader'));
  try {
    // remove fotos do storage
    const paths = (editing.product_images || []).map((i) => i.path);
    if (paths.length) await sb.storage.from(STORAGE_BUCKET).remove(paths);
    // remove produto (cascata apaga sizes/images/relations)
    const { error } = await sb.from('products').delete().eq('id', editing.id);
    if (error) throw error;
    hide($('loader'));
    toast('Imagem excluída');
    await loadProducts();
    hide($('editView'));
    show($('listView'));
  } catch (err) {
    hide($('loader'));
    toast('Erro ao excluir: ' + (err.message || err));
  }
};

init();
