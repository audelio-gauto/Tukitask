'use client';

/**
 * UrgentNotificationPopup — full-screen overlay for urgent/high-priority notifications.
 * Shows animated popup with sound + vibration for urgent events.
 * Integrates with useNotifications to auto-display urgent unread notifications.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type React from 'react';
import type { AppNotification, NotifPriority } from '@/lib/notifications';
import { Icon } from '@/components/Icon';

// ── Sound system (reuses shared AudioContext pattern from audio.ts) ──────────
let _popupAC: AudioContext | null = null;
function getPopupAC(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!_popupAC || _popupAC.state === 'closed') _popupAC = new Ctx();
  if (_popupAC.state === 'suspended') _popupAC.resume();
  return _popupAC;
}

function playUrgentSound() {
  const ctx = getPopupAC();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Attention-grab: 3 ascending tones
  [880, 1100, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = now + i * 0.15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.setValueAtTime(0.35, t + 0.08);
    g.gain.linearRampToValueAtTime(0, t + 0.14);
    o.start(t); o.stop(t + 0.15);
  });
}

function playHighSound() {
  const ctx = getPopupAC();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Soft double ding
  [660, 880].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = now + i * 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  });
}

function triggerVibration() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }
}

// ── Icon/color by notification type ─────────────────────────────────────────
const typeConfig: Record<string, { icon: React.ComponentProps<typeof Icon>['name']; color: string; bg: string }> = {
  new_offer:       { icon: 'money', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' },
  new_job_offer:   { icon: 'briefcase', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' },
  offer_accepted:  { icon: 'check', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  job_accepted:    { icon: 'check', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  offer_rejected:  { icon: 'x', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  status_change:   { icon: 'refresh', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  job_status:      { icon: 'clipboard', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  new_order:       { icon: 'package', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  new_market_order:{ icon: 'package', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' },
  new_job:         { icon: 'tool', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  commission:      { icon: 'money', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  wallet:          { icon: 'tag', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  rating:          { icon: 'star', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const defaultConfig = { icon: 'bell' as const, color: '#F5C518', bg: 'rgba(245,197,24,0.12)' };

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  /** New incoming notification from useNotifications realtime */
  notification: AppNotification | null;
  /** Called after user dismisses */
  onDismiss: () => void;
  variant?: 'driver';
  /** Enable/disable sounds (default true) */
  soundEnabled?: boolean;
}

export function UrgentNotificationPopup({ notification, onDismiss, variant, soundEnabled = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [animState, setAnimState] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIdRef = useRef<string | null>(null);

  const dismiss = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => {
      setVisible(false);
      setAnimState('entering');
      onDismiss();
    }, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (!notification) return;
    if (notification.id === prevIdRef.current) return; // dedup same notification
    prevIdRef.current = notification.id;

    const priority = notification.priority as NotifPriority;

    // Only show popup for urgent and high
    if (priority !== 'urgent' && priority !== 'high') return;

    setVisible(true);
    setAnimState('entering');
    // Short delay for animation
    requestAnimationFrame(() => setAnimState('visible'));

    // Sound + vibration
    if (soundEnabled) {
      if (priority === 'urgent') {
        playUrgentSound();
        triggerVibration();
      } else {
        playHighSound();
      }
    }

    // Auto-dismiss after 8s for urgent, 5s for high
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(dismiss, 1500);

    return () => clearTimeout(timerRef.current);
  }, [notification, soundEnabled, dismiss]);

  if (!visible || !notification) return null;

  const cfg = typeConfig[notification.type] || defaultConfig;
  const isDriver = variant === 'driver';

  return (
    <>
      {/* Sin fondo bloqueante: la pantalla sigue tocable (aceptar/rechazar) mientras se muestra el aviso */}
      {/* Popup card — slides in from top */}
      <div onClick={dismiss} style={{
        cursor: 'pointer',
        position: 'fixed',
        top: animState === 'visible'
          ? isDriver ? 'calc(env(safe-area-inset-top, 0px) + 128px)' : 16
          : isDriver ? -140 : -120,
        left: '50%',
        transform: 'translateX(-50%)',
        width: isDriver ? 'min(250px, calc(100vw - 32px))' : 'min(360px, calc(100vw - 32px))',
        background: 'var(--modal-bg)',
        border: `1.5px solid ${cfg.color}40`,
        borderRadius: isDriver ? 12 : 16,
        boxShadow: isDriver
          ? '0 4px 14px rgba(0,0,0,0.22)'
          : `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.color}20`,
        overflow: 'hidden',
        transition: 'top 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 9999,
      }}>
        {/* Priority indicator bar */}
        <div style={{
          height: isDriver ? 2 : 3,
          background: notification.priority === 'urgent'
            ? `linear-gradient(90deg, ${cfg.color}, #ef4444)`
            : cfg.color,
          animation: notification.priority === 'urgent' ? 'urgentPulse 1.5s ease-in-out infinite' : undefined,
        }} />

        <div style={{ padding: isDriver ? '6px 8px' : '14px 16px', display: 'flex', gap: isDriver ? 8 : 12, alignItems: 'center' }}>
          {/* Icon circle */}
          <div style={{
            width: isDriver ? 28 : 44,
            height: isDriver ? 28 : 44,
            borderRadius: isDriver ? 9 : 12,
            background: cfg.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: cfg.color,
            flexShrink: 0,
            animation: notification.priority === 'urgent' ? 'urgentBounce 0.6s ease' : undefined,
          }}>
            <Icon name={cfg.icon} size={isDriver ? 15 : 20} />
          </div>

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: 'var(--text-primary)',
              fontSize: isDriver ? '0.78rem' : undefined,
              fontWeight: isDriver ? 700 : undefined,
              lineHeight: 1.25,
              marginBottom: isDriver ? 1 : 2,
              ...(isDriver ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } : {}),
            }}>
              {notification.title}
            </div>
            <div style={{
              color: isDriver ? 'var(--text-secondary)' : '#9ca3af',
              fontSize: isDriver ? '0.68rem' : '0.78rem',
              lineHeight: 1.3,
              ...(isDriver ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}),
            }}>
              {notification.body}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={e => { e.stopPropagation(); dismiss(); }}
            style={{
              background: 'var(--glass-card)',
              width: isDriver ? 22 : 28,
              height: isDriver ? 22 : 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes urgentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes urgentBounce {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
