import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, getAuthAdmin, unauthorized, forbidden } from '@/lib/apiAuth';

const VALID_REASONS = [
  'no_llego', 'cobro_indebido', 'mal_comportamiento',
  'fraude', 'pago_no_realizado', 'maltrato', 'otro',
];
const VALID_ROLES = ['cliente', 'driver', 'tecnico'];
const VALID_REF_TYPES = ['order', 'job'];

// ─── POST /api/reports — create a report (authenticated user) ───────────────
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const {
    reporter_email,
    reporter_role,
    reported_email,
    reported_role,
    reference_type,
    reference_id,
    reason,
    comment,
  } = body as Record<string, string | null>;

  // Validate required fields
  if (
    !reporter_email || !reporter_role || !reported_email || !reported_role ||
    !reference_type || !reference_id || !reason
  ) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
  }

  // Security: reporter must match authenticated user
  if (reporter_email.toLowerCase() !== user.email) {
    return forbidden('El reportero no coincide con el usuario autenticado');
  }

  if (!VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(reporter_role) || !VALID_ROLES.includes(reported_role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
  }
  if (!VALID_REF_TYPES.includes(reference_type)) {
    return NextResponse.json({ error: 'Tipo de referencia inválido' }, { status: 400 });
  }
  if (reporter_email.toLowerCase() === reported_email.toLowerCase()) {
    return NextResponse.json({ error: 'No puedes reportarte a ti mismo' }, { status: 400 });
  }

  const { data, error } = await sbAdmin()
    .from('reports')
    .insert({
      reporter_email: reporter_email.toLowerCase(),
      reporter_role,
      reported_email: reported_email.toLowerCase(),
      reported_role,
      reference_type,
      reference_id,
      reason,
      comment: comment?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Unique constraint: already reported this reference
      return NextResponse.json({ error: 'Ya enviaste un reporte para este servicio/envío' }, { status: 409 });
    }
    console.error('[POST /api/reports]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

// ─── GET /api/reports — list reports (admin only) ──────────────────────────
export async function GET(req: NextRequest) {
  const admin = await getAuthAdmin(req);
  if (!admin) return forbidden();

  const { searchParams } = new URL(req.url);
  const status  = searchParams.get('status');  // filter by status
  const limit   = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset  = parseInt(searchParams.get('offset') || '0');

  let query = sbAdmin()
    .from('reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ['pending', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[GET /api/reports]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ reports: data, total: count });
}

// ─── PATCH /api/reports — update status (admin only) ──────────────────────
export async function PATCH(req: NextRequest) {
  const admin = await getAuthAdmin(req);
  if (!admin) return forbidden();

  const body = await req.json();
  const { id, status, admin_note } = body as { id: string; status: string; admin_note?: string };

  if (!id || !status) {
    return NextResponse.json({ error: 'Faltan campos: id, status' }, { status: 400 });
  }
  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const update: Record<string, unknown> = { status, admin_note: admin_note?.trim() || null };
  if (status === 'resolved' || status === 'dismissed') {
    update.resolved_at = new Date().toISOString();
  }

  const { error } = await sbAdmin().from('reports').update(update).eq('id', id);

  if (error) {
    console.error('[PATCH /api/reports]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
