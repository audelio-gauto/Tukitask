'use client';
import { useEffect } from 'react';

export default function DriverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Driver Error]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '16px',
      background: 'var(--page-bg, #0f0f0f)',
      color: 'var(--text-primary, #fff)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
        Algo salió mal
      </h2>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #94a3b8)', maxWidth: 300, margin: 0 }}>
        Ocurrió un error inesperado. Por favor intentá de nuevo.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '12px 28px',
          borderRadius: 12,
          border: 'none',
          background: '#F5C518',
          color: '#000',
          fontWeight: 800,
          fontSize: '0.95rem',
          cursor: 'pointer',
        }}
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
