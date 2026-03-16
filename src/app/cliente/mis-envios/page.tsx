'use client';
import Link from 'next/link';
import ClientScreenLayout from '../components/ClientScreenLayout';

export default function MisEnviosPage() {
  return (
    <ClientScreenLayout title="Mis Envíos">
      <div className="client-empty">
        <div className="client-empty-icon">📦</div>
        <p className="client-empty-text">No tienes envíos activos</p>
        <p className="client-empty-sub">Cuando solicites un envío, aparecerá aquí</p>
        <Link href="/cliente/enviar" className="client-btn client-btn-success" style={{ marginTop: '1.5rem' }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          Enviar Paquete
        </Link>
      </div>
    </ClientScreenLayout>
  );
}
