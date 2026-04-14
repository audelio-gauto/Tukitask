import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// PATCH /api/admin/drivers/verify
// body: { email: string, action: 'verify' | 'reject' }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const { email, action } = await req.json();
    if (!email || !['verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const isVerified = action === 'verify';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sbAdmin() as any)
      .from('driver_profiles')
      .upsert({
        email,
        verified: isVerified,
        verification_status: isVerified ? 'verified' : 'rejected',
        verified_at: isVerified ? new Date().toISOString() : null,
      }, { onConflict: 'email' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
