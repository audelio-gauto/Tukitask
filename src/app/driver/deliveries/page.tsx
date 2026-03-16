'use client';
import DriverScreenLayout from '../components/DriverScreenLayout';

export default function DeliveriesPage() {
  return (
    <DriverScreenLayout title="Envíos">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Solicitudes de Envío</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Aquí aparecerán las solicitudes de envío de paquetes cercanas.
      </p>

      {/* Empty state */}
      <div className="tuki-order-card">
        <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>📦</span>
          <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>
            No hay envíos pendientes
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Las nuevas solicitudes aparecerán aquí automáticamente
          </p>
        </div>
      </div>
    </DriverScreenLayout>
  );
}
