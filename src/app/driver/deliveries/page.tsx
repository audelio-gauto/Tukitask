'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';
import { supabase } from '@/lib/supabaseClient';

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
function ensureAudioUnlocked() {
  const c = getAC();
  if (c && c.state === 'suspended') c.resume();
}
if (typeof window !== 'undefined') {
  const _unlock = () => { ensureAudioUnlocked(); window.removeEventListener('touchstart', _unlock); window.removeEventListener('click', _unlock); };
  window.addEventListener('touchstart', _unlock, { once: true });
  window.addEventListener('click', _unlock, { once: true });
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

function getNavUrl(lat: number, lng: number, app: string) {
  if (app === 'waze') return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export default function DeliveriesPage() {
  const { serviceFilters, email, displayName, profilePhoto, navApp } = useDriverContext();
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
  const activeJobRef = useRef<any>(null);

  // Keep ref in sync with state
  useEffect(() => { activeJobRef.current = activeJob; }, [activeJob]);

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
        if (!Array.isArray(data)) return; // network/parse error — don't clear
        if (data.length === 0) {
          // Only clear if not currently transitioning
          if (!activeJobRef.current || !['accepted','picking_up','in_transit'].includes(activeJobRef.current?.status)) {
            setActiveJob(null);
            activeJobRef.current = null;
          }
          return;
        }
        const job = data[0];
        if (!prevAccepted.current && job.status === 'accepted') playAccepted();
        prevAccepted.current = true;
        setActiveJob(job);
        activeJobRef.current = job;
      })
      .catch(() => {}); // network error — keep current state, don't clear
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
          // NOTE: activeJob is managed exclusively by fetchActiveJob to avoid competing setters.
          // Sound: play once when first accepted offer appears
          if (o.status === 'accepted' && !prevAccepted.current) {
            playAccepted();
            prevAccepted.current = true;
          }
        }
        setSentOffers(pending);
      })
      .catch(() => {});
  }, [email]);

  useEffect(() => {
    fetchOrders(); fetchMyOffers(); fetchActiveJob();
    const iv = setInterval(() => { fetchOrders(); fetchMyOffers(); fetchActiveJob(); }, 3000);
    return () => clearInterval(iv);
  }, [fetchOrders, fetchMyOffers, fetchActiveJob]);

  /* ── Supabase Realtime: instant notification like Bolt/Uber ── */
  useEffect(() => {
    // Channel 1: new pending/negotiating orders → alert driver instantly
    const chNew = supabase.channel('realtime-new-orders')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      }, () => {
        fetchOrders();
        playOrderAlert();
      })
      .subscribe();

    // Channel 2: driver's own active job changes
    const chDriver = email
      ? supabase.channel('realtime-driver-' + email)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `accepted_by=eq.${email}`,
          }, () => {
            fetchActiveJob();
            fetchOrders();
          })
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(chNew);
      if (chDriver) supabase.removeChannel(chDriver);
    };
  }, [email, fetchOrders, fetchActiveJob]);

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

  const handleSendOffer = async (orderId: string, directAmount?: number) => {
    const amount = directAmount ? String(directAmount) : offerAmounts[orderId];
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
            {activeJob.status === 'accepted' && activeJob.pickup_lat && (
              <a href={getNavUrl(activeJob.pickup_lat, activeJob.pickup_lng, navApp)} target="_blank" rel="noopener noreferrer"
                style={{ background: '#fef2f2', color: '#ef4444', padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>📍 Ir a recoger</a>
            )}
            {(activeJob.status === 'picking_up' || activeJob.status === 'in_transit') && activeJob.delivery_lat && (
              <a href={getNavUrl(activeJob.delivery_lat, activeJob.delivery_lng, navApp)} target="_blank" rel="noopener noreferrer"
                style={{ background: '#f0fdf4', color: '#059669', padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>🚛 Ir a entregar</a>
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
            const clientPrice = Number(req.offer || req.suggested_price || 0);
            const quickOffers = [
              Math.round(clientPrice * 1.1 / 1000) * 1000,
              Math.round(clientPrice * 1.2 / 1000) * 1000,
              Math.round(clientPrice * 1.3 / 1000) * 1000,
            ];
            return (
              <div key={req.id} style={{
                marginBottom: 16, borderRadius: 18, overflow: 'hidden',
                background: '#1a1a2e', color: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              }}>
                {/* ── Header: Solicitud de envío ── */}
                <div style={{ textAlign: 'center', padding: '0.7rem 1rem 0.3rem', fontSize: '1.05rem', fontWeight: 700, letterSpacing: 0.3 }}>
                  Solicitud de envío
                </div>

                {/* ── Client info row ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.5rem 1rem 0.6rem' }}>
                  <div style={{ position: 'relative' }}>
                    {req.client_photo ? (
                      <img src={req.client_photo} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #444' }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>👤</div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      {req.client_name || req.client_email?.split('@')[0] || 'Cliente'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type}</span>
                      <span>•</span>
                      <span>{new Date(req.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#fff' }}>
                      {clientPrice.toLocaleString()} Gs
                    </div>
                  </div>
                </div>

                {/* ── Route A → B ── */}
                <div style={{ padding: '0 1rem 0.7rem' }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>A</div>
                      <div style={{ width: 2, flex: 1, background: '#444', margin: '3px 0' }} />
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>B</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35, marginBottom: 2 }}>{req.pickup_address}</div>
                      <div style={{ height: 12 }} />
                      <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35 }}>{req.delivery_address}</div>
                    </div>
                  </div>
                </div>

                {req.instructions && (
                  <div style={{ margin: '0 1rem 0.6rem', background: 'rgba(255,255,255,0.08)', padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.82rem', color: '#a5b4fc' }}>
                    📝 {req.instructions}
                  </div>
                )}

                {/* ── Actions ── */}
                <div style={{ padding: '0 1rem 1rem' }}>
                  {alreadyOffered ? (
                    <div style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 14, padding: '0.8rem 1rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: '#a5b4fc', marginBottom: 2 }}>Tu oferta enviada</div>
                      <div style={{ fontWeight: 800, color: '#818cf8', fontSize: '1.25rem' }}>
                        {alreadyOffered.toLocaleString()} Gs
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>Esperando respuesta del cliente...</div>
                    </div>
                  ) : (
                    <>
                      {/* Accept button */}
                      <button
                        onClick={() => handleAcceptPrice(req.id, clientPrice)}
                        disabled={isSending}
                        style={{
                          width: '100%', padding: '0.85rem', border: 'none', borderRadius: 14, cursor: 'pointer',
                          background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1rem',
                          marginBottom: 10, opacity: isSending ? 0.6 : 1,
                        }}>
                        {isSending ? 'Enviando...' : `Aceptar por ${clientPrice.toLocaleString()} Gs`}
                      </button>

                      {/* Ofrece tu tarifa */}
                      <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#9ca3af', marginBottom: 8 }}>Ofrece tu tarifa</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {quickOffers.map(q => (
                          <button key={q}
                            onClick={() => handleSendOffer(req.id, q)}
                            disabled={isSending}
                            style={{
                              flex: 1, padding: '0.6rem 0', border: '1px solid #444', borderRadius: 10,
                              background: 'transparent', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                            }}>
                            {q.toLocaleString()}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const custom = prompt('Tu contraoferta (Gs):');
                            if (custom && Number(custom) > 0) {
                              handleSendOffer(req.id, Number(custom));
                            }
                          }}
                          style={{
                            width: 44, border: '1px solid #444', borderRadius: 10,
                            background: 'transparent', color: '#fff', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer',
                          }}>
                          &gt;
                        </button>
                      </div>
                    </>
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
