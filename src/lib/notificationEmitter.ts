/**
 * Server-side notification emitter — v2.
 * Uses `safe_emit_notification` RPC for business-rule validation, dedup, and priority.
 * Falls back to raw insert if RPC is not yet deployed.
 */
import { sbAdmin } from '@/lib/apiAuth';
import type { NotifType, NotifPriority } from '@/lib/notifications';
import { NOTIF_PRIORITY, buildNotification } from '@/lib/notifications';

export interface EmitOpts {
  priority?: NotifPriority;
  /** Group key for dedup. Same group_key + same user + unread → update instead of insert */
  groupKey?: string;
}

/**
 * Emit a notification with business-rule validation (order/job state checks)
 * and automatic deduplication via group_key.
 * Never throws — logs errors and fails silently.
 */
export async function emitNotification(
  userEmail: string,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  opts?: EmitOpts,
): Promise<void> {
  const priority = opts?.priority ?? NOTIF_PRIORITY[type] ?? 'normal';
  const groupKey = opts?.groupKey ?? null;

  try {
    // Try the smart RPC first (business rules + dedup in DB)
    const { error: rpcError } = await sbAdmin().rpc('safe_emit_notification', {
      p_user_email: userEmail.toLowerCase(),
      p_type: type,
      p_title: title,
      p_body: body,
      p_priority: priority,
      p_group_key: groupKey,
      p_data: data ?? {},
    });

    if (!rpcError) return; // Success via RPC

    // RPC not deployed yet — fallback to raw insert
    if (rpcError.message.includes('function') || rpcError.code === '42883') {
      const row = buildNotification(userEmail, type, title, body, data, priority, groupKey ?? undefined);
      const { error } = await sbAdmin()
        .from('notifications')
        .insert([row]);
      if (error) console.error('[notif] Fallback insert failed:', error.message);
      return;
    }

    console.error('[notif] RPC failed:', rpcError.message);
  } catch (e) {
    console.error('[notif] Emit error:', e);
  }
}

/**
 * Emit notifications to multiple users at once.
 */
export async function emitNotificationBulk(
  entries: Array<{
    userEmail: string;
    type: NotifType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    opts?: EmitOpts;
  }>,
): Promise<void> {
  if (!entries.length) return;
  // Bulk uses individual calls to benefit from per-item business rules
  await Promise.allSettled(
    entries.map((e) =>
      emitNotification(e.userEmail, e.type, e.title, e.body, e.data, e.opts),
    ),
  );
}
