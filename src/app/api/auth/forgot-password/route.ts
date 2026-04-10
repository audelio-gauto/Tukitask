import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { allowRequest } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, redirectTo } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Correo requerido' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: 3 attempts per email per day (prevents abuse)
    const allowedByEmail = await allowRequest(
      `rl:forgot:email:${normalizedEmail}`,
      3,
      86400,
    );
    if (!allowedByEmail) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intentá mañana.' },
        { status: 429 },
      );
    }

    // Rate limit: 5 attempts per IP per hour
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const allowedByIp = await allowRequest(`rl:forgot:ip:${ip}`, 5, 3600);
    if (!allowedByIp) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Esperá unos minutos.' },
        { status: 429 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const destination =
      redirectTo ||
      `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo: destination },
    );

    // Log server-side only; never surface Supabase errors to client (prevents email enumeration)
    if (error) console.error('[forgot-password]', error.message);

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
