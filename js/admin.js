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

// ---------- CONFIGURAÇÕES ----------
$('settingsBtn').onclick = openSettings;
$('settingsBack').onclick = () => { hide($('settingsView')); show($('listView')); };

async function openSettings() {
  hide($('listView')); hide($('editView')); show($('settingsView'));
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
  hide($('listView'));
  hide($('settingsView'));
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

  // tamanhos
  $('sizes').innerHTML = '';
  const sizes = (p?.product_sizes || []).slice().sort((a, b) => a.sort - b.sort);
  if (sizes.length) sizes.forEach((s) => addSizeRow(s.label, s.price_cents));
  else addSizeRow();

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
};
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
$('addSize').onclick = () => addSizeRow();
function addSizeRow(label = '', priceCents = '') {
  const row = document.createElement('div');
  row.className = 'size-row';
  row.innerHTML = `
    <input class="s-label" placeholder="30 cm" value="${label}">
    <input class="s-price" type="number" step="0.01" placeholder="189,90" value="${priceCents === '' ? '' : (priceCents / 100).toFixed(2)}">
    <button class="btn sm danger">×</button>`;
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
    const sizes = Array.from(document.querySelectorAll('#sizes .size-row'))
      .map((r, i) => ({
        label: r.querySelector('.s-label').value.trim(),
        price_cents: Math.round(parseFloat(r.querySelector('.s-price').value.replace(',', '.')) * 100) || 0,
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
