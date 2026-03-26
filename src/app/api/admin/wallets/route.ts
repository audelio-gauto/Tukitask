import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET — lista solicitudes de recarga (admin)
// ?status=pending|approved|rejected  (default: pending)
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const driverEmail = searchParams.get('driver_email');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;

  if (driverEmail) {
    // Vista de billetera de un driver específico: devolver saldo + transacciones
    const [walletRes, txRes, rechargesRes] = await Promise.all([
      db.from('driver_wallets').select('balance, updated_at').eq('driver_email', driverEmail).maybeSingle(),
      db.from('wallet_transactions')
        .select('id, type, amount, order_id, job_id, note, created_at')
        .eq('driver_email', driverEmail)
        .order('created_at', { ascending: false })
        .limit(50),
      db.from('recharge_requests')
        .select('id, amount, status, receipt_url, created_at, rejection_note')
        .eq('driver_email', driverEmail)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    return NextResponse.json({
      balance: walletRes.data?.balance ?? 0,
      transactions: txRes.data ?? [],
      recharge_requests: rechargesRes.data ?? [],
    });
  }

  const { data, error } = await db
    .from('recharge_requests')
    .select('id, driver_email, amount, receipt_url, status, reviewed_by, reviewed_at, rejection_note, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
    .eq('status', status);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — aprobar o rechazar una solicitud
// body: { action: 'approve'|'reject', request_id, rejection_note? }
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const { action, request_id, rejection_note } = body;

  if (!request_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;

  if (action === 'approve') {
    const { data, error } = await db.rpc('approve_recharge', {
      p_request_id: request_id,
      p_admin_email: admin.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.ok) return NextResponse.json({ error: data?.error || 'No se pudo aprobar' }, { status: 409 });
    return NextResponse.json({ success: true, amount: data.amount, driver: data.driver });
  }

  // reject
  const { data, error } = await db.rpc('reject_recharge', {
    p_request_id: request_id,
    p_admin_email: admin.email,
    p_note: rejection_note || '',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: data?.error || 'No se pudo rechazar' }, { status: 409 });
  return NextResponse.json({ success: true });
}
