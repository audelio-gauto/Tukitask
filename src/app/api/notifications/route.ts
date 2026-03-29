import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/apiAuth';
import { sbAdmin } from '@/lib/apiAuth';

/**
 * GET /api/notifications — list user's notifications (newest first)
 * Query params:
 *   ?unread=true  — only unread
 *   ?limit=20     — max results (default 20, max 100)
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);

  let query = sbAdmin()
    .from('notifications')
    .select('*')
    .eq('user_email', user.email)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

/**
 * PATCH /api/notifications — mark notifications as read
 * Body:
 *   { ids: string[] }    — mark specific notifications read
 *   { all: true }        — mark all as read
 */
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();

  if (body.all === true) {
    const { error } = await sbAdmin()
      .from('notifications')
      .update({ read: true })
      .eq('user_email', user.email)
      .eq('read', false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    // Sanitize: only mark notifications belonging to this user
    const { error } = await sbAdmin()
      .from('notifications')
      .update({ read: true })
      .eq('user_email', user.email)
      .in('id', body.ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Provide ids[] or all:true' }, { status: 400 });
}
