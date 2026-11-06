'use client';

import { useEffect, useState } from 'react';
import { checkAppUpdate, downloadAppUpdate } from '@/lib/driverMode';

/** Solo en el APK: avisa cuando hay una versión nueva y abre la descarga. */
export default function AppUpdateBanner() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    checkAppUpdate().then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, []);

  if (!url) return null;
  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', zIndex: 10050,
      background: '#111', color: '#fff', borderRadius: 14, padding: '10px 12px',
      display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
    }}>
      <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>Hay una nueva versión de TukiTask</span>
      <button onClick={() => void downloadAppUpdate(url)} style={{ background: '#FFD400', color: '#111', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 800, cursor: 'pointer' }}>
        Actualizar
      </button>
      <button onClick={() => setUrl(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
    </div>
  );
}
