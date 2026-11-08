import { serverError } from '@/lib/apiError';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, sbAdmin } from '@/lib/apiAuth';
import { canShowOrderChat } from '@/lib/orderChat';
import { JOB_ACTIVE_STATUSES } from '@/lib/constants';

// GET /api/chat/threads
// ?count=1  -> { total_unread }
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const countOnly = url.searchParams.get('count') === '1';
  const scope = url.searchParams.get('scope');
  if (scope && !['order', 'job', 'client'].includes(scope)) {
    return NextResponse.json({ error: 'Ámbito de chat inválido' }, { status: 400 });
  }

  let query = sbAdmin()
    .from('chat_threads')
    .select('unread_count, order_id, job_id, last_message_at')
    .eq('user_email', user.email);

  if (countOnly) {
    query = query.gt('unread_count', 0);
  }

  const { data, error } = await query;
  if (error) return serverError(error);

  const threads: Array<{ unread_count: number | null; order_id: string | null; job_id: string | null; last_message_at: string | null }> = data ?? [];
  const scopedThreads = threads.filter(row =>
    scope === 'order' ? !!row.order_id : scope === 'job' ? !!row.job_id : true,
  );
  const orderIds = [...new Set(scopedThreads.map(row => row.order_id).filter((id): id is string => !!id))];
  const visibleOrderIds = new Set<string>();
  if (orderIds.length) {
    const { data: orders, error: ordersError } = await sbAdmin()
      .from('orders')
      .select('id, status, client_email, accepted_by')
      .in('id', orderIds);
    if (ordersError) return serverError(ordersError);
    for (const order of orders ?? []) {
      if (canShowOrderChat(order, user.email) &&
          (scope !== 'order' || order.accepted_by?.toLowerCase() === user.email) &&
          (scope !== 'client' || order.client_email?.toLowerCase() === user.email)) {
        visibleOrderIds.add(order.id);
      }
    }
  }
  const visibleJobIds = new Set<string>();
  const jobIds = scope === 'client'
    ? [...new Set(scopedThreads.map(row => row.job_id).filter((id): id is string => !!id))]
    : [];
  if (jobIds.length) {
    const { data: jobs, error: jobsError } = await sbAdmin()
      .from('tecnico_jobs')
      .select('id, status, client_email, tecnico_email')
      .in('id', jobIds);
    if (jobsError) return serverError(jobsError);
    for (const job of jobs ?? []) {
      if (job.client_email?.toLowerCase() === user.email && job.tecnico_email &&
          JOB_ACTIVE_STATUSES.includes(job.status)) visibleJobIds.add(job.id);
    }
  }
  const visible = scopedThreads.filter(row =>
    row.order_id ? visibleOrderIds.has(row.order_id) :
      !!row.job_id && (scope !== 'client' || visibleJobIds.has(row.job_id)),
  );
  if (countOnly) {
    const total = visible.reduce((sum: number, r: { unread_count: number | null }) => sum + Number(r.unread_count ?? 0), 0);
    return NextResponse.json({ total_unread: total });
  }

  return NextResponse.json(visible);
}
