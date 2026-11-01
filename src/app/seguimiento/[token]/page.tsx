'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Share {
  status: string;
  live: boolean;
  pickup_address: string | null;
  delivery_address: string | null;
  driver: { name: string | null; plate: string | null; vehicle: string | null } | null;
  location: { lat: number; lng: number; updated_at: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Conductor asignado',
  picking_up: 'Va hacia la recogida',
  at_pickup: 'Llegó a la recogida',
  in_transit: 'En camino al destino',
  returning: 'En camino',
  driver_returning: 'En camino',
  delivered: 'Viaje finalizado',
};

export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Share | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/trip-share?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (stop) return;
        if (!res.ok) { setError(res.status === 410 ? 'Este enlace ya venció.' : 'Enlace no válido.'); return; }
        setData(await res.json());
        setError('');
      } catch { /* reintenta en el próximo ciclo */ }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [token]);

  const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 12 };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '8px 0 14px' }}>Seguimiento de viaje · Tukitask</h1>
        {error && <div style={card}>{error}</div>}
        {!error && !data && <div style={card}>Cargando…</div>}
        {data && (
          <>
            <div style={card}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>ESTADO</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{STATUS_LABEL[data.status] ?? (data.live ? 'En curso' : 'Viaje finalizado')}</div>
              {!data.live && <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>El seguimiento en vivo ya terminó.</div>}
            </div>
            {data.driver && (
              <div style={card}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>CONDUCTOR</div>
                <div style={{ fontWeight: 800 }}>{data.driver.name ?? 'Conductor'}</div>
                <div style={{ color: '#374151', fontSize: '0.9rem' }}>
                  {[data.driver.vehicle, data.driver.plate].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            <div style={card}>
              {data.pickup_address && <div style={{ marginBottom: 8 }}><b>Origen:</b> {data.pickup_address}</div>}
              {data.delivery_address && <div><b>Destino:</b> {data.delivery_address}</div>}
            </div>
            {data.live && data.location && (
              <a
                href={`https://www.google.com/maps?q=${data.location.lat},${data.location.lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ ...card, display: 'block', textAlign: 'center', fontWeight: 800, color: '#2563eb', textDecoration: 'none' }}
              >
                📍 Ver ubicación en vivo del conductor
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
