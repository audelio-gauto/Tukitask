'use client';
/**
 * ChatBadge — Shows a floating badge with total unread chat messages count.
 * Rendered at layout level for driver and tecnico.
 * Clicking navigates to the active job page where the ChatModal lives.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { Icon } from '@/components/Icon';

interface Props {
  email: string;
  /** Route to navigate to when badge is tapped */
  href: string;
  /** 'order_id' for drivers, 'job_id' for tecnicos */
  scope: 'order' | 'job';
}

export function ChatBadge({ email, href, scope }: Props) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!email) return;
    try {
      // Get active order/job ids first, then count unread per job/order
      const param = scope === 'order' ? 'driver_email' : 'email';
      const activeParam = scope === 'order' ? '' : '&active=true';
      const endpoint = scope === 'order'
        ? `/api/orders?driver_email=${encodeURIComponent(email)}`
        : `/api/tecnico/jobs?email=${encodeURIComponent(email)}&active=true`;

      const res = await authFetch(endpoint);
      if (!res.ok) return;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) { setUnread(0); return; }

      const idKey = scope === 'order' ? 'id' : 'id';
      const countParam = scope === 'order' ? 'order_id' : 'job_id';

      // Sum unread across all active jobs/orders
      const counts = await Promise.all(
        items.map(async (item: { id: string }) => {
          const r = await authFetch(`/api/chat?${countParam}=${item.id}&count=1`);
          if (!r.ok) return 0;
          const j = await r.json();
          return Number(j.unread ?? 0);
        })
      );
      setUnread(counts.reduce((a, b) => a + b, 0));
    } catch {
      // silently ignore — badge is non-critical
    }
  }, [email, scope]);

  useEffect(() => {
    fetchCount();
    const iv = setInterval(fetchCount, 30_000);

    // Realtime: re-count when any chat message arrives
    const channel = email
      ? supabase.channel(`chat-badge-${email}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
          } as never, () => fetchCount())
          .subscribe()
      : null;

    return () => {
      clearInterval(iv);
      if (channel) supabase.removeChannel(channel);
    };
  }, [email, fetchCount]);

  if (unread === 0) return null;

  return (
    <button
      onClick={() => router.push(href)}
      title={`${unread} mensaje${unread !== 1 ? 's' : ''} sin leer`}
      style={{
        position: 'fixed',
        bottom: 80,
        right: 16,
        zIndex: 9900,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#22c55e',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(34,197,94,0.5)',
        fontSize: '1.3rem',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <Icon name="chat" size={20} color="#fff" />
      <span style={{
        position: 'absolute',
        top: 2,
        right: 2,
        background: '#ef4444',
        color: '#fff',
        fontSize: '0.6rem',
        fontWeight: 800,
        borderRadius: '50%',
        minWidth: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 3px',
        lineHeight: 1,
      }}>
        {unread > 99 ? '99+' : unread}
      </span>
    </button>
  );
}
