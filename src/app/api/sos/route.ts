import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, getAuthAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';
import { allowRequest } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST { order_id, lat?, lng? } → registra la alerta SOS del cliente o del driver del pedido
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!(await allowRequest(`rl:sos:${user.email}`, 5, 300))) {
    return NextResponse.json({ error: 'Alerta ya enviada, esperá unos minutos' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.order_id ?? '');
  if (!orderId) return NextResponse.json({ error: 'order_id requerido' }, { status: 400 });

  const db = sbAdmin();
  const { data: order } = await db.from('orders').select('id, client_email, accepted_by').eq('id', orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const isClient = order.client_email?.toLowerCase() === user.email;
  const isDriver = order.accepted_by?.toLowerCase() === user.email;
  if (!isClient && !isDriver) return forbidden('No autorizado');

  const lat = Number(body?.lat), lng = Number(body?.lng);
  const { data, error } = await db.from('sos_alerts').insert({
    order_id: orderId,
    user_email: user.email,
    user_role: isDriver ? 'driver' : 'cliente',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  }).select('id').single();
  if (error) return serverError(error);
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}

// GET (admin) → alertas, las abiertas primero
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return forbidden();
  const { data, error } = await sbAdmin()
    .from('sos_alerts')
    .select('*')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
}

// PATCH (admin) { id, admin_note? } → marca la alerta como resuelta
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return forbidden();
  const { id, admin_note } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const { error } = await sbAdmin().from('sos_alerts').update({
    status: 'resolved',
    admin_note: typeof admin_note === 'string' ? admin_note.slice(0, 500) : null,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
