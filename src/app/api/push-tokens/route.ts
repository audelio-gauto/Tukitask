import { serverError } from '@/lib/apiError';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, sbAdmin } from '@/lib/apiAuth';

/**
 * POST /api/push-tokens — register a push token for the authenticated user.
 * Body: { token: string, platform: 'web' | 'android' | 'ios' }
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { token, platform } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }
  if (!['web', 'android', 'ios'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be web, android, or ios' }, { status: 400 });
  }

  const { error } = await sbAdmin()
    .from('push_tokens')
    .upsert(
      { user_email: user.email, token, platform },
      { onConflict: 'user_email,token' },
    );

  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/push-tokens — remove a push token (e.g., on logout).
 * Body: { token: string }
 */
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { token } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const { error } = await sbAdmin()
    .from('push_tokens')
    .delete()
    .eq('user_email', user.email)
    .eq('token', token);

  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
