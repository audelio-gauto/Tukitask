'use client';
/**
 * usePushNotifications — hook for FCM web push registration.
 * - Requests notification permission on first call
 * - Registers service worker + gets FCM token
 * - Posts token to /api/push-tokens for storage
 * - Auto-removes token on logout (call cleanup())
 *
 * Usage: call usePushNotifications(userEmail) in layouts after login.
 */
import { useEffect, useCallback, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging, VAPID_KEY } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';

const SW_PATH = '/sw.js'; // combined PWA + FCM service worker

export function usePushNotifications(userEmail: string | undefined) {
  const registeredRef = useRef(false);

  const register = useCallback(async () => {
    if (!userEmail || registeredRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!('serviceWorker' in navigator)) return;

    // Don't bother if Firebase config is missing (dev without Firebase)
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Register service worker
      const swReg = await navigator.serviceWorker.register(SW_PATH);

      // Get FCM token
      const messaging = getFirebaseMessaging();
      if (!messaging || !VAPID_KEY) return;

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!token) return;

      // Register token with backend
      await authFetch('/api/push-tokens', {
        method: 'POST',
        body: JSON.stringify({ token, platform: 'web' }),
      });

      registeredRef.current = true;

      // Handle foreground messages (app open)
      onMessage(messaging, (payload) => {
        // When app is open, notifications are handled by UrgentNotificationPopup
        // via Supabase realtime. No need to show browser notification here.
        // But dispatch a custom event in case something else needs it:
        window.dispatchEvent(new CustomEvent('fcm-foreground', { detail: payload }));
      });
    } catch (e) {
      // Silent — push is enhancement, not critical
      if (process.env.NODE_ENV === 'development') {
        console.warn('[push] Registration failed:', e);
      }
    }
  }, [userEmail]);

  /** Call on logout to remove token from DB */
  const cleanup = useCallback(async () => {
    if (!registeredRef.current) return;
    try {
      const messaging = getFirebaseMessaging();
      if (!messaging) return;
      const swReg = await navigator.serviceWorker.getRegistration(SW_PATH);
      if (!swReg) return;
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });
      if (token) {
        await authFetch('/api/push-tokens', {
          method: 'DELETE',
          body: JSON.stringify({ token }),
        });
      }
    } catch { /* silent */ }
    registeredRef.current = false;
  }, []);

  useEffect(() => {
    if (userEmail) register();
  }, [userEmail, register]);

  return { cleanup };
}
