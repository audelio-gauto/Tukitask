import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/** GET — check if the current authenticated user is suspended */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const db = sbAdmin();
    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(user.id);

    if (authErr || !authUser?.user) {
      return NextResponse.json({ suspended: false });
    }

    const meta = authUser.user.app_metadata || {};
    const bannedUntil = authUser.user.banned_until;
    const isBanned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

    if (!isBanned) {
      return NextResponse.json({ suspended: false });
    }

    return NextResponse.json({
      suspended: true,
      permanent: !!meta.blocked,
      reason: meta.suspension_reason || meta.block_reason || null,
      until: meta.suspended_until || null,
      banned_until: bannedUntil,
    });
  } catch {
    return NextResponse.json({ suspended: false });
  }
}
