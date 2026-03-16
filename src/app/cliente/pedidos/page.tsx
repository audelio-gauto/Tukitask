'use client';
import ClientScreenLayout from '../components/ClientScreenLayout';

export default function PedidosPage() {
  return (
    <ClientScreenLayout title="Mis Pedidos">
      <div className="client-empty">
        <div className="client-empty-icon">🛒</div>
        <p className="client-empty-text">No tienes pedidos</p>
        <p className="client-empty-sub">Tus pedidos del marketplace aparecerán aquí</p>
      </div>
    </ClientScreenLayout>
  );
}
