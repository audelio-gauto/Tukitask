'use client';
/**
 * ChatBadge — Shows a floating badge with total unread chat messages count.
 * Rendered at layout level for driver and tecnico.
 * Clicking navigates to the active job page where the ChatModal lives.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { Icon } from '@/components/Icon';
import { playMessageAlert } from '@/lib/audio';

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
  const prevUnreadRef = useRef(0);
  const initialLoadRef = useRef(true);

  const fetchCount = useCallback(async () => {
    if (!email) return;
    try {
      const res = await authFetch('/api/chat/threads?count=1');
      if (!res.ok) return;
      const j = await res.json();
      const newCount = Number(j.total_unread ?? 0);
      if (!initialLoadRef.current && newCount > prevUnreadRef.current) {
        playMessageAlert();
      }
      prevUnreadRef.current = newCount;
      initialLoadRef.current = false;
      setUnread(newCount);
    } catch {
      // silently ignore — badge is non-critical
    }
  }, [email, scope]);

  useEffect(() => {
    fetchCount();
    const iv = setInterval(fetchCount, 30_000);

    // Realtime: re-count when any thread updates for this user
    const channel = email
      ? supabase.channel(`chat-threads-${email}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_threads',
            filter: `user_email=eq.${email}`,
          } as never, () => fetchCount())
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_threads',
            filter: `user_email=eq.${email}`,
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
      onClick={() => router.push(`${href}?openChat=1`)}
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
