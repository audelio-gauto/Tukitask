'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

/* ── Web Audio notification ── */
let _ac: AudioContext | null = null;
function getAC() {
  if (typeof window === 'undefined') return null;
  if (!_ac || _ac.state === 'closed') _ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}
function tone(f: number, t: number, d: number, v = 0.22) {
  const c = getAC(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.02);
  g.gain.setValueAtTime(v, t + d * 0.7);
  g.gain.linearRampToValueAtTime(0.001, t + d);
  o.start(t); o.stop(t + d);
}
function playOrderAlert() {
  try {
    const c = getAC(); if (!c) return;
    const n = c.currentTime;
    for (let g = 0; g < 3; g++) {
      const t = n + g * 2.3;
      tone(880, t, 0.15); tone(880, t + 0.25, 0.15); tone(1100, t + 0.55, 0.35);
    }
  } catch { /* no audio */ }
}
function playAccepted() {
  try {
    const c = getAC(); if (!c) return;
    const n = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, n + i * 0.18, 0.35, 0.28));
  } catch { /* no audio */ }
}

export default function DeliveriesPage() {
  const { serviceFilters, email, displayName, profilePhoto } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerAmounts, setOfferAmounts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sentOffers, setSentOffers] = useState<Record<string, number>>({});
  const [acceptedJobs, setAcceptedJobs] = useState<any[]>([]);

  // Sound refs
  const prevOrderIds = useRef<Set<string>>(new Set());
  const prevAcceptedIds = useRef<Set<string>>(new Set());
  const soundTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Fetch pending/negotiating orders ── */
  const fetchOrders = useCallback(() => {
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setOrders(data);
        const ids = new Set(data.map((o: any) => o.id as string));
        if (prevOrderIds.current.size > 0) {
          for (const id of ids) {
            if (!prevOrderIds.current.has(id)) { playOrderAlert(); break; }
          }
        }
        prevOrderIds.current = ids;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /* ── Fetch my offers (pending + accepted with embedded order) ── */
  const fetchMyOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const pending: Record<string, number> = {};
        const accepted: any[] = [];
        for (const o of data) {
          if (o.status === 'pending' && o.order_id) pending[o.order_id] = Number(o.amount);
          if (o.status === 'accepted' && o.orders) {
            accepted.push({ ...o.orders, _offerAmount: Number(o.amount), _offerId: o.id });
            if (!prevAcceptedIds.current.has(o.id)) playAccepted();
          }
        }
        setSentOffers(pending);
        setAcceptedJobs(accepted);
        prevAcceptedIds.current = new Set(accepted.map((a: any) => a._offerId));
      })
      .catch(() => {});
  }, [email]);

  /* ── Polling ── */
  useEffect(() => {
    fetchOrders(); fetchMyOffers();
    const iv = setInterval(() => { fetchOrders(); fetchMyOffers(); }, 8000);
    return () => clearInterval(iv);
  }, [fetchOrders, fetchMyOffers]);

  const filteredOrders = useMemo(() =>
    orders.filter(o => { const fk = VEHICLE_TO_FILTER[o.vehicle_type]; return !fk || serviceFilters[fk]; }),
  [orders, serviceFilters]);

  const unrespondedCount = useMemo(() =>
    filteredOrders.filter(o => !sentOffers[o.id]).length,
  [filteredOrders, sentOffers]);

  /* ── Repeat alert every 6s while unresponded orders exist ── */
  useEffect(() => {
    if (soundTimer.current) { clearInterval(soundTimer.current); soundTimer.current = null; }
    if (!loading && unrespondedCount > 0) {
      soundTimer.current = setInterval(playOrderAlert, 6000);
    }
    return () => { if (soundTimer.current) clearInterval(soundTimer.current); };
  }, [loading, unrespondedCount]);

  /* ── Actions ── */
  const handleSendOffer = async (orderId: string) => {
    const amount = offerAmounts[orderId];
    if (!amount || Number(amount) <= 0) return;
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId, driver_email: email,
          driver_name: displayName, driver_photo: profilePhoto,
          amount: Number(amount),
        }),
      });
      if (res.ok) {
        setSentOffers(s => ({ ...s, [orderId]: Number(amount) }));
        setOfferAmounts(o => ({ ...o, [orderId]: '' }));
      }
    } catch { /* noop */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleAcceptPrice = async (orderId: string, clientOffer: number) => {
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId, driver_email: email,
          driver_name: displayName, driver_photo: profilePhoto,
          amount: clientOffer,
        }),
      });
      if (res.ok) setSentOffers(s => ({ ...s, [orderId]: clientOffer }));
    } catch { /* noop */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  return (
    <DriverScreenLayout title="Envíos">
      {/* ── Accepted jobs (client accepted your offer) ── */}
      {acceptedJobs.map(job => (
        <div key={job.id} className="tuki-order-card" style={{
          marginBottom: 16, border: '2px solid #10b981',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', padding: '0.75rem 1rem', fontWeight: 700,
            fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8,
            borderRadius: '12px 12px 0 0',
          }}>
            <span style={{ fontSize: '1.3rem' }}>✅</span>
            ¡Solicitud Aceptada!
          </div>
          <div className="tuki-order-body" style={{ padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>
              {VEHICLE_LABELS[job.vehicle_type] || job.vehicle_type}
            </div>
            <div className="tuki-route-line" style={{ marginBottom: 12 }}>
              <div className="tuki-route-point pickup">
                <div className="tuki-route-meta">Recoger</div>
                <div className="tuki-route-address">{job.pickup_address}</div>
              </div>
              <div className="tuki-route-point delivery">
                <div className="tuki-route-meta">Entregar</div>
                <div className="tuki-route-address">{job.delivery_address}</div>
              </div>
            </div>
            {job.instructions && (
              <div style={{ background: '#fff', padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: 10, fontSize: '0.85rem', color: '#6366f1' }}>
                📝 {job.instructions}
              </div>
            )}
            <div style={{
              background: '#fff', borderRadius: 12, padding: '0.75rem 1rem',
              textAlign: 'center', marginBottom: 12,
            }}>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Precio acordado</div>
              <div style={{ fontWeight: 800, color: '#059669', fontSize: '1.4rem' }}>
                {Number(job._offerAmount || job.offer || 0).toLocaleString()} Gs
              </div>
            </div>
            {job.client_email && (
              <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: 8, textAlign: 'center' }}>
                📞 Cliente: {job.client_email}
              </div>
            )}
            <a href="/driver/en-ruta" className="tuki-btn tuki-btn-success" style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              fontSize: '1rem', padding: '0.85rem',
            }}>
              🚀 Ir a Recoger
            </a>
          </div>
        </div>
      ))}

      {/* ── Pending orders heading ── */}
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Solicitudes de Envío</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Enviá tu oferta al cliente. El cliente elegirá entre las ofertas recibidas.
      </p>

      {loading && <div style={{ padding: 32, textAlign: 'center' }}>Cargando...</div>}
      {!loading && filteredOrders.length === 0 && acceptedJobs.length === 0 && (
        <div className="tuki-order-card">
          <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>📦</span>
            <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>No hay envíos pendientes</p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Las nuevas solicitudes aparecerán aquí según tus filtros
            </p>
          </div>
        </div>
      )}

      {filteredOrders.map(req => {
        const alreadyOffered = sentOffers[req.id];
        const isSending = sending[req.id];
        return (
          <div key={req.id} className="tuki-order-card" style={{ marginBottom: 16 }}>
            <div className="tuki-order-header" style={{ padding: '0.75rem 1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                {new Date(req.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="tuki-order-body" style={{ padding: '1rem' }}>
              <div className="tuki-route-line" style={{ marginBottom: 12 }}>
                <div className="tuki-route-point pickup">
                  <div className="tuki-route-meta">Recoger</div>
                  <div className="tuki-route-address">{req.pickup_address}</div>
                </div>
                <div className="tuki-route-point delivery">
                  <div className="tuki-route-meta">Entregar</div>
                  <div className="tuki-route-address">{req.delivery_address}</div>
                </div>
              </div>

              {req.instructions && (
                <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: 12, fontSize: '0.85rem', color: '#6366f1' }}>
                  📝 {req.instructions}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 10, padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Precio sugerido</div>
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: '1.05rem' }}>
                    {Number(req.suggested_price || 0).toLocaleString()} Gs
                  </div>
                </div>
                <div style={{ flex: 1, background: '#fffbeb', borderRadius: 10, padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Oferta cliente</div>
                  <div style={{ fontWeight: 700, color: '#d97706', fontSize: '1.05rem' }}>
                    {Number(req.offer || 0).toLocaleString()} Gs
                  </div>
                </div>
              </div>

              {alreadyOffered ? (
                <div style={{ background: '#eef2ff', borderRadius: 12, padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6366f1', marginBottom: 2 }}>Tu oferta enviada</div>
                  <div style={{ fontWeight: 800, color: '#4f46e5', fontSize: '1.2rem' }}>
                    {alreadyOffered.toLocaleString()} Gs
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                    Esperando respuesta del cliente...
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    className="tuki-btn tuki-btn-success"
                    style={{ marginBottom: 8 }}
                    onClick={() => handleAcceptPrice(req.id, Number(req.offer || req.suggested_price))}
                    disabled={isSending}
                  >
                    {isSending ? 'Enviando...' : `Aceptar por ${Number(req.offer || req.suggested_price || 0).toLocaleString()} Gs`}
                  </button>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        className="tuki-form-input"
                        placeholder="Tu contraoferta"
                        value={offerAmounts[req.id] || ''}
                        onChange={e => setOfferAmounts(o => ({ ...o, [req.id]: e.target.value }))}
                        min="0"
                        style={{ paddingRight: '2rem' }}
                      />
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.82rem' }}>Gs</span>
                    </div>
                    <button
                      className="tuki-btn tuki-btn-primary"
                      style={{ width: 'auto', padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleSendOffer(req.id)}
                      disabled={isSending || !offerAmounts[req.id]}
                    >
                      Ofertar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}
