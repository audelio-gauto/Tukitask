'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { playClientOfferAlert } from '@/lib/audio';

interface Offer {
  id: string;
  amount: number;
  driver_name: string | null;
  driver_photo: string | null;
  driver_avg_rating: number | null;
  driver_total_ratings?: number | null;
  driver_vehicle_brand: string | null;
  driver_vehicle_model: string | null;
  distance_km: number | null;
  note: string | null;
}

interface Props {
  orderId: string;
  serviceLabel: string;
}

const POLL_MS = 4000;

/**
 * Pantalla "Buscando conductor" estilo Bolt/InDrive.
 * Solo lee estado y usa los mismos endpoints de aceptar/rechazar/cancelar que ya usa el panel del cliente.
 */
export default function SearchingDriver({ orderId, serviceLabel }: Props) {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const doneRef = useRef(false);
  const seenOffersRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    if (doneRef.current || document.hidden) return;
    try {
      const [orderRes, offersRes] = await Promise.all([
        authFetch(`/api/orders?id=${encodeURIComponent(orderId)}`),
        authFetch(`/api/orders/offers?order_ids=${encodeURIComponent(orderId)}`),
      ]);
      if (orderRes.ok) {
        const order = await orderRes.json();
        if (order.status === 'cancelled') { doneRef.current = true; router.replace('/cliente'); return; }
        if (order.status !== 'pending' && order.status !== 'negotiating') {
          doneRef.current = true;
          router.push(`/cliente/seguimiento/${orderId}`);
          return;
        }
      }
      if (offersRes.ok) {
        const grouped = await offersRes.json();
        const list: Offer[] = (grouped[orderId] ?? []).filter((o: { status: string }) => o.status === 'pending');
        setOffers(list);
        // Aviso solo para ofertas que no habíamos visto antes
        const fresh = list.some(o => !seenOffersRef.current.has(o.id));
        list.forEach(o => seenOffersRef.current.add(o.id));
        if (fresh) {
          playClientOfferAlert();
          try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
        }
      }
    } catch { /* se reintenta en el próximo ciclo */ }
  }, [orderId, router]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const accept = async (offerId: string) => {
    setBusyId(offerId);
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'accept' }),
      });
      if (res.ok) {
        doneRef.current = true;
        router.push(`/cliente/seguimiento/${orderId}`);
      }
    } finally { setBusyId(null); }
  };

  const reject = async (offerId: string) => {
    setBusyId(offerId);
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'reject' }),
      });
      if (res.ok) setOffers(prev => prev.filter(o => o.id !== offerId));
    } finally { setBusyId(null); }
  };

  const cancelOrder = async () => {
    if (!window.confirm('¿Cancelar la búsqueda de conductor?')) return;
    setCancelling(true);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'cancelled' }),
      });
      if (res.ok) { doneRef.current = true; router.replace('/cliente'); return; }
    } finally { setCancelling(false); }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="searching-screen">
      <div className="searching-radar" aria-hidden>
        <span className="searching-ring r1" />
        <span className="searching-ring r2" />
        <span className="searching-ring r3" />
        <span className="searching-core">🚖</span>
      </div>
      <div className="searching-title">
        {offers.length > 0 ? `${offers.length} ${offers.length === 1 ? 'oferta recibida' : 'ofertas recibidas'}` : 'Buscando conductor…'}
      </div>
      <p className="searching-sub">{serviceLabel} · {mm}:{ss}</p>

      <div className="searching-offers">
        {offers.map(o => (
          <div key={o.id} className="searching-offer">
            <div className="searching-offer-head">
              {o.driver_photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={o.driver_photo} alt="" className="searching-avatar" />
                : <span className="searching-avatar fallback">{(o.driver_name || '?').charAt(0).toUpperCase()}</span>}
              <div className="searching-offer-info">
                <strong>{o.driver_name || 'Conductor'}</strong>
                <span>
                  {o.driver_avg_rating ? `★ ${Number(o.driver_avg_rating).toFixed(1)}` : 'Nuevo'}
                  {o.driver_total_ratings ? ` · ${o.driver_total_ratings} ${o.driver_total_ratings === 1 ? 'viaje' : 'viajes'}` : ''}
                  {o.driver_vehicle_brand ? ` · ${o.driver_vehicle_brand} ${o.driver_vehicle_model ?? ''}` : ''}
                  {o.distance_km != null ? ` · ${Number(o.distance_km).toFixed(1)} km` : ''}
                </span>
              </div>
              <div className="searching-offer-price">{Math.round(o.amount).toLocaleString('es-PY')} <small>Gs</small></div>
            </div>
            {o.note && <div className="searching-offer-note">{o.note}</div>}
            <div className="searching-offer-actions">
              <button type="button" className="searching-btn" disabled={busyId === o.id} onClick={() => reject(o.id)}>Rechazar</button>
              <button type="button" className="searching-btn primary" disabled={busyId === o.id} onClick={() => accept(o.id)}>Aceptar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="searching-footer">
        <button type="button" className="searching-btn" disabled={cancelling} onClick={cancelOrder}>Cancelar pedido</button>
      </div>
    </div>
  );
}
