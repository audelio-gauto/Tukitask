import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '16px',
      background: '#0f0f0f',
      color: '#fff',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '4rem', lineHeight: 1 }}>🔍</div>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
        Página no encontrada
      </h1>
      <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: 0, maxWidth: 280 }}>
        La dirección que buscás no existe o fue movida.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: '10px 28px',
          borderRadius: 12,
          background: '#F5C518',
          color: '#1C1C2E',
          fontWeight: 800,
          fontSize: '0.9rem',
          textDecoration: 'none',
        }}
      >
        Volver al inicio
      </Link>
    </div>
  );
}
