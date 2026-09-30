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
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging, VAPID_KEY } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';

const SW_PATH = '/sw.js'; // combined PWA + FCM service worker
const ANDROID_PUSH_CHANNEL_ID = 'tukitask_alerts';

export function usePushNotifications(userEmail: string | undefined) {
  const registeredRef = useRef(false);
  const nativeTokenRef = useRef<string | null>(null);
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);

  const register = useCallback(async () => {
    if (!userEmail || registeredRef.current) return;
    if (typeof window === 'undefined') return;

    if (Capacitor.getPlatform() === 'android') {
      try {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
          permission = await PushNotifications.requestPermissions();
        }
        if (permission.receive !== 'granted') return;

        try {
          await PushNotifications.createChannel({
            id: ANDROID_PUSH_CHANNEL_ID,
            name: 'Solicitudes',
            description: 'Nuevas solicitudes y ofertas urgentes',
            importance: 5,
            vibration: true,
          });
        } catch {
          // Older Android versions do not support notification channels.
        }

        const registrationListener = await PushNotifications.addListener('registration', ({ value }) => {
          nativeTokenRef.current = value;
          void authFetch('/api/push-tokens', {
            method: 'POST',
            body: JSON.stringify({ token: value, platform: 'android' }),
          }).then((response) => {
            if (!response.ok && process.env.NODE_ENV === 'development') {
              console.warn('[push] Native token registration failed:', response.status);
            }
          }).catch((error) => {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[push] Native token registration failed:', error);
            }
          });
        });
        const errorListener = await PushNotifications.addListener('registrationError', (error) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[push] Native registration failed:', error.error);
          }
        });
        nativeListenersRef.current.push(registrationListener, errorListener);

        await PushNotifications.register();
        registeredRef.current = true;
        return;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[push] Native registration failed:', e);
        }
        return;
      }
    }

    if (!('Notification' in window)) return;
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
    if (Capacitor.getPlatform() === 'android') {
      const token = nativeTokenRef.current;
      if (token) {
        try {
          await authFetch('/api/push-tokens', {
            method: 'DELETE',
            body: JSON.stringify({ token }),
          });
        } catch { /* silent */ }
      }
      await Promise.allSettled(nativeListenersRef.current.map((listener) => listener.remove()));
      nativeListenersRef.current = [];
      nativeTokenRef.current = null;
      registeredRef.current = false;
      return;
    }

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
