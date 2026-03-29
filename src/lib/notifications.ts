/**
 * In-app notification system — v2.
 * Priority levels, deduplication, business-rule validation, push-ready.
 */

// ── Priority levels ──────────────────────────────────────────────────────────
export type NotifPriority = 'urgent' | 'high' | 'normal' | 'silent';

// ── Types ────────────────────────────────────────────────────────────────────
export type NotifType =
  | 'new_order'
  | 'new_offer'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'status_change'
  | 'new_job'
  | 'new_job_offer'
  | 'job_accepted'
  | 'job_status'
  | 'commission'
  | 'wallet'
  | 'rating';

/**
 * Default priority per notification type.
 * Urgent → popup + sound + vibration. High → sound + badge. Normal → badge. Silent → nothing.
 */
export const NOTIF_PRIORITY: Record<NotifType, NotifPriority> = {
  new_offer:       'urgent',
  new_job_offer:   'urgent',
  offer_accepted:  'urgent',
  job_accepted:    'urgent',
  offer_rejected:  'high',
  status_change:   'high',
  job_status:      'high',
  new_order:       'normal',
  new_job:         'normal',
  commission:      'normal',
  wallet:          'normal',
  rating:          'silent',
};

export interface AppNotification {
  id: string;
  user_email: string;
  type: NotifType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  priority: NotifPriority;
  group_key?: string | null;
  created_at: string;
}

// ── Push token registration (for future FCM/APNs) ───────────────────────────
export type PushPlatform = 'web' | 'android' | 'ios';

export interface PushToken {
  user_email: string;
  token: string;
  platform: PushPlatform;
  created_at: string;
}

// ── Push dispatch channel type ───────────────────────────────────────────────
export type PushChannel = 'in_app' | 'push' | 'both';

/**
 * Determine push dispatch channel based on priority.
 * Urgent/High → both (in-app + external push when available).
 * Normal → in-app only. Silent → in-app only (no badge flash).
 */
export function getPushChannel(priority: NotifPriority): PushChannel {
  if (priority === 'urgent' || priority === 'high') return 'both';
  return 'in_app';
}

// ── Server-side notification creation helper ─────────────────────────────────
export function buildNotification(
  userEmail: string,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  priority?: NotifPriority,
  groupKey?: string,
): Omit<AppNotification, 'id' | 'created_at'> {
  return {
    user_email: userEmail.toLowerCase(),
    type,
    title,
    body,
    data: data ?? {},
    read: false,
    priority: priority ?? NOTIF_PRIORITY[type] ?? 'normal',
    group_key: groupKey ?? null,
  };
}
