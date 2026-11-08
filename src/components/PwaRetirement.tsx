'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

const LEGACY_WORKERS = new Set(['/sw.js', '/firebase-messaging-sw.js']);

function subscribeDisplayMode(onChange: () => void): () => void {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isInstalledWebApp(): boolean {
  return !Capacitor.isNativePlatform() && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function retireLegacyPwa(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const workers = [registration.active, registration.waiting, registration.installing];
      const isLegacy = workers.some(worker => {
        if (!worker) return false;
        const url = new URL(worker.scriptURL);
        return url.origin === location.origin && LEGACY_WORKERS.has(url.pathname);
      });
      if (isLegacy && !await registration.unregister()) {
        console.warn('[pwa-retirement] No se pudo desregistrar un service worker antiguo.');
      }
    }
  }
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('tuki-cache-')).map(name => caches.delete(name)));
  }
}

export function PwaRetirement() {
  const installed = useSyncExternalStore(subscribeDisplayMode, isInstalledWebApp, () => false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void retireLegacyPwa().catch(error => console.error('[pwa-retirement] Falló la limpieza:', error));
  }, []);

  if (!installed || dismissed) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <aside role="status" style={{ position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 11000, maxWidth: 560, margin: 'auto', padding: 16, borderRadius: 16, background: '#111827', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.4)' }}>
      <strong>La aplicación web instalada se está retirando</strong>
      <p style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.5 }}>
        {ios
          ? 'El APK solo funciona en Android. En iPhone podés seguir usando TukiTask desde el navegador.'
          : 'Para seguir usando TukiTask en Android, descargá e instalá la aplicación APK. También podés usar el navegador.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {!ios && <a href="/app-update/TukiTask.apk" style={{ color: '#f5c518', fontWeight: 700 }}>Descargar APK para Android</a>}
        <button type="button" onClick={() => setDismissed(true)} style={{ color: '#fff', textDecoration: 'underline' }}>Cerrar aviso</button>
      </div>
    </aside>
  );
}
