// ============================================================
// Mr.Brant — Edge Function: validar-cupom
// Recebe { code, subtotal_cents } e devolve o desconto válido.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Avalia um cupom e retorna o desconto em centavos (0 se inválido).
export async function evalCoupon(admin: any, code: string, subtotal: number) {
  const c = (code || '').trim().toUpperCase();
  if (!c) return { valid: false, message: 'Informe um código.', discount: 0 };
  const { data: coupon } = await admin.from('coupons').select('*').eq('code', c).maybeSingle();
  if (!coupon || !coupon.active) return { valid: false, message: 'Cupom inválido.', discount: 0 };

  const today = new Date().toISOString().slice(0, 10);
  if (coupon.valid_from && today < coupon.valid_from) return { valid: false, message: 'Cupom ainda não está válido.', discount: 0 };
  if (coupon.valid_until && today > coupon.valid_until) return { valid: false, message: 'Cupom expirado.', discount: 0 };

  let discount = coupon.type === 'percent'
    ? Math.round((subtotal * coupon.value) / 100)
    : coupon.value;
  discount = Math.max(0, Math.min(discount, subtotal)); // nunca maior que o subtotal
  return { valid: true, code: c, type: coupon.type, value: coupon.value, discount, message: 'Cupom aplicado!' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { code, subtotal_cents } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const res = await evalCoupon(admin, code, Math.max(0, parseInt(subtotal_cents, 10) || 0));
    return json(res);
  } catch (err) {
    return json({ valid: false, message: String((err as any)?.message || err), discount: 0 }, 500);
  }
});
