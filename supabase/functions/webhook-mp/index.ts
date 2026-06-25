// ============================================================
// Mr.Brant — Edge Function: webhook-mp
// Recebe a notificação do Mercado Pago, confirma o pagamento e
// atualiza o status do pedido. Envia e-mail de confirmação (Resend).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    let topic = url.searchParams.get('type') || url.searchParams.get('topic');

    // o MP também manda no corpo
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        paymentId = body?.data?.id || paymentId;
        topic = body?.type || topic;
      } catch (_) { /* corpo vazio */ }
    }

    if (topic && topic !== 'payment') return new Response('ignored', { status: 200 });
    if (!paymentId) return new Response('no id', { status: 200 });

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpToken}` },
    });
    const pay = await payResp.json();
    if (!payResp.ok) return new Response('payment fetch failed', { status: 200 });

    const orderId = pay.external_reference || pay.metadata?.order_id;
    if (!orderId) return new Response('no order ref', { status: 200 });

    const statusMap: Record<string, string> = {
      approved: 'pago', pending: 'pendente', in_process: 'pendente',
      rejected: 'cancelado', cancelled: 'cancelado', refunded: 'cancelado',
    };
    const newStatus = statusMap[pay.status] || 'pendente';

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: order } = await admin.from('orders')
      .update({ status: newStatus, payment_id: String(paymentId), payment_method: pay.payment_method_id || null })
      .eq('id', orderId)
      .select('*, order_items(*)')
      .single();

    // e-mail de confirmação só quando aprovado
    if (order && newStatus === 'pago') {
      const { data: fromCfg } = await admin.from('settings').select('value').eq('key', 'resend_from').maybeSingle();
      await sendEmail(order, fromCfg?.value);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 200 }); // 200 evita reenvio infinito do MP
  }
});

async function sendEmail(order: any, fromCfg?: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = fromCfg || Deno.env.get('RESEND_FROM') || 'Mr.Brant <onboarding@resend.dev>';
  if (!key) return;

  const brl = (c: number) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
  const rows = (order.order_items || []).map((i: any) =>
    `<tr><td style="padding:6px 0;">${i.product_name}${i.size_label ? ' — ' + i.size_label : ''} (${i.qty}x)</td><td style="text-align:right;">${brl(i.line_total_cents)}</td></tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d160d;">
      <h2 style="color:#9c7322;">Pedido confirmado — Mr.Brant</h2>
      <p>Olá ${order.customer_name || ''}, recebemos o seu pagamento! 🙏</p>
      <p><strong>Número do pedido:</strong> ${order.number}</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0;">${rows}
        <tr><td style="padding-top:8px;">Frete${order.shipping_method ? ' (' + order.shipping_method + ')' : ''}</td><td style="text-align:right;padding-top:8px;">${brl(order.shipping_price_cents)}</td></tr>
        <tr><td style="padding-top:8px;font-weight:bold;">Total</td><td style="text-align:right;padding-top:8px;font-weight:bold;">${brl(order.total_cents)}</td></tr>
      </table>
      <p>Já estamos preparando a sua peça. Em breve enviamos o código de rastreio.</p>
      <p style="color:#6f6450;font-size:13px;">Mr.Brant — Artigos Religiosos</p>
    </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: order.customer_email, subject: `Pedido ${order.number} confirmado — Mr.Brant`, html }),
  });
}
