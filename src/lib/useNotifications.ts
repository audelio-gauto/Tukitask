'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import type { AppNotification, NotifPriority } from '@/lib/notifications';

/**
 * Hook that provides real-time in-app notifications — v2.
 * - Priority-aware (urgent → popup, normal → badge, silent → no UI)
 * - Dedup via id tracking
 * - Exposes latestUrgent for UrgentNotificationPopup
 * - Groups silent notifications (no individual UI)
 */
export function useNotifications(userEmail: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestUrgent, setLatestUrgent] = useState<AppNotification | null>(null);
  const emailRef = useRef(userEmail);
  const seenIdsRef = useRef(new Set<string>());
  emailRef.current = userEmail;

  const fetchNotifications = useCallback(async () => {
    if (!emailRef.current) return;
    try {
      const res = await authFetch('/api/notifications?limit=50');
      if (res.ok) {
        const data: AppNotification[] = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read).length);
        // Track seen IDs to avoid re-triggering popups on tab refocus
        data.forEach((n) => seenIdsRef.current.add(n.id));
      }
    } catch {
      // silent
    }
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await authFetch('/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }, []);

  const markAllRead = useCallback(async () => {
    await authFetch('/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  /** Clear the latest urgent (after popup dismissed) */
  const dismissUrgent = useCallback(() => {
    setLatestUrgent(null);
  }, []);

  useEffect(() => {
    if (!userEmail) return;

    fetchNotifications();

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

          // Don't show silent notifications in the main list UI update visually
          const priority = (n.priority || 'normal') as NotifPriority;

          setNotifications((prev) => [n, ...prev].slice(0, 50));
          setUnreadCount((prev) => prev + 1);

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
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userEmail, fetchNotifications]);

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
