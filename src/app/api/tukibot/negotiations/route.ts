import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

const ACTIVE_STATUSES = ['countered', 'accepted_pending_payment'] as const;
type NegotiationMeta = {
  last_buyer_read_at?: string;
  last_vendor_read_at?: string;
};
type NegotiationLite = {
  id: string;
  meta?: NegotiationMeta | null;
} & Record<string, unknown>;
type MessageCountRow = {
  negotiation_id: string;
  sender_role: 'buyer' | 'vendor' | 'system';
  created_at: string;
};

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const role = url.searchParams.get('role') === 'vendor' ? 'vendor' : 'buyer';
  const status = url.searchParams.get('status');
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '20')));

  const db = sbAdmin();
  const nowIso = new Date().toISOString();

  // Lazy cleanup: delete expired negotiations for this user before returning results
  const expiredQuery = db
    .from('tukibot_negotiations')
    .delete()
    .lt('expires_at', nowIso);
  if (role === 'vendor') {
    await expiredQuery.eq('vendor_id', user.id);
  } else {
    await expiredQuery.eq('buyer_id', user.id);
  }

  let query = db
    .from('tukibot_negotiations')
    .select('id, vendor_id, vendor_email, buyer_id, buyer_email, buyer_name, product_id, product_name, product_image, listed_price, floor_price, buyer_offer, counter_amount, final_amount, quantity, status, bot_message, timeout_action, timeout_at, expires_at, accepted_at, paid_at, market_order_id, created_at, updated_at, last_price_updated_at, meta')
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
    .limit(limit);

  query = role === 'vendor'
    ? query.eq('vendor_id', user.id)
    : query.eq('buyer_id', user.id);

  if (status === 'all') {
    // no extra filter — but only active statuses
    query = query.in('status', [...ACTIVE_STATUSES]);
  } else if (status && ACTIVE_STATUSES.includes(status as (typeof ACTIVE_STATUSES)[number])) {
    query = query.eq('status', status);
  } else {
    query = query.in('status', [...ACTIVE_STATUSES]);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: NegotiationLite[] = (data ?? []) as NegotiationLite[];

  // Attach unread message_count to each negotiation (per current role)
  if (rows.length > 0) {
    const ids = rows.map((n: NegotiationLite) => n.id);
    const { data: msgRows } = await db
      .from('tukibot_negotiation_messages')
      .select('negotiation_id, sender_role, created_at')
      .in('negotiation_id', ids);

    const myRole: 'buyer' | 'vendor' = role;
    const unreadByNegotiation: Record<string, number> = {};
    const lastReadByNegotiation: Record<string, number> = {};

    for (const negotiation of rows) {
      const meta = (negotiation.meta ?? {}) as NegotiationMeta;
      const rawRead = myRole === 'vendor' ? meta.last_vendor_read_at : meta.last_buyer_read_at;
      const lastReadTs = rawRead ? new Date(rawRead).getTime() : 0;
      lastReadByNegotiation[negotiation.id] = Number.isFinite(lastReadTs) ? lastReadTs : 0;
      unreadByNegotiation[negotiation.id] = 0;
    }

    const countMap: Record<string, number> = {};
    if (msgRows) {
      for (const r of msgRows as MessageCountRow[]) {
        countMap[r.negotiation_id] = (countMap[r.negotiation_id] ?? 0) + 1;
        if (r.sender_role === myRole || r.sender_role === 'system') continue;
        const msgTs = new Date(r.created_at).getTime();
        const lastReadTs = lastReadByNegotiation[r.negotiation_id] ?? 0;
        if (msgTs > lastReadTs) {
          unreadByNegotiation[r.negotiation_id] = (unreadByNegotiation[r.negotiation_id] ?? 0) + 1;
        }
      }
    }
    const items = rows.map((n: NegotiationLite) => ({
      ...n,
      total_message_count: countMap[n.id] ?? 0,
      message_count: unreadByNegotiation[n.id] ?? 0,
    }));
    return NextResponse.json({ items });
  }

  return NextResponse.json({ items: [] });
}
