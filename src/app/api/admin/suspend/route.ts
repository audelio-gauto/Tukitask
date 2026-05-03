import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/** Find auth.users id by email (uses GoTrue admin API) */
async function getAuthUidByEmail(db: ReturnType<typeof sbAdmin>, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users?.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = data.users.find((u: any) => u.email?.toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 100) break;
    page++;
  }
  return null;
}

/** POST — suspend or reactivate a user
 *  body: { user_id, action: 'suspend'|'reactivate', days?: number, reason?: string }
 *  days = 0 means permanent
 */
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { user_id?: string; action?: string; days?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { user_id, action, reason } = body;
  const days = typeof body.days === 'number' ? body.days : -1;

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

    // Resolve auth.users id (may differ from users.id)
    const authUid = await getAuthUidByEmail(db, targetUser.email);
    if (!authUid) {
      return NextResponse.json({ error: 'Usuario no encontrado en auth' }, { status: 404 });
    }

    if (action === 'reactivate') {
      const { error: updateErr } = await db.auth.admin.updateUserById(authUid, {
        ban_duration: 'none',
        app_metadata: {
          suspended: false,
          blocked: false,
          suspension_reason: null,
          suspension_days: null,
          suspended_by: null,
          suspended_at: null,
          suspended_until: null,
        },
      });
      if (updateErr) {
        console.error('[admin/suspend] reactivate error:', updateErr);
        return NextResponse.json({ error: 'Error al reactivar: ' + updateErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'reactivate', email: targetUser.email });
    }

    // action === 'suspend'
    if (days < 0) {
      return NextResponse.json({ error: 'days requerido (0 = permanente, >0 = días)' }, { status: 400 });
    }

    const permanent = days === 0;
    const banHours = permanent ? '876000h' : `${days * 24}h`;
    const now = new Date();
    const suspendedUntil = permanent ? null : new Date(now.getTime() + days * 24 * 3600_000).toISOString();
    const label = permanent ? 'Permanente' : `${days} día${days !== 1 ? 's' : ''}`;

    const { error: updateErr } = await db.auth.admin.updateUserById(authUid, {
      ban_duration: banHours,
      app_metadata: {
        suspended: !permanent,
        blocked: permanent,
        suspension_reason: reason || 'Suspendido por administrador',
        suspension_days: days,
        suspended_by: admin.email,
        suspended_at: now.toISOString(),
        suspended_until: suspendedUntil,
      },
    });

    if (updateErr) {
      console.error('[admin/suspend] suspend error:', updateErr);
      return NextResponse.json({ error: 'Error al suspender: ' + updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      action: 'suspend',
      days,
      label,
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
  const history = searchParams.get('history') === '1';

  if (!userId) {
    return NextResponse.json({ error: 'user_id requerido' }, { status: 400 });
  }

  try {
    const db = sbAdmin();

    // History mode: return audit log entries
    if (history) {
      const { data: entries } = await db
        .from('admin_audit_log')
        .select('action, metadata, admin_email, created_at')
        .eq('target_id', userId)
        .in('action', ['suspend', 'reactivate'])
        .order('created_at', { ascending: false })
        .limit(50);

      return NextResponse.json({
        history: (entries || []).map((e: any) => ({
          action: e.action,
          reason: e.metadata?.reason ?? null,
          days: e.metadata?.days ?? null,
          admin_email: e.admin_email,
          created_at: e.created_at,
        })),
      });
    }

    // Look up user email from users table, then find auth user by email
    const { data: targetUser } = await db
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const authUid = await getAuthUidByEmail(db, targetUser.email);
    if (!authUid) {
      return NextResponse.json({ error: 'Usuario no encontrado en auth' }, { status: 404 });
    }

    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(authUid);
    if (authErr || !authUser?.user) {
      return NextResponse.json({ error: 'Error auth' }, { status: 404 });
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
      suspension_reason: meta.suspension_reason || null,
      suspension_days: meta.suspension_days ?? null,
      suspended_by: meta.suspended_by || null,
      suspended_at: meta.suspended_at || null,
      suspended_until: meta.suspended_until || null,
      banned_until: authUser.user.banned_until || null,
    });
  } catch (err) {
    console.error('[admin/suspend GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
