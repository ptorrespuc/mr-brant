// ============================================================
// Mr.Brant — Edge Function: webhook-me (Melhor Envio)
// Recebe eventos de envio (postado/entregue) e atualiza o pedido +
// avisa o cliente por e-mail. (Chamado pelo Melhor Envio, sem auth.)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    // o formato do payload varia; tentamos várias formas
    const meId = String(body?.data?.id || body?.id || body?.order_id || body?.data?.order_id || '');
    const evt = String(body?.event || body?.type || body?.data?.status || body?.status || '').toLowerCase();
    const tracking = body?.data?.tracking || body?.tracking || null;
    if (!meId) return new Response('no id', { status: 200 });

    // postado → enviado ; entregue → entregue
    let newStatus: string | null = null;
    if (/deliver|entreg/.test(evt)) newStatus = 'entregue';
    else if (/post|enviad|shipped|in_?transit|transit/.test(evt)) newStatus = 'enviado';
    if (!newStatus) return new Response('ignored', { status: 200 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: order } = await admin.from('orders')
      .update({ status: newStatus, ...(tracking ? { tracking_code: tracking } : {}) })
      .eq('melhorenvio_id', meId)
      .select('*')
      .maybeSingle();
    if (!order) return new Response('order not found', { status: 200 });

    const { data: cfg } = await admin.from('settings').select('key, value').in('key', ['resend_from', 'site_url']);
    const s: Record<string, string> = {};
    (cfg || []).forEach((r: any) => { s[r.key] = r.value; });
    await sendStatusEmail(order, newStatus, s.resend_from, s.site_url);

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 200 }); // 200 evita reenvio infinito
  }
});

async function sendStatusEmail(order: any, status: string, from?: string, siteUrl?: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const sender = from || Deno.env.get('RESEND_FROM') || 'Mr.Brant <onboarding@resend.dev>';
  if (!key || !order.customer_email) return;
  const base = (siteUrl || '').replace(/\/$/, '');
  const link = base ? `${base}/?pedido=${order.token}` : '';
  const isDelivered = status === 'entregue';
  const title = isDelivered ? 'Seu pedido foi entregue! 🎉' : 'Seu pedido foi enviado! 📦';
  const body = isDelivered
    ? 'Seu pedido foi entregue. Esperamos que goste da sua peça! 🙏'
    : `Seu pedido foi postado e está a caminho.${order.tracking_code ? ` Código de rastreio: <strong>${order.tracking_code}</strong>.` : ''}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d160d;">
      <h2 style="color:#9c7322;">${title}</h2>
      <p>Olá ${order.customer_name || ''},</p>
      <p>${body}</p>
      <p><strong>Pedido:</strong> ${order.number}</p>
      ${link ? `<p><a href="${link}" style="display:inline-block;background:#9c7322;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;">Acompanhar meu pedido</a></p>` : ''}
      <p style="color:#6f6450;font-size:13px;">Mr.Brant — Artigos Religiosos</p>
    </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: order.customer_email, subject: `${isDelivered ? 'Entregue' : 'Enviado'} — Pedido ${order.number}`, html }),
    });
  } catch (_) {}
}
