'use client';
import { useEffect, useState } from 'react';
import { useDriverContext } from '../context';
import { DriverOffer } from '@/types';
import { authFetch } from '@/lib/authFetch';

export default function HistorialOfertasDriver() {
  const { email } = useDriverContext();
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    authFetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}&all=true`)
      .then(r => r.json())
      .then(data => {
        setOffers(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [email]);

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 18 }}>Historial de Ofertas Enviadas</h2>
      {loading && <div>Cargando...</div>}
      {!loading && offers.length === 0 && <div style={{ color: '#64748b' }}>No has enviado ofertas aún.</div>}
      {!loading && offers.map(of => (
        <div key={of.id} style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9' }}>Pedido: {of.order_id}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{of.driver_email}</div>
            </div>
            <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1.1rem' }}>₲{Number(of.amount).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#a3a3a3' }}>Estado: <b>{of.status}</b></div>
        </div>
      ))}
    </div>
  );
}
