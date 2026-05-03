import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET /api/admin/users/search?q=&roles=driver,tecnico
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 80);
  const roles = (searchParams.get('roles') || 'driver,tecnico').split(',').map(r => r.trim()).filter(Boolean);

  if (q.length < 2) return NextResponse.json([]);

  const db = sbAdmin() as any;

  // Search by email in users table
  const { data: byEmail } = await db
    .from('users')
    .select('id, email, role')
    .ilike('email', `%${q}%`)
    .in('role', roles)
    .limit(10);

  // Search by first_name / last_name in driver_profiles
  const { data: byName } = await db
    .from('driver_profiles')
    .select('email, first_name, last_name')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(10);

  // Merge: build a map of email → display info
  const map = new Map<string, { email: string; name: string; role: string }>();

  (byEmail || []).forEach((u: any) => {
    if (!map.has(u.email)) {
      map.set(u.email, { email: u.email, name: '', role: u.role });
    }
  });

  // Enrich names from driver_profiles
  (byName || []).forEach((p: any) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
    if (map.has(p.email)) {
      map.get(p.email)!.name = name;
    } else {
      // name matched but may not have matched by email — still include if role matches
      map.set(p.email, { email: p.email, name, role: 'driver' });
    }
  });

  return NextResponse.json(Array.from(map.values()).slice(0, 12));
}
