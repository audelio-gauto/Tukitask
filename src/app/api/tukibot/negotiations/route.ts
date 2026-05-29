import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

const ACTIVE_STATUSES = ['countered', 'accepted_pending_payment'] as const;

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const role = url.searchParams.get('role') === 'vendor' ? 'vendor' : 'buyer';
  const status = url.searchParams.get('status');
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '20')));

  const db = sbAdmin();
  let query = db
    .from('tukibot_negotiations')
    .select('id, vendor_id, vendor_email, buyer_id, buyer_email, buyer_name, product_id, product_name, product_image, listed_price, floor_price, buyer_offer, counter_amount, final_amount, quantity, status, bot_message, timeout_action, timeout_at, expires_at, accepted_at, paid_at, market_order_id, created_at, updated_at, last_price_updated_at, meta')
    .order('updated_at', { ascending: false })
    .limit(limit);

  query = role === 'vendor'
    ? query.eq('vendor_id', user.id)
    : query.eq('buyer_id', user.id);

  if (status === 'all') {
    // no extra filter
  } else if (status && ACTIVE_STATUSES.includes(status as (typeof ACTIVE_STATUSES)[number])) {
    query = query.eq('status', status);
  } else {
    query = query.in('status', [...ACTIVE_STATUSES]);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
