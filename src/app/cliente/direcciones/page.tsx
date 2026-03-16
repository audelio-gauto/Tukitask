'use client';
import ClientScreenLayout from '../components/ClientScreenLayout';

export default function DireccionesPage() {
  return (
    <ClientScreenLayout title="Mis Direcciones">
      <div className="client-empty">
        <div className="client-empty-icon">📍</div>
        <p className="client-empty-text">No tienes direcciones guardadas</p>
        <p className="client-empty-sub">Guarda tus direcciones frecuentes para envíos más rápidos</p>
      </div>
    </ClientScreenLayout>
  );
}
