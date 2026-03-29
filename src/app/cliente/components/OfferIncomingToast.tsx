'use client';
/**
 * OfferIncomingToast
 * Global InDrive-style popup that fires whenever the client receives a new
 * offer — either for a delivery (envío) or a technical service.
 * - Polls both endpoints every 6 s
 * - Plays a looping alert sound until the user taps "Ver oferta"
 * - "Ver oferta" stops sound + navigates to the relevant page
 * - "Más tarde" stops sound + snoozes the popup for 30 s
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/* ─── Web Audio ──────────────────────────────────────────────────────────── */
let _gAC: AudioContext | null = null;
function getAC(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const WA = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!WA) return null;
  if (!_gAC || _gAC.state === 'closed') _gAC = new WA();
  if (_gAC.state === 'suspended') _gAC.resume().catch(() => {});
  return _gAC;
}
if (typeof window !== 'undefined') {
  const _boot = () => { getAC(); window.removeEventListener('touchstart', _boot); window.removeEventListener('click', _boot); };
  window.addEventListener('touchstart', _boot, { once: true, passive: true });
  window.addEventListener('click', _boot, { once: true });
}

/** InDrive-style incoming offer ding: 3-beep rising melody */
function playIncomingOffer() {
  try {
    const ctx = getAC();
    if (!ctx) return;
    const t = ctx.currentTime;
    const beep = (freq: number, start: number, dur: number, vol = 0.35) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.02);
      g.gain.setValueAtTime(vol, start + dur * 0.6);
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.start(start);
      o.stop(start + dur + 0.05);
    };
    // Chord: 3 rising notes then a silent pause — loops every ~3.5 s via setInterval
    beep(660, t + 0.00, 0.14);
    beep(880, t + 0.18, 0.14);
    beep(1100, t + 0.36, 0.22, 0.4);
    // Short confirmation blip
    beep(1320, t + 0.70, 0.10, 0.25);
  } catch { /* silent */ }
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface PendingOffer {
  type: 'envio' | 'servicio';
  orderId: string;
  offerId: string;
  amount: number;
  driverName: string | null;
  driverPhoto: string | null;
  address?: string | null;
  serviceType?: string | null;
}

const SERVICE_ICONS: Record<string, string> = {
  limpieza: '🧹', niera: '👶', cocina: '🍳', eventos: '🎉',
  cuidado_mascotas: '🐾', cuidado_adultos: '👴',
  aire_split: '❄️', electrico: '⚡', plomeria: '🔧',
  cerrajeria: '🔑', otros: '✨',
};

/* ─── Component ─────────────────────────────────────────────────────────── */
interface Props {
  email: string;
}

export default function OfferIncomingToast({ email }: Props) {
  const router = useRouter();

  // The offer currently shown in the popup (null = hidden)
  const [currentOffer, setCurrentOffer] = useState<PendingOffer | null>(null);
  // Set of offer IDs already seen (to avoid re-triggering)
  const seenIds = useRef<Set<string>>(new Set());
  // Sound loop interval
  const soundLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  // Snooze timestamp (ignore popups until this time)
  const snoozedUntil = useRef<number>(0);
  // Queue of pending offers to show
  const queue = useRef<PendingOffer[]>([]);

  const stopSound = useCallback(() => {
    if (soundLoop.current) {
      clearInterval(soundLoop.current);
      soundLoop.current = null;
    }
  }, []);

  const startSound = useCallback(() => {
    stopSound();
    playIncomingOffer(); // immediate first play
    soundLoop.current = setInterval(playIncomingOffer, 3400);
  }, [stopSound]);

  const showNext = useCallback(() => {
    const next = queue.current.shift();
    if (next) {
      setCurrentOffer(next);
      startSound();
    } else {
      setCurrentOffer(null);
      stopSound();
    }
  }, [startSound, stopSound]);

  const handleView = useCallback(() => {
    if (!currentOffer) return;
    stopSound();
    setCurrentOffer(null);
    const target = currentOffer.type === 'envio' ? '/cliente/mis-envios' : '/cliente/mis-servicios';
    router.push(target);
  }, [currentOffer, stopSound, router]);

  const handleSnooze = useCallback(() => {
    stopSound();
    snoozedUntil.current = Date.now() + 30_000; // 30 s cooldown
    // Put the offer back at the front after snooze? No — just dismiss it.
    setCurrentOffer(null);
    // Show next in queue if any
    showNext();
  }, [stopSound, showNext]);

  // Push a new offer into queue / show immediately if idle
  const enqueue = useCallback((offer: PendingOffer) => {
    if (seenIds.current.has(offer.offerId)) return;
    seenIds.current.add(offer.offerId);
    if (Date.now() < snoozedUntil.current) return;
    queue.current.push(offer);
    if (!currentOffer) showNext();
    // If already showing something, it will auto-advance or stay
  }, [currentOffer, showNext]);

  /* ─── Polling ──────────────────────────────────────────────────────────── */
  const poll = useCallback(async () => {
    if (!email) return;

    /* -- ENVÍOS: pending/negotiating orders → fetch driver offers -- */
    try {
      const ordersRes = await fetch(`/api/orders?client_email=${encodeURIComponent(email)}`);
      if (ordersRes.ok) {
        const orders: any[] = await ordersRes.json();
        const active = Array.isArray(orders)
          ? orders.filter(o => o.status === 'pending' || o.status === 'negotiating')
          : [];

        for (const order of active) {
          const offersRes = await fetch(`/api/orders/offers?order_id=${order.id}`);
          if (!offersRes.ok) continue;
          const rawOffers: any[] = await offersRes.json();
          const pending = Array.isArray(rawOffers) ? rawOffers.filter(o => o.status === 'pending') : [];
          for (const o of pending) {
            enqueue({
              type: 'envio',
              orderId: order.id,
              offerId: o.id,
              amount: Number(o.amount),
              driverName: o.driver_name ?? null,
              driverPhoto: o.driver_photo ?? null,
              address: order.delivery_address ?? null,
            });
          }
        }
      }
    } catch { /* network error — silent */ }

    /* -- SERVICIOS TÉCNICOS: pending tech jobs → fetch tech offers -- */
    try {
      const jobsRes = await fetch(`/api/tecnico/jobs?client_active=true&client_email=${encodeURIComponent(email)}`);
      if (jobsRes.ok) {
        const jobs: any[] = await jobsRes.json();
        const pending = Array.isArray(jobs) ? jobs.filter(j => j.status === 'pending') : [];
        for (const job of pending) {
          const offersRes = await fetch(`/api/tecnico/jobs?job_offers=${job.id}`);
          if (!offersRes.ok) continue;
          const rawOffers: any[] = await offersRes.json();
          if (!Array.isArray(rawOffers)) continue;
          for (const o of rawOffers) {
            if (o.status !== 'pending') continue;
            enqueue({
              type: 'servicio',
              orderId: job.id,
              offerId: o.id,
              amount: Number(o.proposed_price),
              driverName: o.tecnico_name ?? o.tecnico_email?.split('@')[0] ?? null,
              driverPhoto: o.tecnico_photo ?? null,
              address: job.address ?? null,
              serviceType: job.service_type ?? null,
            });
          }
        }
      }
    } catch { /* network error — silent */ }
  }, [email, enqueue]);

  useEffect(() => {
    if (!email) return;
    poll(); // Initial load
    // Fallback polling at 60s; realtime is primary for instant offers
    const iv = setInterval(poll, 60_000);

    // Realtime: new driver offers + tecnico offers → instant toast
    const ch = supabase.channel(`offer-toast-${email}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_offers',
      } as never, () => poll())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tecnico_job_offers',
      } as never, () => poll())
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(ch);
      stopSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  /* ─── Cleanup on hot-reload / unmount ──────────────────────────────────── */
  useEffect(() => () => stopSound(), [stopSound]);

  if (!currentOffer) return null;

  const isService = currentOffer.type === 'servicio';
  const icon = isService ? (SERVICE_ICONS[currentOffer.serviceType ?? ''] ?? '🔧') : '🚚';
  const typeLabel = isService ? 'Servicio técnico' : 'Envío';
  const count = queue.current.length + 1; // currently shown + queued

  return (
    <>
      {/* ── Styles (keyframes) ────────────────────────────────────────────── */}
      <style>{`
        @keyframes _oit_slideUp   { from { transform: translateY(110%) } to { transform: translateY(0) } }
        @keyframes _oit_pulse     { 0%,100% { box-shadow: 0 -4px 40px rgba(200,255,0,0.18) } 50% { box-shadow: 0 -4px 60px rgba(200,255,0,0.55) } }
        @keyframes _oit_ringShake { 0%,100%{transform:rotate(-8deg)} 25%{transform:rotate(8deg)} 50%{transform:rotate(-5deg)} 75%{transform:rotate(5deg)} }
        @keyframes _oit_avatar_pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
      `}</style>

      {/* ── Dark backdrop ─────────────────────────────────────────────────── */}
      <div
        onClick={handleSnooze}
        style={{
          position: 'fixed', inset: 0, zIndex: 8000,
          background: 'rgba(0,0,0,0.68)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* ── Bottom sheet popup ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 8001,
        background: '#111827',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 48px rgba(0,0,0,0.7)',
        animation: '_oit_slideUp 0.35s cubic-bezier(0.32,0.72,0,1), _oit_pulse 2s ease-in-out 0.4s infinite',
        border: '1.5px solid rgba(200,255,0,0.6)',
        borderBottom: 'none',
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
      }}>
        {/* Pull tab */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#374151' }} />
        </div>

        {/* Header banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingInline: 20, paddingBottom: 16,
        }}>
          {/* Animated bell */}
          <span style={{ fontSize: '1.6rem', display: 'inline-block', animation: '_oit_ringShake 0.5s ease-in-out infinite' }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c8ff00', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {typeLabel} · Nueva oferta
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
              ¡Recibiste una oferta!
            </div>
          </div>
          {count > 1 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.78rem', fontWeight: 800, flexShrink: 0,
            }}>
              {count}
            </span>
          )}
        </div>

        {/* Driver / Técnico card */}
        <div style={{
          marginInline: 16, marginBottom: 16,
          background: '#1f2937',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: currentOffer.driverPhoto
              ? `url(${currentOffer.driverPhoto}) center/cover`
              : 'linear-gradient(135deg, #F5C518, #F58A07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '1.5rem',
            border: '2.5px solid #c8ff00',
            animation: '_oit_avatar_pulse 1.2s ease-in-out infinite',
          }}>
            {!currentOffer.driverPhoto && (currentOffer.driverName?.[0]?.toUpperCase() ?? icon)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', marginBottom: 2 }}>
              {currentOffer.driverName ?? (isService ? 'Técnico' : 'Conductor')}
            </div>
            {currentOffer.address && (
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {icon} {currentOffer.address}
              </div>
            )}
          </div>

          {/* Price */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.55rem', color: '#c8ff00', lineHeight: 1 }}>
              {currentOffer.amount.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Gs.</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, paddingInline: 16, paddingBottom: 20 }}>
          <button
            onClick={handleSnooze}
            style={{
              flex: 1, padding: '13px', borderRadius: 14,
              border: '1.5px solid #374151', background: 'transparent',
              color: '#9ca3af', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            }}
          >
            Más tarde
          </button>
        </div>
      </div>
    </>
  );
}
