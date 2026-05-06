/**
 * POST /api/tips
 * Body: { order_id: string; amount: number }
 * - Verifies the authenticated user is the client of the order
 * - Order must be in a delivered/completed status
 * - Inserts into order_tips and updates driver wallet + order.tip_amount
 * - Notifies the driver
 */
import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';

const DELIVERED_STATUSES = ['delivered', 'client_confirmed', 'commission_charged'];

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { order_id?: string; amount?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { order_id, amount } = body;
  if (!order_id || !amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'order_id and positive amount required' }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount > 5_000_000) {
    return NextResponse.json({ error: 'amount must be a positive integer ≤ 5,000,000 Gs' }, { status: 400 });
  }

  const sb = sbAdmin();

  // Verify ownership + status
  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('id, client_email, driver_email, status, tip_amount')
    .eq('id', order_id)
    .maybeSingle();

  if (oErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.client_email?.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!DELIVERED_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Order is not delivered yet' }, { status: 400 });
  }
  if (!order.driver_email) {
    return NextResponse.json({ error: 'No driver assigned to this order' }, { status: 400 });
  }
  if ((order.tip_amount ?? 0) > 0) {
    return NextResponse.json({ error: 'Tip already given for this order' }, { status: 409 });
  }

  // Insert tip
  const { error: tipErr } = await sb.from('order_tips').insert({
    order_id,
    client_email: user.email.toLowerCase(),
    driver_email: order.driver_email.toLowerCase(),
    amount,
  });
  if (tipErr) return serverError(tipErr);

  // Update order tip_amount
  await sb.from('orders').update({ tip_amount: amount }).eq('id', order_id);

  // Credit driver wallet
  await sb.rpc('credit_wallet', {
    p_email:  order.driver_email.toLowerCase(),
    p_amount: amount,
    p_note:   `Propina por pedido #${order_id.slice(0, 8)}`,
  });

  // Notify driver
  emitNotification(
    order.driver_email,
    'wallet',
    '💰 Recibiste una propina',
    `El cliente te dejó una propina de ${amount.toLocaleString('es-PY')} Gs. ¡Gracias!`,
    { order_id },
    { priority: 'high', groupKey: `order:${order_id}:tip` },
  );

  return NextResponse.json({ success: true, amount });
}
