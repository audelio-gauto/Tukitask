import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const DURATION_MAP: Record<string, string> = {
  '1d':        '24h',
  '1m':        '720h',
  '1y':        '8760h',
  'permanent': '876000h',
};

const DURATION_LABELS: Record<string, string> = {
  '1d':        '1 día',
  '1m':        '1 mes',
  '1y':        '1 año',
  'permanent': 'Permanente',
};

/** POST — suspend or reactivate a user */
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { user_id?: string; action?: string; duration?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { user_id, action, duration, reason } = body;

  if (!user_id || typeof user_id !== 'string' || user_id.length > 100) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }
  if (!action || !['suspend', 'reactivate'].includes(action)) {
    return NextResponse.json({ error: 'action debe ser: suspend | reactivate' }, { status: 400 });
  }

  try {
    const db = sbAdmin();

    const { data: targetUser, error: userErr } = await db
      .from('users')
      .select('id, email, role')
      .eq('id', user_id)
      .maybeSingle();

    if (userErr || !targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    if (['admin', 'super_admin', 'owner'].includes(targetUser.role)) {
      return NextResponse.json({ error: 'No se puede suspender un administrador' }, { status: 403 });
    }

    if (action === 'reactivate') {
      await db.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
        app_metadata: {
          suspended: false,
          blocked: false,
          suspension_reason: null,
          suspension_duration: null,
          suspended_by: null,
          suspended_at: null,
          suspended_until: null,
        },
      });
      return NextResponse.json({ ok: true, action: 'reactivate', email: targetUser.email });
    }

    // action === 'suspend'
    if (!duration || !DURATION_MAP[duration]) {
      return NextResponse.json({ error: `duration debe ser: ${Object.keys(DURATION_MAP).join(', ')}` }, { status: 400 });
    }

    const now = new Date();
    let suspendedUntil: string | null = null;
    if (duration !== 'permanent') {
      const hours = parseInt(DURATION_MAP[duration]);
      suspendedUntil = new Date(now.getTime() + hours * 3600_000).toISOString();
    }

    await db.auth.admin.updateUserById(user_id, {
      ban_duration: DURATION_MAP[duration],
      app_metadata: {
        suspended: duration !== 'permanent',
        blocked: duration === 'permanent',
        suspension_reason: reason || 'Suspendido por administrador',
        suspension_duration: duration,
        suspension_label: DURATION_LABELS[duration],
        suspended_by: admin.email,
        suspended_at: now.toISOString(),
        suspended_until: suspendedUntil,
      },
    });

    return NextResponse.json({
      ok: true,
      action: 'suspend',
      duration,
      label: DURATION_LABELS[duration],
      email: targetUser.email,
      suspended_until: suspendedUntil,
    });
  } catch (err) {
    console.error('[admin/suspend]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** GET — check suspension status for a user */
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }

  try {
    const db = sbAdmin();

    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const meta = authUser.user.app_metadata || {};
    const banned = !!authUser.user.banned_until &&
      new Date(authUser.user.banned_until).getTime() > Date.now();

    return NextResponse.json({
      user_id: userId,
      email: authUser.user.email,
      is_suspended: !!(meta.suspended && banned),
      is_blocked: !!(meta.blocked && banned),
      is_active: !banned,
      suspension_reason: meta.suspension_reason || meta.block_reason || null,
      suspension_duration: meta.suspension_duration || null,
      suspension_label: meta.suspension_label || null,
      suspended_by: meta.suspended_by || meta.blocked_by || null,
      suspended_at: meta.suspended_at || meta.blocked_at || null,
      suspended_until: meta.suspended_until || (meta.blocked ? null : null),
      banned_until: authUser.user.banned_until || null,
    });
  } catch (err) {
    console.error('[admin/suspend GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
