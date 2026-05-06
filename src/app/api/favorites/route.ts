/**
 * /api/favorites
 * GET  – list favourite drivers for the authenticated client
 * POST – { driver_email } → add favourite
 * DELETE – { driver_email } → remove favourite
 */
import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sbAdmin()
    .from('driver_favorites')
    .select('driver_email, created_at')
    .eq('client_email', user.email.toLowerCase())
    .order('created_at', { ascending: false });

  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { driver_email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { driver_email } = body;
  if (!driver_email) return NextResponse.json({ error: 'driver_email required' }, { status: 400 });

  const { error } = await sbAdmin().from('driver_favorites').upsert({
    client_email: user.email.toLowerCase(),
    driver_email: driver_email.toLowerCase(),
  }, { onConflict: 'client_email,driver_email' });

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { driver_email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { driver_email } = body;
  if (!driver_email) return NextResponse.json({ error: 'driver_email required' }, { status: 400 });

  const { error } = await sbAdmin()
    .from('driver_favorites')
    .delete()
    .eq('client_email', user.email.toLowerCase())
    .eq('driver_email', driver_email.toLowerCase());

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
