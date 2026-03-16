'use client';
import DriverScreenLayout from '../components/DriverScreenLayout';

export default function DeliveredPage() {
  return (
    <DriverScreenLayout title="Entregados">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Entregados Hoy</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Pedidos que has entregado exitosamente hoy.
      </p>

      <div className="tuki-order-card">
        <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>✅</span>
          <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>
            Aún no has completado entregas hoy
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Las entregas completadas aparecerán aquí
          </p>
        </div>
      </div>
    </DriverScreenLayout>
  );
}
