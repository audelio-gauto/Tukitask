'use client';

import { useEffect, useState, useMemo } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';

/** Pretty labels for vehicle_type values */
const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

export default function DeliveriesPage() {
  const { serviceFilters } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<{ [id: string]: string }>({});
  const [accepted, setAccepted] = useState<{ [id: string]: boolean }>({});

  useEffect(() => {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => {
        setOrders(data || []);
        setLoading(false);
      });
  }, []);

  // Filter orders based on driver's active service filters
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const filterKey = VEHICLE_TO_FILTER[o.vehicle_type];
      // If no mapping found, show the order (don't hide unknown types)
      if (!filterKey) return true;
      return serviceFilters[filterKey] === true;
    });
  }, [orders, serviceFilters]);

  const handleOffer = (id: string) => {
    alert(`Oferta enviada: Gs ${offer[id] || ''}`);
    setAccepted(a => ({ ...a, [id]: true }));
  };
  const handleAccept = (id: string, price: number) => {
    alert(`Aceptaste el envío por Gs ${price}`);
    setAccepted(a => ({ ...a, [id]: true }));
  };

  return (
    <DriverScreenLayout title="Envíos">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Solicitudes de Envío</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Aquí aparecen las solicitudes de envío de paquetes cercanas.
      </p>

      {loading && <div style={{ padding: 32, textAlign: 'center' }}>Cargando...</div>}
      {!loading && filteredOrders.length === 0 && (
        <div className="tuki-order-card">
          <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>📦</span>
            <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>
              No hay envíos pendientes
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Las nuevas solicitudes aparecerán aquí según tus filtros activos
            </p>
          </div>
        </div>
      )}

      {filteredOrders.map(req => (
        <div key={req.id} className="tuki-order-card" style={{ marginBottom: 24, opacity: accepted[req.id] ? 0.5 : 1 }}>
          <div className="tuki-order-body">
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>De: {req.pickup_address}</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>A: {req.delivery_address}</div>
            <div style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: 4 }}>{VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type}</div>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>Precio sugerido: {Number(req.suggested_price || 0).toLocaleString()} Gs <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.95rem' }}>(solo guía)</span></div>
            <div style={{ color: '#f59e42', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Oferta del cliente: {Number(req.offer || 0).toLocaleString()} Gs</div>
            {req.instructions && <div style={{ color: '#6366f1', marginBottom: 8 }}>Nota: {req.instructions}</div>}
            {!accepted[req.id] ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <button className="tuki-btn tuki-btn-primary" onClick={() => handleAccept(req.id, req.offer)}>Aceptar por {Number(req.offer || 0).toLocaleString()} Gs</button>
                <input
                  type="number"
                  className="tuki-field-input"
                  placeholder="Tu oferta"
                  style={{ width: 110 }}
                  value={offer[req.id] || ''}
                  onChange={e => setOffer(o => ({ ...o, [req.id]: e.target.value }))}
                  min="0"
                  disabled={accepted[req.id]}
                />
                <button className="tuki-btn tuki-btn-secondary" onClick={() => handleOffer(req.id)} disabled={!offer[req.id] || accepted[req.id]}>Ofertar</button>
              </div>
            ) : (
              <div style={{ color: '#10b981', fontWeight: 600, marginTop: 8 }}>Solicitud enviada</div>
            )}
          </div>
        </div>
      ))}
    </DriverScreenLayout>
  );
}
