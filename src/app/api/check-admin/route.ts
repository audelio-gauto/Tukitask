import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export async function POST(req: Request) {
  try {
    // Require a valid session — prevents anonymous role enumeration
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ admin: false }, { status: 401 });

    const db = sbAdmin();
    const { data, error } = await db
      .from('users')
      .select('role')
      .ilike('email', user.email)
      .maybeSingle();
    if (error) return NextResponse.json({ admin: false }, { status: 200 });
    return NextResponse.json({ admin: data?.role === 'admin' });
  } catch {
    return NextResponse.json({ admin: false }, { status: 500 });
  }
}
