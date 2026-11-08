'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AppNotification } from '@/lib/notifications';

interface Props {
  notification: AppNotification;
  error: string | null;
  onClose: () => void;
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
  onNavigate?: () => void;
}

export function NotificationDetail({ notification, error, onClose, onNavigate, fallbackFocusRef }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallback = fallbackFocusRef.current;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!dialog?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [onClose, fallbackFocusRef]);

  const date = new Date(notification.created_at);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))', background: 'rgba(0,0,0,0.65)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="notification-detail-title" aria-describedby="notification-detail-body" style={{ width: 'min(100%, 440px)', maxHeight: 'min(80dvh, 640px)', overflowY: 'auto', background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 6 }}>Notificación</p>
            <h2 id="notification-detail-title" style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{notification.title}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar notificación" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--glass-card)', color: 'var(--text-primary)', fontSize: '1.3rem' }}>×</button>
        </div>
        {!Number.isNaN(date.getTime()) && <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{date.toLocaleString('es-PY')}</p>}
        <p id="notification-detail-body" style={{ marginTop: 18, color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notification.body}</p>
        {error && <p role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 10, marginTop: 16, fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
          {onNavigate && <button type="button" onClick={onNavigate} style={{ background: '#F5C518', color: '#172033', borderRadius: 10, padding: '10px 16px', fontWeight: 700 }}>Ir a la sección</button>}
          <button type="button" onClick={onClose} style={{ background: 'var(--glass-card)', color: 'var(--text-primary)', borderRadius: 10, padding: '10px 16px', fontWeight: 600 }}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}
