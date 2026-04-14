import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sbAdmin() as any)
      .from('users')
      .select('id, email, role, created_at', { count: 'exact' })
      .in('role', ['servicio', 'tecnico'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) query = query.ilike('email', `%${search}%`);

    const { data: users, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with tecnico_settings
    const emails = (users || []).map((u: any) => u.email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsMap = new Map<string, any>();
    if (emails.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: settings } = await (sbAdmin() as any)
        .from('tecnico_settings')
        .select('email, first_name, last_name, profile_photo, subscription_active, subscription_plan, subscription_expires_at, is_verified, verified_at')
        .in('email', emails);
      (settings || []).forEach((s: any) => settingsMap.set(s.email, s));
    }

    const data = (users || []).map((u: any) => ({ ...u, ...(settingsMap.get(u.email) ?? {}) }));
    return NextResponse.json({ data, total: count ?? 0, page, limit });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PATCH — verify or reject a tecnico
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
      .from('tecnico_settings')
      .upsert({
        email,
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
