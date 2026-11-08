'use client';
/**
 * usePushNotifications — registro de notificaciones nativas de Android.
 *
 * Usage: call usePushNotifications(userEmail) in layouts after login.
 */
import { useEffect, useCallback, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { authFetch } from '@/lib/authFetch';

const ANDROID_PUSH_CHANNEL_ID = 'tukitask_alerts';

export function usePushNotifications(userEmail: string | undefined) {
  const registeredRef = useRef(false);
  const nativeTokenRef = useRef<string | null>(null);
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);

  const register = useCallback(async () => {
    if (!userEmail || registeredRef.current) return;
    if (typeof window === 'undefined') return;

    if (Capacitor.getPlatform() === 'android') {
      // Sin google-services.json (Firebase) en el APK, PushNotifications.register() cierra la app.
      // Se activa solo cuando el APK se compiló con Firebase: NEXT_PUBLIC_ANDROID_PUSH=true
      if (process.env.NEXT_PUBLIC_ANDROID_PUSH !== 'true') return;
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

  }, []);

  useEffect(() => {
    if (userEmail) register();
  }, [userEmail, register]);

  return { cleanup };
}
