import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, sbAdmin } from '@/lib/apiAuth';

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (countOnly) {
    const total = (data ?? []).reduce((sum: number, r) => sum + Number(r.unread_count ?? 0), 0);
    return NextResponse.json({ total_unread: total });
  }

  return NextResponse.json(data ?? []);
}
