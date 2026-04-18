'use client';

/**
 * UrgentNotificationPopup — full-screen overlay for urgent/high-priority notifications.
 * Shows animated popup with sound + vibration for urgent events.
 * Integrates with useNotifications to auto-display urgent unread notifications.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { AppNotification, NotifPriority } from '@/lib/notifications';

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
const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
  new_offer:       { icon: '💰', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' },
  new_job_offer:   { icon: '💼', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' },
  offer_accepted:  { icon: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  job_accepted:    { icon: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  offer_rejected:  { icon: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  status_change:   { icon: '🔄', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  job_status:      { icon: '📋', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  new_order:       { icon: '📦', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  new_job:         { icon: '🔧', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  commission:      { icon: '💵', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  wallet:          { icon: '👛', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  rating:          { icon: '⭐', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const defaultConfig = { icon: '🔔', color: '#F5C518', bg: 'rgba(245,197,24,0.12)' };

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  /** New incoming notification from useNotifications realtime */
  notification: AppNotification | null;
  /** Called after user dismisses */
  onDismiss: () => void;
  /** Enable/disable sounds (default true) */
  soundEnabled?: boolean;
}

export function UrgentNotificationPopup({ notification, onDismiss, soundEnabled = true }: Props) {
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
    timerRef.current = setTimeout(dismiss, priority === 'urgent' ? 8000 : 5000);

    return () => clearTimeout(timerRef.current);
  }, [notification, soundEnabled, dismiss]);

  if (!visible || !notification) return null;

  const cfg = typeConfig[notification.type] || defaultConfig;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: animState === 'visible' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
          transition: 'background 0.3s ease',
          zIndex: 9998,
        }}
      />
      {/* Popup card — slides in from top */}
      <div style={{
        position: 'fixed',
        top: animState === 'visible' ? 16 : -120,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, calc(100vw - 32px))',
        background: 'var(--modal-bg)',
        border: `1.5px solid ${cfg.color}40`,
        borderRadius: 16,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.color}20`,
        overflow: 'hidden',
        transition: 'top 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 9999,
      }}>
        {/* Priority indicator bar */}
        <div style={{
          height: 3,
          background: notification.priority === 'urgent'
            ? `linear-gradient(90deg, ${cfg.color}, #ef4444)`
            : cfg.color,
          animation: notification.priority === 'urgent' ? 'urgentPulse 1.5s ease-in-out infinite' : undefined,
        }} />

        <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Icon circle */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: cfg.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0,
            animation: notification.priority === 'urgent' ? 'urgentBounce 0.6s ease' : undefined,
          }}>
            {cfg.icon}
          </div>

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              marginBottom: 2,
            }}>
              {notification.title}
            </div>
            <div style={{
              color: '#9ca3af',
              fontSize: '0.78rem',
              lineHeight: 1.35,
            }}>
              {notification.body}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={dismiss}
            style={{
              background: 'var(--glass-card)',
              width: 28,
              height: 28,
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
