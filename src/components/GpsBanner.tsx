'use client';
import { useEffect, useState } from 'react';

// Avisa al driver cuando el permiso de ubicación está bloqueado (no puede recibir ni navegar servicios sin GPS)
export default function GpsBanner() {
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const sync = () => { if (status) setDenied(status.state === 'denied'); };
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(s => {
      if (cancelled) return;
      status = s;
      sync();
      s.addEventListener('change', sync);
    }).catch(() => {});
    return () => { cancelled = true; status?.removeEventListener('change', sync); };
  }, []);

  if (!denied) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998,
        padding: '10px 16px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 700,
        background: '#d97706', color: '#fff', boxShadow: '0 2px 12px rgba(217,119,6,0.45)',
      }}
    >
      📍 Ubicación desactivada. Activá el GPS y el permiso de ubicación para recibir y navegar servicios.
    </div>
  );
}
