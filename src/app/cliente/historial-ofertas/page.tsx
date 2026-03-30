'use client';
import { useEffect, useState } from 'react';
import { useClientContext } from '../context';
import { DriverOffer, TecnicoJobOffer } from '@/types';

export default function HistorialOfertasCliente() {
  const { email } = useClientContext();
  const [driverOffers, setDriverOffers] = useState<DriverOffer[]>([]);
  const [jobOffers, setJobOffers] = useState<TecnicoJobOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/orders/offers?client_email=${encodeURIComponent(email)}`).then(r => r.json()),
      fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&all_offers=true`).then(r => r.json()),
    ]).then(([driverData, jobData]) => {
      setDriverOffers(Array.isArray(driverData) ? driverData : []);
      setJobOffers(Array.isArray(jobData) ? jobData : []);
      setLoading(false);
    });
  }, [email]);

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 18 }}>Historial de Ofertas</h2>
      {loading && <div>Cargando...</div>}
      {!loading && (
        <>
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', margin: '18px 0 8px' }}>Envíos</h3>
          {driverOffers.length === 0 && <div style={{ color: '#64748b' }}>No hay ofertas de envíos.</div>}
          {driverOffers.map(of => (
            <div key={of.id} style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{of.driver_name || 'Conductor'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{of.driver_email}</div>
                </div>
                <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1.1rem' }}>₲{Number(of.amount).toLocaleString()}</div>
              </div>
              <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#a3a3a3' }}>Estado: <b>{of.status}</b></div>
            </div>
          ))}

          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', margin: '18px 0 8px' }}>Servicios</h3>
          {jobOffers.length === 0 && <div style={{ color: '#64748b' }}>No hay ofertas de servicios.</div>}
          {jobOffers.map(of => (
            <div key={of.id} style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{of.tecnico_name || 'Técnico'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{of.tecnico_email}</div>
                </div>
                <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1.1rem' }}>₲{Number(of.proposed_price).toLocaleString()}</div>
              </div>
              <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#a3a3a3' }}>Estado: <b>{of.status}</b></div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
