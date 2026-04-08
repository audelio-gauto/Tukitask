import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';

const PAGE_SIZE = 30;

// GET /api/admin/documents?status=pending|all&page=0&id=<uuid>
// - If `id` is provided: return a single doc with a fresh signed URL (lazy preview)
// - Otherwise: paginated list WITHOUT signed URLs
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
  const docId = url.searchParams.get('id');

  // Lazy signed URL — requested when admin clicks "Ver"
  if (docId) {
    const { data: doc, error } = await sbAdmin()
      .from('driver_documents')
      .select('file_path')
      .eq('id', docId)
      .single();
    if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: signed } = await sbAdmin()
      .storage.from('driver-documents')
      .createSignedUrl(doc.file_path as string, 600);
    return NextResponse.json({ signedUrl: signed?.signedUrl ?? null });
  }

  // Paginated list — no signed URLs generated here
  let query = sbAdmin()
    .from('driver_documents')
    .select('id, driver_email, role, doc_type, file_path, status, rejection_reason, expires_at, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    docs: data || [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > (page + 1) * PAGE_SIZE,
  });
}

// PATCH /api/admin/documents  { id, status, rejection_reason?, previous_status }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json().catch(() => null);
  const { id, status, rejection_reason, previous_status } = body || {};

  if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // Validate rejection_reason length
  if (rejection_reason && typeof rejection_reason === 'string' && rejection_reason.length > 500) {
    return NextResponse.json({ error: 'Motivo demasiado largo (máx 500 caracteres)' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status,
    reviewed_by: admin.email,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status === 'rejected') update.rejection_reason = (rejection_reason || '').trim().slice(0, 500);
  if (status === 'approved') update.rejection_reason = null;

  // Optimistic lock: only update if status hasn't changed since the client last fetched
  let query = sbAdmin()
    .from('driver_documents')
    .update(update)
    .eq('id', id);

  if (previous_status) {
    query = query.eq('status', previous_status);
  }

  const { data: updated, error } = await query.select('id, status, driver_email, doc_type').single();

  if (error) {
    // If no row was updated (status changed by another admin), return 409
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'El documento ya fue modificado por otro admin. Actualizá la lista.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // H6: Notify driver/tecnico of the decision (fire-and-forget, non-blocking)
  if (updated && (status === 'approved' || status === 'rejected')) {
    notifyDocDecision(updated.driver_email, updated.doc_type, status, rejection_reason).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

/** Send in-app notification to driver/tecnico when their document is reviewed */
async function notifyDocDecision(email: string, docType: string, status: 'approved' | 'rejected', reason?: string) {
  const docLabel = docType.replace(/_/g, ' ');
  const message = status === 'approved'
    ? `Tu documento "${docLabel}" fue aprobado ✅`
    : `Tu documento "${docLabel}" fue rechazado ❌${reason ? `: ${reason}` : ''}`;

  // Store notification in DB for in-app display
  await sbAdmin()
    .from('notifications')
    .insert({
      user_email: email,
      type: `doc_${status}`,
      message,
      read: false,
      created_at: new Date().toISOString(),
    })
    .single()
    .catch(() => {}); // table may not exist yet — non-fatal
}

