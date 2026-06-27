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
let BOX_SIZES = [];
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
const ORDER_STATUS = ['pendente', 'negociando', 'pago', 'enviado', 'entregue', 'cancelado'];
const brl = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function hideAllViews() { ['listView', 'editView', 'settingsView', 'ordersView', 'orderView', 'boxesView', 'couponsView'].forEach((v) => hide($(v))); }

// ---------- CUPONS ----------
$('couponsBtn').onclick = openCoupons;
$('couponsBack').onclick = () => { hide($('couponsView')); show($('listView')); };
$('couponAdd').onclick = () => addCouponRow({});

async function openCoupons() {
  hideAllViews(); show($('couponsView'));
  window.scrollTo(0, 0);
  const { data, error } = await sb.from('coupons').select('*').order('created_at', { ascending: false });
  $('couponsList').innerHTML = '';
  if (error) { $('couponsList').innerHTML = '<p class="muted">Erro ao carregar. (Rodou o cupons.sql?)</p>'; return; }
  if (!data.length) $('couponsList').innerHTML = '<p class="muted">Nenhum cupom ainda. Clique em "+ Novo cupom".</p>';
  (data || []).forEach((c) => addCouponRow(c));
}

function addCouponRow(c) {
  if ($('couponsList').querySelector('.muted')) $('couponsList').innerHTML = '';
  const v = (x) => (x == null ? '' : x);
  const isPercent = (c.type || 'percent') === 'percent';
  const valueShown = c.value == null ? '' : (c.type === 'fixed' ? (c.value / 100).toFixed(2) : c.value);
  const row = document.createElement('div');
  row.className = 'card';
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;';
  row.dataset.id = c.id || '';
  row.innerHTML = `
    <div class="field" style="flex:1;min-width:120px;margin:0;"><label>Código</label><input class="c-code" value="${v(c.code)}" placeholder="BEMVINDO10" style="text-transform:uppercase;"></div>
    <div class="field" style="flex:0 0 130px;margin:0;"><label>Tipo</label>
      <select class="c-type"><option value="percent" ${isPercent ? 'selected' : ''}>Percentual (%)</option><option value="fixed" ${!isPercent ? 'selected' : ''}>Valor fixo (R$)</option></select>
    </div>
    <div class="field" style="flex:0 0 110px;margin:0;"><label>Valor</label><input class="c-value" type="number" step="0.01" value="${valueShown}" placeholder="${isPercent ? '10' : '20,00'}"></div>
    <div class="field" style="flex:0 0 140px;margin:0;"><label>Válido de</label><input class="c-from" type="date" value="${v(c.valid_from)}"></div>
    <div class="field" style="flex:0 0 140px;margin:0;"><label>Válido até</label><input class="c-until" type="date" value="${v(c.valid_until)}"></div>
    <label style="display:flex;align-items:center;gap:6px;margin:0 0 10px;text-transform:none;"><input class="c-active" type="checkbox" style="width:auto;" ${c.active === false ? '' : 'checked'}> ativo</label>
    <button class="btn gold sm c-save" type="button">Salvar</button>
    <button class="btn danger sm c-del" type="button">Excluir</button>`;
  row.querySelector('.c-save').onclick = () => saveCoupon(row);
  row.querySelector('.c-del').onclick = () => deleteCoupon(row);
  $('couponsList').appendChild(row);
}

async function saveCoupon(row) {
  const code = row.querySelector('.c-code').value.trim().toUpperCase();
  if (!code) { toast('Informe o código'); return; }
  const type = row.querySelector('.c-type').value;
  const raw = parseFloat(row.querySelector('.c-value').value.replace(',', '.'));
  if (!Number.isFinite(raw) || raw <= 0) { toast('Informe um valor válido'); return; }
  if (type === 'percent' && raw > 100) { toast('Percentual máximo é 100'); return; }
  const value = type === 'fixed' ? Math.round(raw * 100) : Math.round(raw);
  const payload = {
    code, type, value,
    valid_from: row.querySelector('.c-from').value || null,
    valid_until: row.querySelector('.c-until').value || null,
    active: row.querySelector('.c-active').checked,
  };
  show($('loader'));
  try {
    if (row.dataset.id) {
      const { error } = await sb.from('coupons').update(payload).eq('id', row.dataset.id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('coupons').insert(payload).select('id').single();
      if (error) throw error;
      row.dataset.id = data.id;
    }
    hide($('loader')); toast('Cupom salvo');
  } catch (e) { hide($('loader')); toast('Erro: ' + (e.message || e)); }
}

async function deleteCoupon(row) {
  if (!row.dataset.id) { row.remove(); return; }
  if (!confirm('Excluir este cupom?')) return;
  show($('loader'));
  const { error } = await sb.from('coupons').delete().eq('id', row.dataset.id);
  hide($('loader'));
  if (error) { toast('Erro ao excluir: ' + error.message); return; }
  row.remove();
  toast('Cupom excluído');
}

// ---------- TAMANHOS (caixas) ----------
$('boxesBtn').onclick = openBoxSizes;
$('boxesBack').onclick = () => { hide($('boxesView')); show($('listView')); };
$('boxAdd').onclick = () => addBoxRow({});

async function openBoxSizes() {
  hideAllViews(); show($('boxesView'));
  window.scrollTo(0, 0);
  await loadReference(); // recarrega BOX_SIZES
  $('boxesList').innerHTML = '';
  if (!BOX_SIZES.length) $('boxesList').innerHTML = '<p class="muted">Nenhum tamanho ainda. Clique em "+ Novo tamanho".</p>';
  BOX_SIZES.forEach((b) => addBoxRow(b));
}

function addBoxRow(b) {
  if ($('boxesList').querySelector('.muted')) $('boxesList').innerHTML = '';
  const v = (x) => (x == null ? '' : x);
  const row = document.createElement('div');
  row.className = 'card';
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;';
  row.dataset.id = b.id || '';
  row.innerHTML = `
    <div class="field" style="flex:1;min-width:120px;margin:0;"><label>Tamanho</label><input class="b-label" value="${v(b.label)}" placeholder="30 cm"></div>
    <div class="field" style="flex:0 0 90px;margin:0;"><label>Compr.</label><input class="b-len" type="number" value="${v(b.length_cm)}"></div>
    <div class="field" style="flex:0 0 90px;margin:0;"><label>Larg.</label><input class="b-wid" type="number" value="${v(b.width_cm)}"></div>
    <div class="field" style="flex:0 0 90px;margin:0;"><label>Alt.</label><input class="b-hei" type="number" value="${v(b.height_cm)}"></div>
    <div class="field" style="flex:0 0 110px;margin:0;"><label>Peso padrão (g)</label><input class="b-weight" type="number" value="${v(b.default_weight_g)}"></div>
    <button class="btn gold sm b-save" type="button">Salvar</button>
    <button class="btn danger sm b-del" type="button">Excluir</button>`;
  row.querySelector('.b-save').onclick = () => saveBox(row);
  row.querySelector('.b-del').onclick = () => deleteBox(row);
  $('boxesList').appendChild(row);
}

async function saveBox(row) {
  const intOrNull = (sel) => { const n = parseInt(row.querySelector(sel).value, 10); return Number.isFinite(n) ? n : null; };
  const label = row.querySelector('.b-label').value.trim();
  if (!label) { toast('Informe o nome do tamanho'); return; }
  const payload = {
    label,
    length_cm: intOrNull('.b-len'), width_cm: intOrNull('.b-wid'), height_cm: intOrNull('.b-hei'),
    default_weight_g: intOrNull('.b-weight'),
  };
  show($('loader'));
  try {
    if (row.dataset.id) {
      const { error } = await sb.from('box_sizes').update(payload).eq('id', row.dataset.id);
      if (error) throw error;
    } else {
      payload.sort = BOX_SIZES.length;
      const { data, error } = await sb.from('box_sizes').insert(payload).select('id').single();
      if (error) throw error;
      row.dataset.id = data.id;
    }
    await loadReference();
    hide($('loader')); toast('Tamanho salvo');
  } catch (e) { hide($('loader')); toast('Erro: ' + (e.message || e)); }
}

async function deleteBox(row) {
  if (!row.dataset.id) { row.remove(); return; }
  if (!confirm('Excluir este tamanho? Produtos que o usam ficarão sem tamanho.')) return;
  show($('loader'));
  const { error } = await sb.from('box_sizes').delete().eq('id', row.dataset.id);
  hide($('loader'));
  if (error) { toast('Erro ao excluir: ' + error.message); return; }
  await loadReference();
  row.remove();
  toast('Tamanho excluído');
}

$('ordersBtn').onclick = openOrders;
$('ordersBack').onclick = () => { hide($('ordersView')); show($('listView')); };
$('orderBack').onclick = () => { hide($('orderView')); openOrders(); };

const PAID_STATUS = ['pago', 'enviado', 'entregue'];
let ordersPeriod = '30'; // período selecionado
let ordersStatus = 'confirmados'; // filtro de status da lista
let lastOrders = []; // pedidos do período carregados

function periodRange(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  else if (period === '7') { start.setDate(now.getDate() - 7); }
  else if (period === '30') { start.setDate(now.getDate() - 30); }
  else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (period === 'all') return { from: null, to: null };
  else return null; // custom: usa os inputs
  return { from: start.toISOString(), to: null };
}

$('periodApply').onclick = () => {
  const f = $('periodFrom').value, t = $('periodTo').value;
  ordersPeriod = 'custom';
  $$('#periodBtns [data-period]').forEach((b) => b.classList.remove('gold'));
  loadOrders({ from: f ? new Date(f + 'T00:00:00').toISOString() : null, to: t ? new Date(t + 'T23:59:59').toISOString() : null });
};
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

async function openOrders() {
  hideAllViews(); show($('ordersView'));
  window.scrollTo(0, 0);
  $$('#periodBtns [data-period]').forEach((b) => {
    b.onclick = () => {
      ordersPeriod = b.dataset.period;
      $$('#periodBtns [data-period]').forEach((x) => x.classList.toggle('gold', x === b));
      $('periodFrom').value = ''; $('periodTo').value = '';
      loadOrders(periodRange(ordersPeriod));
    };
  });
  $$('#statusBtns [data-status]').forEach((b) => {
    b.onclick = () => {
      ordersStatus = b.dataset.status;
      $$('#statusBtns [data-status]').forEach((x) => x.classList.toggle('gold', x === b));
      renderOrdersList();
    };
  });
  loadOrders(periodRange(ordersPeriod));
}

function statusMatch(o) {
  if (ordersStatus === 'todos') return true;
  if (ordersStatus === 'confirmados') return PAID_STATUS.includes(o.status);
  return o.status === ordersStatus;
}

function renderOrdersList() {
  const list = $('ordersList');
  const filtered = lastOrders.filter(statusMatch);
  if (!filtered.length) {
    list.innerHTML = '';
    const labels = { confirmados: 'confirmado', negociando: 'em negociação', pendente: 'pendente', cancelado: 'cancelado', todos: '' };
    $('ordersEmpty').textContent = `Nenhum pedido ${labels[ordersStatus] || ''} neste período.`.replace('  ', ' ');
    show($('ordersEmpty'));
    return;
  }
  hide($('ordersEmpty'));
  list.innerHTML = filtered.map((o) => `
    <div class="card" data-order="${o.id}" style="cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap;">
      <div>
        <div style="font-weight:600;">${o.number || '—'} <span class="badge">${o.status}</span></div>
        <div class="muted" style="font-size:13px;">${o.customer_name || ''} · ${o.customer_email} · ${new Date(o.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <div style="color:var(--gold);font-weight:600;">${brl(o.total_cents)}</div>
    </div>`).join('');
  list.querySelectorAll('[data-order]').forEach((el) => el.onclick = () => openOrder(el.dataset.order));
}

async function loadOrders(range) {
  const list = $('ordersList');
  const kpis = $('ordersKpis');
  kpis.innerHTML = '';
  list.innerHTML = '<p class="muted">Carregando…</p>';
  let q = sb.from('orders').select('*').order('created_at', { ascending: false });
  if (range && range.from) q = q.gte('created_at', range.from);
  if (range && range.to) q = q.lte('created_at', range.to);
  const { data, error } = await q;
  if (error) { list.innerHTML = `<p class="muted">Erro ao carregar pedidos. (Rodou o pedidos.sql?)</p>`; return; }
  lastOrders = data;

  // KPIs
  const paid = data.filter((o) => PAID_STATUS.includes(o.status));
  const faturamento = paid.reduce((s, o) => s + (o.total_cents || 0), 0);
  const pendente = data.filter((o) => o.status === 'pendente').reduce((s, o) => s + (o.total_cents || 0), 0);
  const ticket = paid.length ? Math.round(faturamento / paid.length) : 0;
  const kpi = (label, value, sub) => `
    <div class="card" style="margin:0;">
      <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;">${label}</div>
      <div style="font-family:Cinzel,serif;font-size:26px;color:var(--gold);margin-top:6px;">${value}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:4px;">${sub}</div>` : ''}
    </div>`;
  kpis.innerHTML =
    kpi('Pedidos', data.length, `${paid.length} pago${paid.length !== 1 ? 's' : ''}`) +
    kpi('Faturamento', brl(faturamento), 'pedidos pagos') +
    kpi('Ticket médio', brl(ticket), 'por pedido pago') +
    kpi('A receber', brl(pendente), 'aguardando pagamento');

  renderOrdersList();
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
      ${o.discount_cents ? `<div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--green);"><span>Desconto${o.coupon_code ? ' (' + o.coupon_code + ')' : ''}</span><span>− ${brl(o.discount_cents)}</span></div>` : ''}
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
  $('s_frete_empresas').value = map.frete_empresas || '';
  $('s_mp_sandbox').checked = (map.mp_sandbox || 'true') === 'true';
  $('s_resend_from').value = map.resend_from || '';
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
      { key: 'frete_empresas', value: $('s_frete_empresas').value.trim() },
      { key: 'mp_sandbox', value: $('s_mp_sandbox').checked ? 'true' : 'false' },
      { key: 'resend_from', value: $('s_resend_from').value.trim() },
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
  const [cats, subs, boxes] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    sb.from('subcategories').select('*').order('sort'),
    sb.from('box_sizes').select('*').order('sort'),
  ]);
  CATEGORIES = cats.data || [];
  SUBCATEGORIES = subs.data || [];
  BOX_SIZES = boxes.data || [];
}

// ---------- LISTAGEM ----------
async function loadProducts() {
  let r = await sb.from('products').select('*, product_images(*), product_sizes(*, box_sizes(*))').order('sort');
  if (r.error) r = await sb.from('products').select('*, product_images(*), product_sizes(*)').order('sort');
  ALL_PRODUCTS = r.data || [];
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

// ---------- TAMANHOS DO PRODUTO ----------
$('addSize').onclick = () => addSizeRow({});
function boxDimsText(box) {
  if (!box) return '';
  const d = [box.length_cm, box.width_cm, box.height_cm].filter((x) => x != null);
  const dims = d.length === 3 ? `${d[0]}×${d[1]}×${d[2]} cm` : 'sem dimensões';
  return `Caixa: ${dims}${box.default_weight_g != null ? ` · peso padrão ${box.default_weight_g} g` : ''}`;
}
function addSizeRow(s = {}) {
  const v = (x) => (x == null ? '' : x);
  const row = document.createElement('div');
  row.style.cssText = 'background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;';
  row.className = 'size-block';
  const opts = '<option value="">— escolha o tamanho —</option>' +
    BOX_SIZES.map((b) => `<option value="${b.id}" ${b.id === s.box_size_id ? 'selected' : ''}>${b.label}</option>`).join('');
  row.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">
      <select class="s-box" style="flex:1;min-width:140px;">${opts}</select>
      <input class="s-price" type="number" step="0.01" placeholder="Preço (189,90)" value="${s.price_cents == null ? '' : (s.price_cents / 100).toFixed(2)}" style="flex:1;min-width:120px;">
      <input class="s-weight" type="number" placeholder="Peso (g)" value="${v(s.weight_g)}" style="flex:0 0 110px;">
      <button class="btn sm danger" type="button">×</button>
    </div>
    <p class="muted s-dims" style="margin-top:6px;font-size:12px;"></p>`;
  const sel = row.querySelector('.s-box');
  const weight = row.querySelector('.s-weight');
  const dims = row.querySelector('.s-dims');
  const refresh = (prefill) => {
    const box = BOX_SIZES.find((b) => b.id === sel.value);
    dims.textContent = box ? boxDimsText(box) : 'Cadastre os tamanhos na aba "Tamanhos".';
    if (prefill && box && !weight.value && box.default_weight_g != null) weight.value = box.default_weight_g;
  };
  sel.onchange = () => refresh(true);
  refresh(false);
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
      .map((r, i) => {
        const boxId = r.querySelector('.s-box').value;
        const box = BOX_SIZES.find((b) => b.id === boxId);
        return {
          box_size_id: boxId || null,
          label: box ? box.label : '',
          price_cents: Math.round(parseFloat(r.querySelector('.s-price').value.replace(',', '.')) * 100) || 0,
          weight_g: intOrNull(r.querySelector('.s-weight')),
          sort: i,
        };
      })
      .filter((s) => s.box_size_id);

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
