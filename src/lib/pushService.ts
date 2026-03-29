/**
 * Push notification dispatch service — prep for FCM/APNs integration.
 *
 * Currently a no-op dispatcher that logs push intents.
 * To activate: set FIREBASE_SERVER_KEY or use Firebase Admin SDK.
 *
 * Architecture:
 * 1. emitNotification() emits in-app notification via Supabase
 * 2. After in-app emit, call dispatchPush() for urgent/high notifications
 * 3. dispatchPush() looks up user's push_tokens and sends via FCM
 */
import { sbAdmin } from '@/lib/apiAuth';
import type { NotifPriority, PushPlatform } from '@/lib/notifications';
import { getPushChannel } from '@/lib/notifications';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  priority: 'high' | 'normal';
}

/**
 * Dispatch a push notification to all registered devices for a user.
 * Returns the number of tokens attempted.
 */
export async function dispatchPush(
  userEmail: string,
  title: string,
  body: string,
  notifPriority: NotifPriority,
  data?: Record<string, unknown>,
): Promise<number> {
  const channel = getPushChannel(notifPriority);
  if (channel === 'in_app') return 0; // No push needed

  // Look up user's push tokens
  const { data: tokens, error } = await sbAdmin()
    .from('push_tokens')
    .select('token, platform')
    .eq('user_email', userEmail.toLowerCase());

  if (error || !tokens?.length) return 0;

  const payload: PushPayload = {
    title,
    body,
    data: data ? Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ) : undefined,
    priority: notifPriority === 'urgent' ? 'high' : 'normal',
  };

  // TODO: Replace with Firebase Admin SDK or FCM HTTP v1 API
  // For now, log the push intent for development visibility
  if (process.env.NODE_ENV === 'development') {
    console.log(`[push] Would send to ${tokens.length} device(s) for ${userEmail}:`, payload.title);
  }

  // Placeholder for actual FCM dispatch:
  // const sent = await sendFCM(tokens, payload);
  // return sent;

  return tokens.length;
}

/**
 * Remove stale tokens that fail to deliver.
 * Call this when FCM returns an invalid registration error.
 */
export async function removeStaleToken(token: string): Promise<void> {
  await sbAdmin()
    .from('push_tokens')
    .delete()
    .eq('token', token);
}

// ── Future: FCM HTTP v1 dispatch ─────────────────────────────────────────────
// Uncomment and configure when ready:
//
// async function sendFCM(
//   tokens: Array<{ token: string; platform: PushPlatform }>,
//   payload: PushPayload,
// ): Promise<number> {
//   const FIREBASE_SERVER_KEY = process.env.FIREBASE_SERVER_KEY;
//   if (!FIREBASE_SERVER_KEY) return 0;
//
//   let sent = 0;
//   for (const { token } of tokens) {
//     const res = await fetch('https://fcm.googleapis.com/fcm/send', {
//       method: 'POST',
//       headers: {
//         Authorization: `key=${FIREBASE_SERVER_KEY}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         to: token,
//         notification: { title: payload.title, body: payload.body },
//         data: payload.data,
//         priority: payload.priority,
//       }),
//     });
//     if (res.ok) sent++;
//     else {
//       const err = await res.json();
//       if (err?.results?.[0]?.error === 'InvalidRegistration') {
//         await removeStaleToken(token);
//       }
//     }
//   }
//   return sent;
// }
