import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';

// GET — lista solicitudes de recarga de vendedores (admin)
// ?status=pending|approved|rejected|all  (default: pending)
// ?vendor_email=...  para ver billetera de un vendedor específico
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const vendorEmail = searchParams.get('vendor_email');

  const db = sbAdmin();

  if (vendorEmail) {
    const [walletRes, txRes, rechargesRes] = await Promise.all([
      db.from('vendor_wallets').select('balance, updated_at').eq('vendor_email', vendorEmail).maybeSingle(),
      db.from('vendor_wallet_transactions')
        .select('id, type, amount, market_order_id, note, created_at')
        .eq('vendor_email', vendorEmail)
        .order('created_at', { ascending: false })
        .limit(50),
      db.from('vendor_recharge_requests')
        .select('id, amount, status, receipt_url, created_at, rejection_note')
        .eq('vendor_email', vendorEmail)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    return NextResponse.json({
      balance: walletRes.data?.balance ?? 0,
      transactions: txRes.data ?? [],
      recharge_requests: rechargesRes.data ?? [],
    });
  }

  let query = db
    .from('vendor_recharge_requests')
    .select('id, vendor_email, amount, receipt_url, status, reviewed_by, reviewed_at, rejection_note, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

// POST — aprobar o rechazar solicitud de recarga
// body: { action: 'approve'|'reject', request_id, rejection_note? }
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const { action, request_id, rejection_note } = body;

  if (!request_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const db = sbAdmin();

  if (action === 'approve') {
    const { data, error } = await db.rpc('approve_vendor_recharge', {
      p_request_id: request_id,
      p_admin_email: admin.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.ok) return NextResponse.json({ error: data?.error || 'No se pudo aprobar' }, { status: 409 });

    if (data.vendor) {
      const amountFmt = new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(data.amount ?? 0);
      emitNotification(
        data.vendor,
        'wallet',
        '💰 Recarga aprobada',
        `Tu recarga de ${amountFmt} fue acreditada a tu billetera.`,
        { amount: data.amount },
        { priority: 'urgent', groupKey: `vendor_recharge_approved_${request_id}` },
      );
    }
    return NextResponse.json({ success: true, amount: data.amount, vendor: data.vendor });
  }

  // reject
  const { data, error } = await db.rpc('reject_vendor_recharge', {
    p_request_id: request_id,
    p_admin_email: admin.email,
    p_note: rejection_note || '',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: data?.error || 'No se pudo rechazar' }, { status: 409 });

  if (data.vendor) {
    emitNotification(
      data.vendor,
      'wallet',
      '❌ Recarga rechazada',
      rejection_note
        ? `Tu solicitud de recarga fue rechazada: ${rejection_note}`
        : 'Tu solicitud de recarga fue rechazada. Contactá al soporte.',
      {},
      { groupKey: `vendor_recharge_rejected_${request_id}` },
    );
  }
  return NextResponse.json({ success: true });
}

// PATCH — ajuste manual de saldo por admin
// body: { vendor_email, amount (positivo=crédito, negativo=débito), note }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { vendor_email?: string; amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { vendor_email, amount, note } = body;
  if (!vendor_email || amount == null || amount === 0) {
    return NextResponse.json({ error: 'vendor_email y amount requeridos' }, { status: 400 });
  }
  if (Math.abs(amount) > 100_000_000) {
    return NextResponse.json({ error: 'Monto fuera de rango' }, { status: 400 });
  }

  const db = sbAdmin();

  const { data: wallet } = await db
    .from('vendor_wallets')
    .select('balance')
    .eq('vendor_email', vendor_email)
    .maybeSingle();

  const currentBalance = wallet?.balance ?? 0;
  const newBalance = currentBalance + amount;

  const { error: upsertErr } = await db
    .from('vendor_wallets')
    .upsert({ vendor_email, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'vendor_email' });
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  const { error: txErr } = await db.from('vendor_wallet_transactions').insert({
    vendor_email,
    type: amount > 0 ? 'admin_credit' : 'admin_debit',
    amount,
    note: note ? `[Admin: ${admin.email}] ${note}` : `[Admin: ${admin.email}]`,
  });
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  return NextResponse.json({ success: true, balance: newBalance });
}
