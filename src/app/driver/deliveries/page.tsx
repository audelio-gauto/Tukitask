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

/* ── Web Audio ── */
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
  try { const c = getAC(); if (!c) return; const n = c.currentTime;
    for (let g = 0; g < 3; g++) { const t = n + g * 2.3; tone(880, t, 0.15); tone(880, t + 0.25, 0.15); tone(1100, t + 0.55, 0.35); }
  } catch { /* */ }
}
function playAccepted() {
  try { const c = getAC(); if (!c) return; const n = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, n + i * 0.18, 0.35, 0.28));
  } catch { /* */ }
}

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function DeliveriesPage() {
  const { serviceFilters, email, displayName, profilePhoto } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerAmounts, setOfferAmounts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sentOffers, setSentOffers] = useState<Record<string, number>>({});
  const [activeJob, setActiveJob] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);

  const prevOrderIds = useRef<Set<string>>(new Set());
  const prevAccepted = useRef(false);
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
          for (const id of ids) { if (!prevOrderIds.current.has(id)) { playOrderAlert(); break; } }
        }
        prevOrderIds.current = ids;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /* ── Fetch my active job (accepted/picking_up/in_transit) ── */
  const fetchActiveJob = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) {
          setActiveJob(null);
          return;
        }
        const job = data[0];
        if (!prevAccepted.current && job.status === 'accepted') playAccepted();
        prevAccepted.current = !!job;
        setActiveJob(job);
      })
      .catch(() => {});
  }, [email]);

  /* ── Fetch my offers ── */
  const fetchMyOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const pending: Record<string, number> = {};
        for (const o of data) {
          if (o.status === 'pending' && o.order_id) pending[o.order_id] = Number(o.amount);
          if (o.status === 'accepted' && o.orders && !activeJob) {
            setActiveJob(o.orders);
            if (!prevAccepted.current) playAccepted();
            prevAccepted.current = true;
          }
        }
        setSentOffers(pending);
      })
      .catch(() => {});
  }, [email, activeJob]);

  useEffect(() => {
    fetchOrders(); fetchMyOffers(); fetchActiveJob();
    const iv = setInterval(() => { fetchOrders(); fetchMyOffers(); fetchActiveJob(); }, 8000);
    return () => clearInterval(iv);
  }, [fetchOrders, fetchMyOffers, fetchActiveJob]);

  const filteredOrders = useMemo(() =>
    orders.filter(o => { const fk = VEHICLE_TO_FILTER[o.vehicle_type]; return !fk || serviceFilters[fk]; }),
  [orders, serviceFilters]);

  const unrespondedCount = useMemo(() =>
    filteredOrders.filter(o => !sentOffers[o.id]).length,
  [filteredOrders, sentOffers]);

  useEffect(() => {
    if (soundTimer.current) { clearInterval(soundTimer.current); soundTimer.current = null; }
    if (!loading && unrespondedCount > 0 && !activeJob) {
      soundTimer.current = setInterval(playOrderAlert, 6000);
    }
    return () => { if (soundTimer.current) clearInterval(soundTimer.current); };
  }, [loading, unrespondedCount, activeJob]);

  /* ── Status transitions ── */
  const handleTransition = async (orderId: string, newStatus: string) => {
    setTransitioning(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus, driver_email: email }),
      });
      if (res.ok) {
        if (newStatus === 'delivered') {
          playAccepted();
          setActiveJob(null);
          prevAccepted.current = false;
        } else {
          setActiveJob((j: any) => j ? { ...j, status: newStatus } : j);
        }
      }
    } catch { /* */ }
    setTransitioning(false);
  };

  const handleSendOffer = async (orderId: string) => {
    const amount = offerAmounts[orderId];
    if (!amount || Number(amount) <= 0) return;
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, driver_name: displayName, driver_photo: profilePhoto, amount: Number(amount) }),
      });
      if (res.ok) { setSentOffers(s => ({ ...s, [orderId]: Number(amount) })); setOfferAmounts(o => ({ ...o, [orderId]: '' })); }
    } catch { /* */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleAcceptPrice = async (orderId: string, clientOffer: number) => {
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, driver_name: displayName, driver_photo: profilePhoto, amount: clientOffer }),
      });
      if (res.ok) setSentOffers(s => ({ ...s, [orderId]: clientOffer }));
    } catch { /* */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  /* ── RENDER ── */
  return (
    <DriverScreenLayout title="Envíos">

      {/* ════════════ ACTIVE JOB ════════════ */}
      {activeJob && (
        <div style={{ marginBottom: 20, border: '2px solid #10b981', borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          {/* Top banner */}
          <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
              <span>🚚</span> Envío Activo #{genTrackingCode(activeJob.id)}
            </div>
            {activeJob.status === 'accepted' && (
              <span style={{ background: '#fef2f2', color: '#ef4444', padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>📍 Ir a recoger</span>
            )}
            {activeJob.status === 'picking_up' && (
              <span style={{ background: '#f0fdf4', color: '#059669', padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>🚛 Ir a entregar</span>
            )}
            {activeJob.status === 'in_transit' && (
              <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>📦 En camino</span>
            )}
          </div>

          <div style={{ padding: '1rem' }}>
            {/* Pickup */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981', border: '2px solid #fff', boxShadow: '0 0 0 2px #10b981' }} />
                <div style={{ width: 2, flex: 1, background: '#d1d5db', margin: '4px 0' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', border: '2px solid #fff', boxShadow: '0 0 0 2px #ef4444' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#059669', marginBottom: 2 }}>Recoger en:</div>
                <div style={{ fontSize: '0.88rem', color: '#111827', marginBottom: 2, lineHeight: 1.3 }}>{activeJob.pickup_address}</div>
                {activeJob.sender_contact && (
                  <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                    {activeJob.sender_contact}
                    {activeJob.sender_phone && (
                      <> — <a href={`tel:${activeJob.sender_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.sender_phone}</a></>
                    )}
                  </div>
                )}
                <div style={{ margin: '12px 0', borderTop: '1px dashed #e5e7eb' }} />
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#ef4444', marginBottom: 2 }}>Entregar en:</div>
                <div style={{ fontSize: '0.88rem', color: '#111827', marginBottom: 2, lineHeight: 1.3 }}>{activeJob.delivery_address}</div>
                {activeJob.receiver_contact && (
                  <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                    {activeJob.receiver_contact}
                    {activeJob.receiver_phone && (
                      <> — <a href={`tel:${activeJob.receiver_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.receiver_phone}</a></>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Payment + meta */}
            {activeJob.payment_method && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: 10, fontSize: '0.85rem' }}>
                <span>💵</span>
                <span style={{ fontWeight: 600, color: '#065f46' }}>Cobro: {activeJob.payment_method}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', color: '#6b7280', marginBottom: 14 }}>
              <span>🚗 {VEHICLE_LABELS[activeJob.vehicle_type] || activeJob.vehicle_type}</span>
              <span style={{ fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
                ₲{Number(activeJob.offer || activeJob.suggested_price || 0).toLocaleString()}
              </span>
            </div>

            {activeJob.instructions && (
              <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: 12, fontSize: '0.85rem', color: '#6366f1' }}>
                📝 {activeJob.instructions}
              </div>
            )}

            {/* Action buttons */}
            {activeJob.status === 'accepted' && (
              <button
                onClick={() => handleTransition(activeJob.id, 'picking_up')}
                disabled={transitioning}
                style={{
                  width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                  fontWeight: 700, fontSize: '1rem', opacity: transitioning ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                🚗 Confirmar Recogida
              </button>
            )}

            {activeJob.status === 'picking_up' && (
              <button
                onClick={() => handleTransition(activeJob.id, 'in_transit')}
                disabled={transitioning}
                style={{
                  width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                  fontWeight: 700, fontSize: '1rem', opacity: transitioning ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                📦 Confirmar Retiro — Ir a Entregar
              </button>
            )}

            {activeJob.status === 'in_transit' && (
              <button
                onClick={() => handleTransition(activeJob.id, 'delivered')}
                disabled={transitioning}
                style={{
                  width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                  fontWeight: 700, fontSize: '1rem', opacity: transitioning ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                ✅ Confirmar Entrega
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════════════ PENDING ORDERS ════════════ */}
      {!activeJob && (
        <>
          <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Solicitudes de Envío</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Enviá tu oferta al cliente. El cliente elegirá entre las ofertas recibidas.
          </p>

          {loading && <div style={{ padding: 32, textAlign: 'center' }}>Cargando...</div>}
          {!loading && filteredOrders.length === 0 && (
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
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>Esperando respuesta del cliente...</div>
                    </div>
                  ) : (
                    <div>
                      <button className="tuki-btn tuki-btn-success" style={{ marginBottom: 8 }}
                        onClick={() => handleAcceptPrice(req.id, Number(req.offer || req.suggested_price))} disabled={isSending}>
                        {isSending ? 'Enviando...' : `Aceptar por ${Number(req.offer || req.suggested_price || 0).toLocaleString()} Gs`}
                      </button>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input type="number" className="tuki-form-input" placeholder="Tu contraoferta"
                            value={offerAmounts[req.id] || ''} onChange={e => setOfferAmounts(o => ({ ...o, [req.id]: e.target.value }))}
                            min="0" style={{ paddingRight: '2rem' }} />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.82rem' }}>Gs</span>
                        </div>
                        <button className="tuki-btn tuki-btn-primary" style={{ width: 'auto', padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}
                          onClick={() => handleSendOffer(req.id)} disabled={isSending || !offerAmounts[req.id]}>
                          Ofertar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </DriverScreenLayout>
  );
}
