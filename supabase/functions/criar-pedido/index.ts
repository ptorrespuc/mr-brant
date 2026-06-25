// ============================================================
// Mr.Brant — Edge Function: criar-pedido
// Recalcula preços no servidor, grava o pedido e cria a cobrança
// no Mercado Pago. Retorna o número, o token e o link de pagamento.
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
    const { items, customer, shipping, origin, pay } = await req.json();

    if (!Array.isArray(items) || !items.length) return json({ error: 'Sem itens.' }, 400);
    if (!customer?.email) return json({ error: 'E-mail é obrigatório.' }, 400);
    const payMethod = pay === 'whatsapp' ? 'whatsapp' : 'mp';

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Recalcula preços a partir do banco (nunca confia no preço vindo do cliente)
    const sizeIds = items.map((i: any) => i.size_id);
    const { data: sizes, error: szErr } = await admin
      .from('product_sizes')
      .select('id, label, price_cents, product_id, products(name)')
      .in('id', sizeIds);
    if (szErr) throw szErr;

    const orderItems: any[] = [];
    let subtotal = 0;
    for (const it of items) {
      const sz = sizes?.find((s: any) => s.id === it.size_id);
      if (!sz) return json({ error: 'Tamanho inválido no pedido.' }, 400);
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const line = sz.price_cents * qty;
      subtotal += line;
      orderItems.push({
        product_id: sz.product_id,
        product_name: (sz as any).products?.name || 'Peça',
        size_label: sz.label,
        unit_price_cents: sz.price_cents,
        qty,
        line_total_cents: line,
      });
    }

    const shippingCents = Math.max(0, parseInt(shipping?.price_cents, 10) || 0);
    const total = subtotal + shippingCents;

    // upsert do cliente
    await admin.from('customers').upsert({
      email: customer.email, name: customer.name || null, phone: customer.phone || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    // grava o pedido
    const { data: order, error: ordErr } = await admin.from('orders').insert({
      status: 'pendente',
      customer_email: customer.email,
      customer_name: customer.name || null,
      customer_phone: customer.phone || null,
      ship_cep: shipping?.cep || null,
      ship_street: shipping?.street || null,
      ship_number: shipping?.number || null,
      ship_complement: shipping?.complement || null,
      ship_district: shipping?.district || null,
      ship_city: shipping?.city || null,
      ship_state: shipping?.state || null,
      shipping_method: shipping?.method || null,
      shipping_price_cents: shippingCents,
      subtotal_cents: subtotal,
      total_cents: total,
    }).select('id, number, token').single();
    if (ordErr) throw ordErr;

    await admin.from('order_items').insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })));

    // Finalização pelo WhatsApp: pedido já gravado, sem pagamento online
    if (payMethod === 'whatsapp') {
      await admin.from('orders').update({ payment_method: 'whatsapp' }).eq('id', order.id);
      const { data: fromCfg } = await admin.from('settings').select('value').eq('key', 'resend_from').maybeSingle();
      await sendOrderReceivedEmail({
        to: customer.email, name: customer.name, number: order.number,
        items: orderItems, shippingCents, total, shippingMethod: shipping?.method,
        from: fromCfg?.value,
      });
      return json({ number: order.number, token: order.token, pay: 'whatsapp' });
    }

    // cria a preferência no Mercado Pago
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) return json({ error: 'Mercado Pago não configurado.' }, 500);

    const site = (origin || Deno.env.get('SITE_URL') || '').replace(/\/$/, '');
    const mpItems = orderItems.map((oi) => ({
      title: `${oi.product_name}${oi.size_label ? ' — ' + oi.size_label : ''}`,
      quantity: oi.qty,
      unit_price: oi.unit_price_cents / 100,
      currency_id: 'BRL',
    }));
    if (shippingCents > 0) {
      mpItems.push({ title: `Frete${shipping?.method ? ' — ' + shipping.method : ''}`, quantity: 1, unit_price: shippingCents / 100, currency_id: 'BRL' });
    }

    const isHttps = site.startsWith('https://');
    const pref: Record<string, unknown> = {
      items: mpItems,
      payer: { email: customer.email, name: customer.name || undefined },
      external_reference: order.id,
      back_urls: {
        success: `${site}/?pedido=${order.token}`,
        pending: `${site}/?pedido=${order.token}`,
        failure: `${site}/?pedido=${order.token}`,
      },
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-mp`,
      metadata: { order_id: order.id },
    };
    // auto_return só em HTTPS (o MP rejeita com localhost)
    if (isHttps) pref.auto_return = 'approved';

    const prefResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    const prefData = await prefResp.json();
    if (!prefResp.ok) return json({ error: 'Falha no Mercado Pago.', detail: prefData }, 502);

    return json({
      number: order.number,
      token: order.token,
      init_point: prefData.init_point,
      sandbox_init_point: prefData.sandbox_init_point,
    });
  } catch (err) {
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});

// e-mail "pedido recebido" (combinaremos o pagamento pelo WhatsApp)
async function sendOrderReceivedEmail(o: any) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = o.from || Deno.env.get('RESEND_FROM') || 'Mr.Brant <onboarding@resend.dev>';
  if (!key || !o.to) return;
  const brl = (c: number) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
  const rows = (o.items || []).map((i: any) =>
    `<tr><td style="padding:6px 0;">${i.product_name}${i.size_label ? ' — ' + i.size_label : ''} (${i.qty}x)</td><td style="text-align:right;">${brl(i.line_total_cents)}</td></tr>`).join('');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d160d;">
      <h2 style="color:#9c7322;">Recebemos o seu pedido — Mr.Brant</h2>
      <p>Olá ${o.name || ''}, registramos o seu pedido <strong>${o.number}</strong>. 🙏</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0;">${rows}
        <tr><td style="padding-top:8px;">Frete${o.shippingMethod ? ' (' + o.shippingMethod + ')' : ''}</td><td style="text-align:right;padding-top:8px;">${brl(o.shippingCents)}</td></tr>
        <tr><td style="padding-top:8px;font-weight:bold;">Total</td><td style="text-align:right;padding-top:8px;font-weight:bold;">${brl(o.total)}</td></tr>
      </table>
      <p>Vamos combinar o pagamento e a entrega pelo WhatsApp. Até já!</p>
      <p style="color:#6f6450;font-size:13px;">Mr.Brant — Artigos Religiosos</p>
    </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: o.to, subject: `Pedido ${o.number} recebido — Mr.Brant`, html }),
    });
  } catch (_) { /* não bloqueia o pedido se o e-mail falhar */ }
}
