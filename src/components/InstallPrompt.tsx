'use client';
/**
 * InstallPrompt — "Agregar a pantalla de inicio"
 *
 * Shows a native-looking install banner:
 * - Android/Chrome: listens for `beforeinstallprompt` and shows one-tap install
 * - iOS Safari: detects standalone check and shows manual instructions
 *
 * Import and render inside any layout or page.
 * The banner auto-dismisses after install or after being closed once (persisted in localStorage).
 */
import { useEffect, useState, useCallback } from 'react';

type Mode = 'android' | 'ios' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'tuki_pwa_dismissed_until';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function wasDismissedRecently() {
  try {
    const until = Number(localStorage.getItem(DISMISSED_KEY) || '0');
    return Date.now() < until;
  } catch { return false; }
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandalone() {
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosStep, setIosStep] = useState(false);

  useEffect(() => {
    // Already installed or user dismissed recently
    if (typeof window === 'undefined') return;
    if (isInStandalone()) return;
    if (wasDismissedRecently()) return;

    if (isIOS()) {
      setMode('ios');
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode('android');
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Snooze for 7 days — after that (or after uninstalling) the banner reappears
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now() + DISMISS_TTL_MS)); } catch {}
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      // Clear snooze — isInStandalone() will suppress banner after install
      try { localStorage.removeItem(DISMISSED_KEY); } catch {}
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (!visible) return null;

  /* ── Android / Chrome banner ──────────────────────────────────────────── */
  if (mode === 'android') {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: '#1e293b',
        borderTop: '1px solid rgba(245,197,24,0.25)',
        borderRadius: '20px 20px 0 0',
        padding: '16px 20px calc(16px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', alignItems: 'center', gap: 14,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        animation: 'tuki-slide-up 0.3s ease',
      }}>
        <img src="/icons/icon-96x96.png" alt=""
          style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem', marginBottom: 2 }}>
            Instalar TukiTask
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Acceso rápido desde tu pantalla de inicio
          </div>
        </div>
        <button onClick={install} style={{
          background: '#F5C518', color: '#0f0f1a', border: 'none',
          borderRadius: 50, padding: '9px 18px', fontWeight: 700,
          fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Instalar
        </button>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none', color: '#64748b',
          cursor: 'pointer', fontSize: '1.2rem', padding: '4px', lineHeight: 1,
          flexShrink: 0,
        }}>✕</button>
      </div>
    );
  }

  /* ── iOS Safari banner ────────────────────────────────────────────────── */
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1e293b',
      borderTop: '1px solid rgba(245,197,24,0.25)',
      borderRadius: '20px 20px 0 0',
      padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
      boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      animation: 'tuki-slide-up 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <img src="/icons/icon-96x96.png" alt=""
          style={{ width: 48, height: 48, borderRadius: 10 }} />
        <div>
          <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>Instalar TukiTask</div>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Agregar a pantalla de inicio</div>
        </div>
        <button onClick={dismiss} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: '#64748b', cursor: 'pointer', fontSize: '1.2rem',
        }}>✕</button>
      </div>

      {!iosStep ? (
        <div>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: 14, lineHeight: 1.5 }}>
            Toca <strong style={{ color: '#F5C518' }}>Compartir</strong> en Safari y luego "Agregar a inicio".
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <div style={{
              background: 'rgba(255,255,255,0.07)', borderRadius: 12,
              padding: '10px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '1.5rem' }}>⬆️</span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>1. Compartir</span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.07)', borderRadius: 12,
              padding: '10px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '1.5rem' }}>➕</span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>2. Agregar</span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.07)', borderRadius: 12,
              padding: '10px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '1.5rem' }}>📱</span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>3. Listo</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
