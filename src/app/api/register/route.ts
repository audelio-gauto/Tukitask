import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';

/**
 * POST /api/register
 * Called after supabase.auth.signUp() to assign the correct role in the users table.
 * Role determination uses ADMIN_EMAIL (private, server-only env var — never NEXT_PUBLIC_*).
 * Rate limited to 5 registrations per IP per hour.
 */
export async function POST(req: Request) {
  // Rate limit: 5 registrations per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const allowed = await allowRequest(`rl:register:${ip}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();

    // ADMIN_EMAIL is a PRIVATE server-only env var (not NEXT_PUBLIC_*)
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const role = adminEmail && emailNormalized === adminEmail ? 'admin' : 'cliente';

    const sb = sbAdmin();
    const { error } = await sb
      .from('users')
      .upsert({ email: emailNormalized, role }, { onConflict: 'email' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
