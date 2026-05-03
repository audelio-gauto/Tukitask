import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';

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

    // Notify the driver/tecnico that their recharge was approved
    if (data.driver) {
      const amountFmt = new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(data.amount ?? 0);
      emitNotification(
        data.driver,
        'wallet',
        '💰 Recarga aprobada',
        `Tu recarga de ${amountFmt} fue acreditada a tu billetera.`,
        { amount: data.amount },
        { priority: 'urgent', groupKey: `recharge_approved_${request_id}` },
      );
    }

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

  // Notify driver/tecnico that their recharge was rejected
  if (data.driver) {
    emitNotification(
      data.driver,
      'wallet',
      '❌ Recarga rechazada',
      rejection_note
        ? `Tu solicitud de recarga fue rechazada: ${rejection_note}`
        : 'Tu solicitud de recarga fue rechazada. Contactá al soporte para más detalles.',
      {},
      { groupKey: `recharge_rejected_${request_id}` },
    );
  }

  return NextResponse.json({ success: true });
}

// PATCH — manual wallet adjustment by admin
// body: { driver_email, amount (positive=credit, negative=debit), note }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { driver_email?: string; amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { driver_email, amount, note } = body;
  if (!driver_email || amount == null || amount === 0) {
    return NextResponse.json({ error: 'driver_email y amount requeridos' }, { status: 400 });
  }
  if (Math.abs(amount) > 100_000_000) {
    return NextResponse.json({ error: 'Monto fuera de rango' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;

  try {
    // Upsert wallet + insert transaction atomically via RPC if available, else manual
    const { data: wallet, error: wErr } = await db
      .from('driver_wallets')
      .select('balance')
      .eq('driver_email', driver_email)
      .maybeSingle();

    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

    const currentBalance = wallet?.balance ?? 0;
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      return NextResponse.json({ error: `Saldo insuficiente — actual: ${currentBalance} Gs` }, { status: 400 });
    }

    // Update or create wallet
    const { error: upsertErr } = await db
      .from('driver_wallets')
      .upsert({ driver_email, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'driver_email' });
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    // Insert transaction record
    const { error: txErr } = await db.from('wallet_transactions').insert({
      driver_email,
      type: amount > 0 ? 'admin_credit' : 'admin_debit',
      amount,
      note: note ? `[Admin: ${admin.email}] ${note}` : `[Admin: ${admin.email}]`,
      created_at: new Date().toISOString(),
    });
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    // Audit log (best-effort — table may not exist yet)
    await db.from('admin_audit_log').insert({
      admin_email: admin.email,
      action: amount > 0 ? 'wallet_credit' : 'wallet_debit',
      target_type: 'driver',
      target_id: driver_email,
      metadata: { amount, note, prev_balance: currentBalance, new_balance: newBalance },
    }).catch(() => {});

    // Notify driver (best-effort)
    try {
      emitNotification(
        driver_email,
        'wallet',
        amount > 0 ? '💰 Ajuste de saldo' : '💸 Débito de saldo',
        note || (amount > 0 ? 'El administrador acreditó saldo a tu billetera.' : 'El administrador realizó un débito en tu billetera.'),
        { amount },
        { groupKey: `admin_wallet_${Date.now()}` },
      );
    } catch { /* notification failure must not block response */ }

    return NextResponse.json({ success: true, new_balance: newBalance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
