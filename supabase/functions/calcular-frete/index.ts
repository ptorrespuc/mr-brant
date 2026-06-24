// ============================================================
// Mr.Brant — Edge Function: calcular-frete (Melhor Envio)
// Recebe { from, to, products, sandbox } e retorna as opções de frete.
// O token fica no segredo MELHORENVIO_TOKEN (nunca exposto ao navegador).
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { from, to, products, sandbox } = await req.json();

    if (!from || !to || !Array.isArray(products) || products.length === 0) {
      return json({ error: 'Dados incompletos (from, to, products).' }, 400);
    }

    const token = Deno.env.get('MELHORENVIO_TOKEN');
    if (!token) return json({ error: 'Token do Melhor Envio não configurado.' }, 500);

    const base = sandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://www.melhorenvio.com.br';

    const resp = await fetch(`${base}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mr.Brant (contato@mrbrant.com.br)',
      },
      body: JSON.stringify({
        from: { postal_code: String(from).replace(/\D/g, '') },
        to: { postal_code: String(to).replace(/\D/g, '') },
        products,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return json({ error: 'Falha no Melhor Envio.', detail: data }, 502);
    }

    // mantém só os serviços válidos dos Correios e simplifica
    const options = (Array.isArray(data) ? data : [])
      .filter((s) => !s.error && s.price)
      .filter((s) => /correios/i.test(s.company?.name || ''))
      .map((s) => ({
        id: s.id,
        company: s.company?.name || '',
        service: s.name,
        price: Number(s.price),
        days: s.delivery_time,
      }))
      .sort((a, b) => a.price - b.price);

    return json({ options });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
