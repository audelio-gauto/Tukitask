/**
 * POST /api/promo/validate
 * Body: { code: string; order_amount: number; order_type?: 'envio' | 'tecnico' }
 * Returns: { discount_pct, discount_fixed, description, discount_amount }
 * Uses service-role to read promo_codes without RLS restrictions.
 */
import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { code?: string; order_amount?: number; order_type?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { code, order_amount = 0, order_type = 'all' } = body;
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const sb = sbAdmin();

  const { data: promo, error } = await sb
    .from('promo_codes')
    .select('id, code, description, discount_pct, discount_fixed, min_order_gs, max_uses, used_count, applicable_to, is_active, expires_at')
    .ilike('code', code.trim())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promo) return NextResponse.json({ error: 'Código no válido' }, { status: 404 });

  // Validity checks
  if (!promo.is_active) return NextResponse.json({ error: 'Código inactivo' }, { status: 400 });
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código expirado' }, { status: 400 });
  }
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return NextResponse.json({ error: 'Código agotado' }, { status: 400 });
  }
  if (promo.applicable_to !== 'all' && promo.applicable_to !== order_type) {
    return NextResponse.json({ error: `Código solo válido para ${promo.applicable_to}` }, { status: 400 });
  }
  if (order_amount < (promo.min_order_gs ?? 0)) {
    return NextResponse.json({
      error: `Monto mínimo: ${(promo.min_order_gs ?? 0).toLocaleString('es-PY')} Gs`,
    }, { status: 400 });
  }

  // Check if user already used this code
  const { data: existingUse } = await sb
    .from('promo_code_uses')
    .select('id')
    .eq('code_id', promo.id)
    .eq('user_email', user.email.toLowerCase())
    .maybeSingle();

  if (existingUse) return NextResponse.json({ error: 'Ya usaste este código' }, { status: 409 });

  // Calculate discount
  const pct_discount   = Math.round(order_amount * (promo.discount_pct ?? 0) / 100);
  const fixed_discount = promo.discount_fixed ?? 0;
  const discount_amount = Math.min(pct_discount + fixed_discount, order_amount);

  return NextResponse.json({
    valid:            true,
    code_id:          promo.id,
    description:      promo.description,
    discount_pct:     promo.discount_pct,
    discount_fixed:   promo.discount_fixed,
    discount_amount,
  });
}
