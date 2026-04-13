/**
 * /api/admin/promos — admin management of promo codes
 * GET    – list all promo codes (admin only)
 * POST   – create a new promo code
 * PATCH  – update is_active
 */
import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

async function assertAdmin(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const { data } = await sbAdmin().from('users').select('role').eq('email', user.email.toLowerCase()).maybeSingle();
  if (data?.role !== 'admin') return null;
  return user;
}

export async function GET(req: Request) {
  const user = await assertAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await sbAdmin()
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const user = await assertAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { code, description, discount_pct, discount_fixed, min_order_gs, max_uses, applicable_to, expires_at } = body;
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const { data, error } = await sbAdmin().from('promo_codes').insert({
    code: String(code).toUpperCase(),
    description: description ?? null,
    discount_pct: Number(discount_pct ?? 0),
    discount_fixed: Number(discount_fixed ?? 0),
    min_order_gs: Number(min_order_gs ?? 0),
    max_uses: max_uses != null ? Number(max_uses) : null,
    applicable_to: String(applicable_to ?? 'all'),
    expires_at: expires_at ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await assertAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { id?: string; is_active?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await sbAdmin().from('promo_codes').update({ is_active: body.is_active }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
