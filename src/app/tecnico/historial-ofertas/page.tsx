'use client';
import { useEffect, useState } from 'react';
import { useWorkerContext } from '../../driver/context';
import { TecnicoOffer } from '@/types';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';
import { Icon } from '@/components/Icon';

export default function HistorialOfertasTecnico() {
  const { email } = useWorkerContext();
  const [offers, setOffers] = useState<TecnicoOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    fetch(`/api/tecnico/jobs?tecnico_email=${encodeURIComponent(email)}&all_offers=true`)
      .then(r => r.json())
      .then(data => {
        setOffers(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, [email]);

  return (
    <DriverScreenLayout title="Ofertas">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Historial de Ofertas Enviadas</h2>
      {loading && <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>}
      {!loading && offers.length === 0 && (
        <div className="tuki-card" style={{ textAlign: 'center' }}>
          <div className="tuki-card-body" style={{ padding: '2.5rem 1.5rem' }}>
            <Icon name="clipboard" size={40} style={{ opacity: 0.35 }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontWeight: 600 }}>No has enviado ofertas aun.</p>
          </div>
        </div>
      )}
      {!loading && offers.map(of => (
        <div key={of.id} className="tuki-card" style={{ marginBottom: 10 }}>
          <div className="tuki-card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{of.tecnico_name || of.tecnico_email}</div>
            <div className="tuki-price">₲{Number(of.proposed_price).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </DriverScreenLayout>
  );
}
