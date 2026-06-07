import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';

type ReviewStatus = 'pending_review' | 'published' | 'rejected';

const VALID_STATUSES: ReviewStatus[] = ['pending_review', 'published', 'rejected'];

function isValidStatus(value: string): value is ReviewStatus {
  return VALID_STATUSES.includes(value as ReviewStatus);
}

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get('status') ?? 'pending_review').trim();

  if (!isValidStatus(status)) {
    return NextResponse.json({ error: 'status invalido' }, { status: 400 });
  }

  const db = sbAdmin();

  const [{ data, error }, pendingCount, publishedCount, rejectedCount] = await Promise.all([
    db
      .from('products')
      .select('id, vendor_email, name, sku, category, type, description, price, floor_price, stock, image, status, negotiable, rejection_reason, created_at')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('products').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    db.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('products').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    counts: {
      pending_review: pendingCount.count ?? 0,
      published: publishedCount.count ?? 0,
      rejected: rejectedCount.count ?? 0,
    },
  });
}

export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const id = String(body.id ?? '').trim();
  const action = String(body.action ?? '').trim();
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  const db = sbAdmin();

  if (action === 'approve') {
    const { error } = await db
      .from('products')
      .update({
        status: 'published',
        approved_by: admin.email,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reject') {
    const { error } = await db
      .from('products')
      .update({
        status: 'rejected',
        rejection_reason: reason || 'Rechazado por admin',
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'accion invalida' }, { status: 400 });
}