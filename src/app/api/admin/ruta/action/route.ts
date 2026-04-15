import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['suspend', 'block', 'reactivate'] as const;
type Action = typeof VALID_ACTIONS[number];

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { user_id?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { user_id, action, reason } = body;

  if (!user_id || typeof user_id !== 'string' || user_id.length > 100) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }
  if (!action || !VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: `action debe ser: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }

  try {
    const db = sbAdmin();

    // Verify target user exists and is driver or tecnico (not admin)
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
      // Remove ban + clear suspended metadata
      await db.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
        app_metadata: { suspended: false, blocked: false, suspension_reason: null },
      });
      return NextResponse.json({ ok: true, action: 'reactivate', email: targetUser.email });
    }

    if (action === 'suspend') {
      // 30-day ban
      await db.auth.admin.updateUserById(user_id, {
        ban_duration: '720h',
        app_metadata: {
          suspended: true,
          blocked: false,
          suspension_reason: reason || 'Suspendido por administrador',
          suspended_by: admin.email,
          suspended_at: new Date().toISOString(),
        },
      });
      return NextResponse.json({ ok: true, action: 'suspend', email: targetUser.email });
    }

    if (action === 'block') {
      // Permanent ban (876000h = ~100 years)
      await db.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h',
        app_metadata: {
          suspended: false,
          blocked: true,
          block_reason: reason || 'Bloqueado por administrador',
          blocked_by: admin.email,
          blocked_at: new Date().toISOString(),
        },
      });
      return NextResponse.json({ ok: true, action: 'block', email: targetUser.email });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err) {
    console.error('[admin/ruta/action]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
