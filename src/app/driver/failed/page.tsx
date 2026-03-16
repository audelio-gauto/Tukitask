'use client';
import DriverScreenLayout from '../components/DriverScreenLayout';

export default function FailedPage() {
  return (
    <DriverScreenLayout title="Fallidos">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Fallidos Hoy</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Entregas que no pudieron completarse hoy.
      </p>

      <div className="tuki-order-card">
        <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>❌</span>
          <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>
            No hay entregas fallidas hoy
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Las entregas fallidas aparecerán aquí
          </p>
        </div>
      </div>
    </DriverScreenLayout>
  );
}
