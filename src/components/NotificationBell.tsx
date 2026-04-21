'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/useNotifications';
import { UrgentNotificationPopup } from '@/components/UrgentNotificationPopup';
import type { AppNotification, NotifPriority } from '@/lib/notifications';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Map notification type → URL to navigate when tapped
const typeUrl: Record<string, string> = {
  new_order:       '/driver/delivered',
  new_offer:       '/cliente/mis-envios',
  offer_accepted:  '/driver/delivered',
  offer_rejected:  '/cliente/mis-envios',
  status_change:   '/cliente/mis-envios',
  new_job:         '/tecnico',
  new_job_offer:   '/cliente/mis-servicios',
  job_accepted:    '/tecnico',
  job_status:      '/cliente/mis-servicios',
  commission:      '/driver/billetera',
  wallet:          '/cliente/mis-envios',
  rating:          '/cliente/mis-envios',
};
const typeStyle: Record<string, { icon: string; accent: string }> = {
  new_order:       { icon: '📦', accent: '#8b5cf6' },
  new_offer:       { icon: '💰', accent: '#F5C518' },
  offer_accepted:  { icon: '✅', accent: '#22c55e' },
  offer_rejected:  { icon: '❌', accent: '#ef4444' },
  status_change:   { icon: '🔄', accent: '#3b82f6' },
  new_job:         { icon: '🔧', accent: '#8b5cf6' },
  new_job_offer:   { icon: '💼', accent: '#F5C518' },
  job_accepted:    { icon: '✅', accent: '#22c55e' },
  job_status:      { icon: '📋', accent: '#3b82f6' },
  commission:      { icon: '💵', accent: '#22c55e' },
  wallet:          { icon: '👛', accent: '#f59e0b' },
  rating:          { icon: '⭐', accent: '#f59e0b' },
};

const priorityBorder: Record<NotifPriority, string> = {
  urgent: '#ef4444',
  high:   '#F5C518',
  normal: 'transparent',
  silent: 'transparent',
};

interface Props {
  userEmail: string | undefined;
  className?: string;
  /** Enable sound on urgent popups (default true) */
  soundEnabled?: boolean;
}

export function NotificationBell({ userEmail, className, soundEnabled = true }: Props) {
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, latestUrgent, dismissUrgent } = useNotifications(userEmail);
  const [open, setOpen] = useState(false);
  const [bellAnim, setBellAnim] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate bell when new urgent notification arrives
  useEffect(() => {
    if (latestUrgent) {
      setBellAnim(true);
      const t = setTimeout(() => setBellAnim(false), 1000);
      return () => clearTimeout(t);
    }
  }, [latestUrgent]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotifClick = (n: AppNotification) => {
    if (!n.read) markRead([n.id]);
    setOpen(false);
    const url = typeUrl[n.type];
    if (url) router.push(url);
  };

  // Don't render the bell at all when there's nothing to show
  // (UrgentNotificationPopup is always rendered separately for urgent popups)
  if (unreadCount === 0) {
    return (
      <UrgentNotificationPopup
        notification={latestUrgent}
        onDismiss={dismissUrgent}
        soundEnabled={soundEnabled}
      />
    );
  }

  return (
    <>
      {/* Urgent popup overlay */}
      <UrgentNotificationPopup
        notification={latestUrgent}
        onDismiss={dismissUrgent}
        soundEnabled={soundEnabled}
      />

      <div ref={panelRef} className={className} style={{ position: 'fixed', top: 16, right: 70, zIndex: 900 }}>
        {/* Bell button */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Notificaciones"
          style={{
            position: 'relative',
            background: 'rgba(28,28,46,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '50%',
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.25)',
            animation: bellAnim ? 'bellShake 0.5s ease' : undefined,
            transition: 'transform 0.18s cubic-bezier(.34,1.56,.64,1), background 0.18s, box-shadow 0.18s',
          }}
        >
          <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: '#ef4444',
              color: '#fff',
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0 4px',
              border: '2px solid rgba(28,28,46,0.85)',
              animation: 'badgePop 0.3s ease',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div style={{
            position: 'absolute',
            top: 56,
            right: 0,
            width: Math.min(340, typeof window !== 'undefined' ? window.innerWidth - 32 : 340),
            maxHeight: 440,
            background: 'var(--modal-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'panelSlideIn 0.2s ease',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.9rem' }}>
                Notificaciones {unreadCount > 0 && `(${unreadCount})`}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#F5C518',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Marcar todo leído
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
                  Sin notificaciones
                </div>
              ) : (
                notifications.map((n, i) => {
                  const ts = typeStyle[n.type] || { icon: '🔔', accent: '#6b7280' };
                  const priority = (n.priority || 'normal') as NotifPriority;
                  const borderColor = priorityBorder[priority];

                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        display: 'flex',
                        gap: 10,
                        padding: '10px 16px',
                        width: '100%',
                        background: n.read ? 'transparent' : `${ts.accent}08`,
                        border: 'none',
                        borderLeft: `3px solid ${n.read ? 'transparent' : borderColor}`,
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        animation: i === 0 && !n.read ? 'notifSlideIn 0.3s ease' : undefined,
                      }}
                    >
                      {/* Icon with accent background */}
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: `${ts.accent}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                        flexShrink: 0,
                      }}>
                        {ts.icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          fontWeight: n.read ? 500 : 700,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {n.title}
                        </div>
                        <div style={{
                          color: '#9ca3af',
                          fontSize: '0.72rem',
                          lineHeight: 1.3,
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {n.body}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ color: '#6b7280', fontSize: '0.65rem' }}>
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.read && (
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: ts.accent,
                          }} />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes bellShake {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(14deg); }
          40% { transform: rotate(-14deg); }
          60% { transform: rotate(7deg); }
          80% { transform: rotate(-7deg); }
        }
        @keyframes badgePop {
          0% { transform: scale(0); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes notifSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
