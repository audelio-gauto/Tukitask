import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';
import { dispatchPush } from '@/lib/pushService';

const db = () => sbAdmin();

// ── GET: cargar mensajes de un chat ──────────────────────────────────────────
// ?order_id=xxx  o  ?job_id=xxx
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const jobId   = searchParams.get('job_id');

  if (!orderId && !jobId) {
    return NextResponse.json({ error: 'order_id o job_id requerido' }, { status: 400 });
  }

  // Verificar que el usuario es participante antes de devolver mensajes
  if (orderId) {
    const { data: order } = await db()
      .from('orders')
      .select('client_email, accepted_by')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    const isParticipant = order.client_email?.toLowerCase() === user.email || order.accepted_by?.toLowerCase() === user.email;
    if (!isParticipant) return NextResponse.json({ error: 'Sin acceso a este chat' }, { status: 403 });

    // ?count=1 → solo devuelve el nro de mensajes no leídos (para el badge)
    if (searchParams.get('count') === '1') {
      const { data: thread } = await db()
        .from('chat_threads')
        .select('unread_count')
        .eq('user_email', user.email)
        .eq('order_id', orderId)
        .maybeSingle();
      return NextResponse.json({ unread: thread?.unread_count ?? 0 });
    }

    const { data, error } = await db()
      .from('chat_messages')
      .select('id, created_at, sender_email, sender_name, sender_role, content, read_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return serverError(error);
    return NextResponse.json(data ?? []);
  }

  if (jobId) {
    const { data: job } = await db()
      .from('tecnico_jobs')
      .select('client_email, tecnico_email')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Trabajo no encontrado' }, { status: 404 });
    const isParticipant = job.client_email?.toLowerCase() === user.email || job.tecnico_email?.toLowerCase() === user.email;
    if (!isParticipant) return NextResponse.json({ error: 'Sin acceso a este chat' }, { status: 403 });

    if (searchParams.get('count') === '1') {
      const { data: thread } = await db()
        .from('chat_threads')
        .select('unread_count')
        .eq('user_email', user.email)
        .eq('job_id', jobId)
        .maybeSingle();
      return NextResponse.json({ unread: thread?.unread_count ?? 0 });
    }

    const { data, error } = await db()
      .from('chat_messages')
      .select('id, created_at, sender_email, sender_name, sender_role, content, read_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return serverError(error);
    return NextResponse.json(data ?? []);
  }
}

// ── POST: enviar mensaje ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  // Rate limit: 30 mensajes por minuto por usuario
  const allowed = await allowRequest(`rl:chat:${user.email}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Demasiados mensajes. Esperá un momento.' }, { status: 429 });

  const body = await req.json();
  const { order_id, job_id, content, sender_name } = body;

  if (!order_id && !job_id) {
    return NextResponse.json({ error: 'order_id o job_id requerido' }, { status: 400 });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
  }
  const text = content.trim().slice(0, 500);

  // Verificar participación y determinar rol
  let senderRole: 'client' | 'driver' | 'tecnico' = 'client';
  let recipientEmail: string | null = null;

  if (order_id) {
    const { data: order } = await db()
      .from('orders')
      .select('client_email, accepted_by, status')
      .eq('id', order_id)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (order.client_email?.toLowerCase() !== user.email && order.accepted_by?.toLowerCase() !== user.email) {
      return NextResponse.json({ error: 'Sin acceso a este chat' }, { status: 403 });
    }
    // Solo permitir chat si el pedido está activo
    const ACTIVE = ['accepted','picking_up','at_pickup','in_transit','returning','driver_returning','return_delivered'];
    if (!ACTIVE.includes(order.status)) {
      return NextResponse.json({ error: 'El pedido no está activo. No se puede chatear.' }, { status: 409 });
    }
    senderRole = order.client_email?.toLowerCase() === user.email ? 'client' : 'driver';
    recipientEmail = senderRole === 'client'
      ? (order.accepted_by?.toLowerCase() ?? null)
      : (order.client_email?.toLowerCase() ?? null);
  }

  if (job_id) {
    const { data: job } = await db()
      .from('tecnico_jobs')
      .select('client_email, tecnico_email, status')
      .eq('id', job_id)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: 'Trabajo no encontrado' }, { status: 404 });
    if (job.client_email?.toLowerCase() !== user.email && job.tecnico_email?.toLowerCase() !== user.email) {
      return NextResponse.json({ error: 'Sin acceso a este chat' }, { status: 403 });
    }
    const ACTIVE_JOB = ['accepted','en_camino','llegue','en_proceso','in_progress','completion_pending'];
    if (!ACTIVE_JOB.includes(job.status)) {
      return NextResponse.json({ error: 'El trabajo no está activo. No se puede chatear.' }, { status: 409 });
    }
    senderRole = job.client_email?.toLowerCase() === user.email ? 'client' : 'tecnico';
    recipientEmail = senderRole === 'client'
      ? (job.tecnico_email?.toLowerCase() ?? null)
      : (job.client_email?.toLowerCase() ?? null);
  }

  const { data, error } = await db()
    .from('chat_messages')
    .insert([{
      order_id: order_id || null,
      job_id:   job_id   || null,
      sender_email: user.email,
      sender_name:  typeof sender_name === 'string' ? sender_name.slice(0, 60) : null,
      sender_role:  senderRole,
      content:      text,
    }])
    .select()
    .single();

  if (error) return serverError(error);

  // Send push notification to the recipient (screen-off sound support)
  if (recipientEmail) {
    const senderLabel = typeof sender_name === 'string' && sender_name.trim()
      ? sender_name.trim().slice(0, 30)
      : senderRole === 'driver' ? 'Driver' : senderRole === 'tecnico' ? 'Técnico' : 'Cliente';
    dispatchPush(
      recipientEmail,
      `💬 ${senderLabel}`,
      text.length > 80 ? text.slice(0, 77) + '…' : text,
      'high',
      {
        type: 'chat_message',
        url: order_id
          ? (senderRole === 'driver' ? `/cliente/seguimiento/${order_id}?openChat=1` : '/driver/activo?openChat=1')
          : (senderRole === 'tecnico' ? `/cliente/seguimiento/${job_id}?openChat=1` : '/tecnico/citas?openChat=1'),
        ...(order_id ? { order_id: String(order_id) } : { job_id: String(job_id) }),
      }
    ).catch(() => { /* non-critical */ });
  }

  return NextResponse.json(data, { status: 201 });
}

// ── PATCH: marcar mensajes como leídos ────────────────────────────────────────
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { order_id, job_id } = body;
  if (!order_id && !job_id) return NextResponse.json({ error: 'order_id o job_id requerido' }, { status: 400 });

  const filter = order_id ? { order_id } : { job_id };
  await db()
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .match(filter)
    .neq('sender_email', user.email)
    .is('read_at', null);

  if (order_id || job_id) {
    const threadFilter = order_id ? { order_id } : { job_id };
    await db()
      .from('chat_threads')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('user_email', user.email)
      .match(threadFilter);
  }

  return NextResponse.json({ success: true });
}
