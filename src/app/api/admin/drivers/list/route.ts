import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const { data, error } = await sbAdmin()
      .from('users')
      .select('id,email,role')
      .ilike('role', 'driver%')
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
