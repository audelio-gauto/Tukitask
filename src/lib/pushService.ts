/**
 * Push notification dispatch service — Firebase Admin SDK / FCM HTTP v1.
 *
 * Architecture:
 * 1. emitNotification() emits in-app notification via Supabase
 * 2. After in-app emit, call dispatchPush() for urgent/high notifications
 * 3. dispatchPush() looks up push_tokens and sends via FCM multicast
 *
 * Required env var (server-only):
 *   FIREBASE_SERVICE_ACCOUNT_JSON — stringified service account JSON from Firebase Console
 */
import { sbAdmin } from '@/lib/apiAuth';
import type { NotifPriority, PushPlatform } from '@/lib/notifications';
import { getPushChannel } from '@/lib/notifications';
import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

// ── Firebase Admin singleton ─────────────────────────────────────────────────
function getAdminApp(): admin.app.App | null {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    if (admin.apps.length > 0) return admin.apps[0]!;
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ) as ServiceAccount;
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch {
    return null;
  }
}

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

  return sendFCM(tokens.map((t: { token: string }) => t.token), payload);
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

// ── FCM dispatch via Firebase Admin SDK ────────────────────────────────────
async function sendFCM(tokens: string[], payload: PushPayload): Promise<number> {
  const app = getAdminApp();
  if (!app || !tokens.length) return 0;

  const messaging = admin.messaging(app);
  const CHUNK = 500; // FCM multicast limit
  let sent = 0;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: { priority: payload.priority === 'high' ? 'high' : 'normal' },
        webpush: payload.priority === 'high'
          ? { headers: { Urgency: 'high' } }
          : undefined,
      });
      sent += response.successCount;
      // Remove tokens that are no longer valid
      for (let j = 0; j < response.responses.length; j++) {
        const r = response.responses[j];
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          await removeStaleToken(chunk[j]);
        }
      }
    } catch {
      // Partial failure — continue with next chunk
    }
  }

  return sent;
}
