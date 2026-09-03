import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

// GET /api/tienda/market-orders — vendor or buyer lists their own orders
// ?role=vendor (default) — filter by vendor_email
// ?role=buyer            — filter by client_email
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const role   = searchParams.get('role') ?? 'vendor';
  const limit  = Math.min(100, Number(searchParams.get('limit') || '50'));

  const db = sbAdmin();
  let data, error;

  if (role === 'buyer') {
    let q = db
      .from('market_orders')
      .select('id, items, total, status, address, payment_method, created_at, updated_at, vendor_email')
      .eq('client_email', user.email)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status && status !== 'all') q = q.eq('status', status);
    ({ data, error } = await q);
  } else {
    let q = db
      .from('market_orders')
      .select('id, client_name, client_email, items, total, status, address, negotiated, payment_method, payment_proof_url, created_at, updated_at')
      .eq('vendor_email', user.email)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status && status !== 'all') q = q.eq('status', status);
    ({ data, error } = await q);
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [] });
}
