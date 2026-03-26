import { NextResponse } from 'next/server';
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// Admin-only debug endpoint — solo expone datos no sensibles
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  return NextResponse.json({
    ok: true,
    env: process.env.NODE_ENV,
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    has_mapbox: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });
}
