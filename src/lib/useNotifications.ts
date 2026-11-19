'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import type { AppNotification, NotifPriority, NotifType } from '@/lib/notifications';

export interface UseNotificationsOptions {
  /**
   * Tipos que se muestran solo como popup transitorio y nunca en la campanita.
   * El conductor los usa para las solicitudes: si la app estaba en segundo
   * plano, al volver se recuperan del servidor y se avisan igual.
   */
  popupOnlyTypes?: NotifType[];
}

/** Una solicitud deja de ser accionable a los pocos minutos. */
const POPUP_ONLY_MAX_AGE_MS = 2 * 60 * 1000;

function isRecent(n: AppNotification): boolean {
  const created = Date.parse(n.created_at);
  return Number.isFinite(created) && Date.now() - created <= POPUP_ONLY_MAX_AGE_MS;
}

/**
 * Hook that provides real-time in-app notifications — v2.
 * - Priority-aware (urgent → popup, normal → badge, silent → no UI)
 * - Dedup via id tracking
 * - Exposes latestUrgent for UrgentNotificationPopup
 * - Groups silent notifications (no individual UI)
 */
export function useNotifications(userEmail: string | undefined, options?: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const [latestUrgent, setLatestUrgent] = useState<AppNotification | null>(null);
  const seenIdsRef = useRef(new Set<string>());
  const alertedIdsRef = useRef(new Set<string>());
  const popupOnlyKey = (options?.popupOnlyTypes ?? []).join(',');

  const isPopupOnly = useCallback(
    (n: AppNotification) => popupOnlyKey.split(',').includes(n.type),
    [popupOnlyKey],
  );

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const response = await authFetch('/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error('No se pudo marcar la notificación como leída.');
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
    );
  }, []);

  /**
   * Muestra una solicitud como popup una sola vez. Se marca leída para que no
   * vuelva a aparecer al reabrir la app; la tarjeta de la solicitud sigue en
   * la pantalla del conductor.
   */
  const showPopup = useCallback((n: AppNotification) => {
    const priority = (n.priority || 'normal') as NotifPriority;
    if (priority !== 'urgent' && priority !== 'high') return;
    if (alertedIdsRef.current.has(n.id)) return;
    alertedIdsRef.current.add(n.id);
    if (!isRecent(n)) return;
    setLatestUrgent(n);
    if (!n.read) void markRead([n.id]).catch(() => {});
  }, [markRead]);

  const fetchNotifications = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await authFetch('/api/notifications?limit=50');
      if (res.ok) {
        const data: AppNotification[] = await res.json();
        const visible: AppNotification[] = [];
        const popupOnly: AppNotification[] = [];
        data.forEach((n) => {
          seenIdsRef.current.add(n.id);
          (isPopupOnly(n) ? popupOnly : visible).push(n);
        });
        setNotifications(visible);

        // Avisos de solicitud recuperados del servidor (por ejemplo, al volver
        // de Google Maps). Los viejos ya no son accionables y se limpian.
        const staleRequestIds: string[] = [];
        popupOnly.forEach((n) => {
          if (!n.read && isRecent(n)) {
            showPopup(n);
          } else {
            alertedIdsRef.current.add(n.id);
            if (!n.read) staleRequestIds.push(n.id);
          }
        });
        if (staleRequestIds.length) void markRead(staleRequestIds).catch(() => {});
      }
    } catch {
      // silent
    }
  }, [userEmail, isPopupOnly, showPopup, markRead]);

  const markAllRead = useCallback(async () => {
    const snapshot = new Map(notifications.map(n => [n.id, n]));
    const response = await authFetch('/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ all: true }),
    });
    if (!response.ok) throw new Error('No se pudieron marcar las notificaciones como leídas.');
    setNotifications((prev) => prev.map((n) => snapshot.get(n.id) === n ? { ...n, read: true } : n));
  }, [notifications]);

  /** Clear the latest urgent (after popup dismissed) */
  const dismissUrgent = useCallback(() => {
    setLatestUrgent(null);
  }, []);

  const pollPopupOnly = (options?.popupOnlyTypes?.length ?? 0) > 0;

  useEffect(() => {
    if (!userEmail) return;

    // The async fetch updates state only after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();

    // Respaldo por si Realtime pierde el INSERT (pantalla bloqueada, cambio de
    // red): la solicitud se recupera igual como popup mientras la app está abierta.
    const popupPoll = pollPopupOnly ? setInterval(fetchNotifications, 15_000) : null;

    const channel = supabase
      .channel(`notifications-${userEmail}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          // Dedup — skip if we've already seen this ID
          if (seenIdsRef.current.has(n.id)) return;
          seenIdsRef.current.add(n.id);

          // Las solicitudes del conductor se avisan con popup, no en la campanita.
          if (isPopupOnly(n)) {
            if (!n.read) showPopup(n);
            return;
          }

          // Don't show silent notifications in the main list UI update visually
          const priority = (n.priority || 'normal') as NotifPriority;

          setNotifications((prev) => [n, ...prev].slice(0, 50));

          // Trigger urgent popup for urgent/high priority
          if (priority === 'urgent' || priority === 'high') {
            setLatestUrgent(n);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          // Dedup group_key update — replaces existing notification in list
          const updated = payload.new as AppNotification;
          if (isPopupOnly(updated)) {
            if (!updated.read) showPopup(updated);
            return;
          }
          setNotifications((prev) => {
            const idx = prev.findIndex((n) => n.id === updated.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = updated;
              return copy;
            }
            return [updated, ...prev].slice(0, 50);
          });
          // If it was bumped (group_key update), re-trigger urgent
          const priority = (updated.priority || 'normal') as NotifPriority;
          if (!updated.read && (priority === 'urgent' || priority === 'high')) {
            setLatestUrgent(updated);
          }
        },
      )
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (popupPoll) clearInterval(popupPoll);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userEmail, fetchNotifications, isPopupOnly, showPopup, pollPopupOnly]);

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
    /** Latest urgent/high notification for popup */
    latestUrgent,
    /** Call after popup is dismissed */
    dismissUrgent,
  };
}
