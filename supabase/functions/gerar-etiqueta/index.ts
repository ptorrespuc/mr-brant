// ============================================================
// Mr.Brant — Edge Function: gerar-etiqueta (Melhor Envio)
// Carrinho → comprar → gerar → imprimir. Salva etiqueta + rastreio
// e marca o pedido como "enviado". (Chamada pelo admin autenticado.)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'order_id obrigatório.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: order, error: oErr } = await admin.from('orders').select('*, order_items(*)').eq('id', order_id).single();
    if (oErr || !order) return json({ error: 'Pedido não encontrado.' }, 404);
    if (order.label_url && order.melhorenvio_id) return json({ already: true, label_url: order.label_url, tracking_code: order.tracking_code, melhorenvio_id: order.melhorenvio_id });

    // validações
    if (!order.shipping_service_id) return json({ error: 'Pedido sem serviço de frete (frete foi "a combinar"?).' }, 400);
    if (!(order.customer_cpf || '').trim()) return json({ error: 'Pedido sem CPF do cliente.' }, 400);

    // configurações (remetente + ambiente)
    const { data: cfg } = await admin.from('settings').select('key, value')
      .in('key', ['remet_nome', 'remet_documento', 'remet_telefone', 'remet_endereco', 'remet_numero', 'remet_complemento', 'remet_bairro', 'remet_cidade', 'remet_uf', 'frete_cep_origem', 'melhorenvio_sandbox']);
    const s: Record<string, string> = {};
    (cfg || []).forEach((r: any) => { s[r.key] = r.value; });
    if (!s.remet_nome || !s.frete_cep_origem) return json({ error: 'Remetente incompleto. Configure no admin (Configurações → Remetente da etiqueta).' }, 400);

    const token = Deno.env.get('MELHORENVIO_TOKEN');
    if (!token) return json({ error: 'Token do Melhor Envio não configurado.' }, 500);
    const base = (s.melhorenvio_sandbox === 'true') ? 'https://sandbox.melhorenvio.com.br' : 'https://www.melhorenvio.com.br';

    const me = async (path: string, body: unknown) => {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mr.Brant (contato@mrbrant.com.br)' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      let data: any = null; try { data = JSON.parse(txt); } catch (_) {}
      return { ok: r.ok, status: r.status, data, raw: txt };
    };

    const digits = (v: string) => (v || '').replace(/\D/g, '');
    const from = {
      name: s.remet_nome, phone: s.remet_telefone || '', email: '',
      document: digits(s.remet_documento), address: s.remet_endereco || '', complement: s.remet_complemento || '',
      number: s.remet_numero || 'S/N', district: s.remet_bairro || '', city: s.remet_cidade || '',
      state_abbr: (s.remet_uf || '').toUpperCase(), country_id: 'BR', postal_code: digits(s.frete_cep_origem),
    };
    const to = {
      name: order.customer_name || 'Cliente', phone: digits(order.customer_phone || ''), email: order.customer_email,
      document: digits(order.customer_cpf), address: order.ship_street || '', complement: order.ship_complement || '',
      number: order.ship_number || 'S/N', district: order.ship_district || '', city: order.ship_city || '',
      state_abbr: (order.ship_state || '').toUpperCase(), country_id: 'BR', postal_code: digits(order.ship_cep || ''),
    };
    const products = (order.order_items || []).map((i: any) => ({
      name: `${i.product_name}${i.size_label ? ' ' + i.size_label : ''}`.slice(0, 60),
      quantity: i.qty, unitary_value: Math.max(0.01, (i.unit_price_cents || 0) / 100),
    }));
    const volumes = [{
      height: order.ship_height_cm || 2, width: order.ship_width_cm || 11,
      length: order.ship_length_cm || 16, weight: (order.ship_weight_g || 300) / 1000,
    }];

    // 1) carrinho
    const cart = await me('/api/v2/me/cart', {
      service: order.shipping_service_id, from, to, products, volumes,
      options: { insurance_value: (order.subtotal_cents || 0) / 100, receipt: false, own_hand: false, reverse: false, non_commercial: true },
    });
    if (!cart.ok || !cart.data?.id) return json({ error: 'Falha ao adicionar ao carrinho do Melhor Envio.', status: cart.status, detail: cart.data || cart.raw?.slice(0, 600) }, 502);
    const meId = cart.data.id;

    // 2) comprar (usa saldo da conta)
    const checkout = await me('/api/v2/me/shipment/checkout', { orders: [meId] });
    if (!checkout.ok) return json({ error: 'Falha ao comprar a etiqueta (verifique o saldo no Melhor Envio).', status: checkout.status, detail: checkout.data || checkout.raw?.slice(0, 600) }, 502);

    // 3) gerar
    const gen = await me('/api/v2/me/shipment/generate', { orders: [meId] });
    if (!gen.ok) return json({ error: 'Falha ao gerar a etiqueta.', status: gen.status, detail: gen.data || gen.raw?.slice(0, 600) }, 502);

    // 4) imprimir (PDF público com etiqueta + declaração)
    const print = await me('/api/v2/me/shipment/print', { orders: [meId], mode: 'public' });
    const labelUrl = print.data?.url || null;

    // 5) rastreio
    let tracking = order.tracking_code || null;
    try {
      const r = await fetch(`${base}/api/v2/me/orders/${meId}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'Mr.Brant' } });
      const d = await r.json();
      tracking = d?.tracking || d?.self_tracking || tracking;
    } catch (_) {}

    await admin.from('orders').update({
      melhorenvio_id: String(meId), label_url: labelUrl, tracking_code: tracking, status: 'enviado',
    }).eq('id', order_id);

    return json({ ok: true, label_url: labelUrl, tracking_code: tracking, melhorenvio_id: meId });
  } catch (err) {
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});
