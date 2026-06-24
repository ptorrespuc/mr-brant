// ============================================================
// Mr.Brant — Edge Function: consultar-pedido
// Retorna um pedido pelo token (link de acompanhamento) ou por
// e-mail + número. Não expõe a tabela ao navegador.
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
    const { token, email, number } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let q = admin.from('orders').select('number, status, customer_name, shipping_method, shipping_price_cents, subtotal_cents, total_cents, tracking_code, created_at, ship_city, ship_state, order_items(product_name, size_label, qty, line_total_cents)');

    if (token) q = q.eq('token', token);
    else if (email && number) q = q.eq('customer_email', email).eq('number', number);
    else return json({ error: 'Informe o link de acompanhamento ou e-mail + número do pedido.' }, 400);

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Pedido não encontrado.' }, 404);

    return json({ order: data });
  } catch (err) {
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});
