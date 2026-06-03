import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

// GET /api/tienda/market-orders — vendor lists their own orders
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // optional filter
  const limit = Math.min(100, Number(searchParams.get('limit') || '50'));

  const db = sbAdmin();
  let query = db
    .from('market_orders')
    .select('id, client_name, client_email, items, total, status, address, negotiated, payment_method, created_at, updated_at')
    .eq('vendor_email', user.email)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [] });
}
