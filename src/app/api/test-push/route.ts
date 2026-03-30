/**
 * GET /api/test-push?email=xxx@xxx.com
 * Endpoint de prueba para verificar FCM.
 * SOLO para desarrollo — eliminar o proteger en producción.
 */
import { NextRequest, NextResponse } from 'next/server';
import { dispatchPush } from '@/lib/pushService';
import { sbAdmin } from '@/lib/apiAuth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Missing ?email= param' }, { status: 400 });
  }

  // 1. Check if user has registered push tokens
  const { data: tokens, error: tokensErr } = await sbAdmin()
    .from('push_tokens')
    .select('token, platform, created_at')
    .eq('user_email', email.toLowerCase());

  if (tokensErr) {
    return NextResponse.json({ error: tokensErr.message }, { status: 500 });
  }

  if (!tokens?.length) {
    return NextResponse.json({
      ok: false,
      diagnosis: 'No push tokens found for this email.',
      hint: 'The user must open the app and accept notification permission first.',
      email,
    });
  }

  // 2. Try sending a test push
  const sent = await dispatchPush(
    email,
    '🔔 Test Push',
    'Push notifications están funcionando correctamente.',
    'urgent',
    { url: '/', group_key: 'test-push' },
  );

  return NextResponse.json({
    ok: sent > 0,
    email,
    tokensFound: tokens.length,
    tokens: tokens.map(t => ({ platform: t.platform, created_at: t.created_at })),
    sent,
    diagnosis: sent > 0
      ? '✅ Push enviado exitosamente. Revisa el dispositivo.'
      : '⚠️ Tokens encontrados pero FCM no envió (verifica FIREBASE_SERVICE_ACCOUNT_JSON en env vars).',
  });
}
