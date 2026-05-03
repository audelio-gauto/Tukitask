'use client';
import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Admin Error]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '60dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '12px',
      color: '#fff',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
        Error en el panel admin
      </h2>
      <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
        {error?.message || 'Ocurrió un error inesperado.'}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '9px 24px',
          borderRadius: 10,
          border: 'none',
          background: '#F5C518',
          color: '#1C1C2E',
          fontWeight: 800,
          fontSize: '0.9rem',
          cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
