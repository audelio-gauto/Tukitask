import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';

// GET /api/admin/documents?status=pending|all
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status'); // 'pending' | 'approved' | 'rejected' | null (all)

  let query = sbAdmin()
    .from('driver_documents')
    .select('id, driver_email, role, doc_type, file_path, status, rejection_reason, expires_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate a signed URL (10 min) for each document so the admin can preview
  const docs = await Promise.all(
    (data || []).map(async (doc: Record<string, unknown>) => {
      let signedUrl: string | null = null;
      try {
        const { data: signed } = await sbAdmin()
          .storage
          .from('driver-documents')
          .createSignedUrl(doc.file_path as string, 600); // 10 min
        signedUrl = signed?.signedUrl ?? null;
      } catch { /* skip if file missing */ }
      return { ...doc, signedUrl };
    })
  );

  return NextResponse.json({ docs });
}

// PATCH /api/admin/documents  { id, status, rejection_reason? }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json().catch(() => null);
  const { id, status, rejection_reason } = body || {};

  if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status,
    reviewed_by: admin.email,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status === 'rejected') update.rejection_reason = rejection_reason || '';
  if (status === 'approved') update.rejection_reason = null;

  const { error } = await sbAdmin()
    .from('driver_documents')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
