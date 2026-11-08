import { serverError } from '@/lib/apiError';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, sbAdmin } from '@/lib/apiAuth';
import { canShowOrderChat } from '@/lib/orderChat';

// GET /api/chat/threads
// ?count=1  -> { total_unread }
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const countOnly = url.searchParams.get('count') === '1';

  let query = sbAdmin()
    .from('chat_threads')
    .select('unread_count, order_id, job_id, last_message_at')
    .eq('user_email', user.email);

  if (countOnly) {
    query = query.gt('unread_count', 0);
  }

  const { data, error } = await query;
  if (error) return serverError(error);

  const threads: Array<{ unread_count: number | null; order_id: string | null; job_id: string | null; last_message_at: string | null }> = data ?? [];
  const orderIds = [...new Set(threads.map(row => row.order_id).filter((id): id is string => !!id))];
  const visibleOrderIds = new Set<string>();
  if (orderIds.length) {
    const { data: orders, error: ordersError } = await sbAdmin()
      .from('orders')
      .select('id, status, client_email, accepted_by')
      .in('id', orderIds);
    if (ordersError) return serverError(ordersError);
    for (const order of orders ?? []) {
      if (canShowOrderChat(order, user.email)) {
        visibleOrderIds.add(order.id);
      }
    }
  }
  const visible = threads.filter(row => !row.order_id || visibleOrderIds.has(row.order_id));
  if (countOnly) {
    const total = visible.reduce((sum: number, r: { unread_count: number | null }) => sum + Number(r.unread_count ?? 0), 0);
    return NextResponse.json({ total_unread: total });
  }

  return NextResponse.json(visible);
}
