/**
 * POST /api/bell
 * Driver or Técnico rings the bell to notify the client they have arrived.
 * bell_number: 1 = soft tone, 2 = urgent, 3 = alarm + "vas a perder el pedido"
 */
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { order_id, job_id, bell_number, client_email, worker_type } = body as {
    order_id?: string;
    job_id?: string;
    bell_number: number;
    client_email: string;
    worker_type: 'driver' | 'tecnico';
  };

  if (!client_email || ![1, 2, 3].includes(Number(bell_number))) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }
  if (!order_id && !job_id) {
    return NextResponse.json({ error: 'order_id or job_id required' }, { status: 400 });
  }

  const bn = Number(bell_number);
  const workerLabel = worker_type === 'driver' ? 'conductor' : 'técnico';

  let title: string;
  let bodyText: string;
  let priority: 'high' | 'urgent';

  if (bn === 1) {
    title = `🔔 Tu ${workerLabel} llegó`;
    bodyText = `Tu ${workerLabel} está esperando afuera.`;
    priority = 'high';
  } else if (bn === 2) {
    title = `🔔 Sigue esperando afuera`;
    bodyText = `Tu ${workerLabel} todavía te espera. Salí cuando puedas.`;
    priority = 'high';
  } else {
    title = `⚠️ ¡Salí ahora!`;
    bodyText = `Tu ${workerLabel} espera hace varios minutos y puede cancelar sin penalización.`;
    priority = 'urgent';
  }

  const groupKey = order_id ? `bell-order-${order_id}` : `bell-job-${job_id}`;
  const data = order_id ? { order_id } : { job_id };

  await emitNotification(
    client_email,
    order_id ? 'status_change' : 'job_status',
    title,
    bodyText,
    data,
    { priority, groupKey },
  );

  return NextResponse.json({ ok: true });
}
