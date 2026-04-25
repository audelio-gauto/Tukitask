'use client';

/**
 * useRealtimeOffers — InDrive-style live offer feed.
 *
 * Features:
 * - Realtime INSERT/UPDATE/DELETE on offer tables via Supabase
 * - Auto-expiry countdown (offers disappear when expires_at passes)
 * - Sorted by price / time / rating
 * - Dedup by offer ID
 * - Auto-cleanup when order/job is accepted (status !== pending/negotiating)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LiveOffer {
  id: string;
  type: 'envio' | 'servicio';
  order_id?: string;
  job_id?: string;
  worker_email: string;
  worker_name: string | null;
  worker_photo: string | null;
  worker_rating: number | null;
  amount: number;
  note?: string | null;
  distance_km?: number | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  /** Countdown seconds remaining (null = no expiry) */
  secondsLeft: number | null;
}

export type OfferSortMode = 'price_asc' | 'price_desc' | 'time' | 'rating';

interface UseRealtimeOffersOpts {
  /** The user (client) email to filter offers for */
  userEmail: string | undefined;
  /** Only track offers for these specific order IDs */
  orderIds?: string[];
  /** Only track offers for these specific job IDs */
  jobIds?: string[];
  /** Sort mode (default: price_asc) */
  sort?: OfferSortMode;
  /** Enable/disable (default: true) */
  enabled?: boolean;
}

// ── Sorting helpers ──────────────────────────────────────────────────────────
function sortOffers(offers: LiveOffer[], mode: OfferSortMode): LiveOffer[] {
  const copy = [...offers];
  switch (mode) {
    case 'price_asc':  return copy.sort((a, b) => a.amount - b.amount);
    case 'price_desc': return copy.sort((a, b) => b.amount - a.amount);
    case 'rating':     return copy.sort((a, b) => (b.worker_rating ?? 0) - (a.worker_rating ?? 0));
    case 'time':       return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    default:           return copy;
  }
}

// ── Main hook ────────────────────────────────────────────────────────────────
export function useRealtimeOffers(opts: UseRealtimeOffersOpts) {
  const { userEmail, orderIds, jobIds, sort = 'price_asc', enabled = true } = opts;
  const [offers, setOffers] = useState<LiveOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const sortRef = useRef(sort);
  sortRef.current = sort;

  // ── Fetch offers from API ──────────────────────────────────────────────
  const fetchOffers = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const results: LiveOffer[] = [];

      // Fetch driver_offers for envíos
      if (orderIds && orderIds.length > 0) {
        const res = await authFetch(`/api/orders/offers?order_ids=${orderIds.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          // data is grouped by order_id
          for (const orderId of Object.keys(data)) {
            const arr = Array.isArray(data[orderId]) ? data[orderId] : [];
            for (const o of arr) {
              if (o.status !== 'pending') continue;
              results.push({
                id: o.id,
                type: 'envio',
                order_id: o.order_id,
                worker_email: o.driver_email,
                worker_name: o.driver_name,
                worker_photo: o.driver_photo,
                worker_rating: o.driver_rating ?? null,
                amount: Number(o.amount),
                note: null,
                distance_km: null,
                status: o.status,
                expires_at: o.expires_at ?? null,
                created_at: o.created_at,
                secondsLeft: null,
              });
            }
          }
        }
      }

      // Fetch tecnico_job_offers for services
      if (jobIds && jobIds.length > 0) {
        for (const jobId of jobIds) {
          const res = await authFetch(`/api/tecnico/jobs?scope=offers&job_id=${jobId}`);
          if (res.ok) {
            const data = await res.json();
            const arr = Array.isArray(data.offers) ? data.offers : (Array.isArray(data) ? data : []);
            for (const o of arr) {
              if (o.status !== 'pending') continue;
              results.push({
                id: o.id,
                type: 'servicio',
                job_id: o.job_id,
                worker_email: o.tecnico_email,
                worker_name: o.tecnico_name,
                worker_photo: o.tecnico_photo,
                worker_rating: o.tecnico_rating ? Number(o.tecnico_rating) : null,
                amount: Number(o.proposed_price),
                note: o.note,
                distance_km: o.distance_km ? Number(o.distance_km) : null,
                status: o.status,
                expires_at: o.expires_at ?? null,
                created_at: o.created_at,
                secondsLeft: null,
              });
            }
          }
        }
      }

      setOffers(sortOffers(results, sortRef.current));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userEmail, orderIds, jobIds]);

  // ── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (enabled) fetchOffers();
  }, [enabled, fetchOffers]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail || !enabled) return;

    const ch = supabase.channel(`live-offers-${userEmail}`);

    // Driver offers — filtered by client_email (server-side: only this client's offers)
    ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'driver_offers',
      filter: `client_email=eq.${userEmail}`,
    }, (payload) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown>;
      if (!row) return;

      if (payload.eventType === 'DELETE') {
        setOffers((prev) => sortOffers(prev.filter((o) => o.id !== row.id), sortRef.current));
        return;
      }

      // If status is no longer pending, remove it
      if (row.status !== 'pending') {
        setOffers((prev) => sortOffers(prev.filter((o) => o.id !== row.id), sortRef.current));
        return;
      }

      // Check if it's for one of our orders
      if (orderIds && orderIds.length > 0 && !orderIds.includes(String(row.order_id))) return;

      const mapped: LiveOffer = {
        id: String(row.id),
        type: 'envio',
        order_id: String(row.order_id),
        worker_email: String(row.driver_email),
        worker_name: (row.driver_name as string) ?? null,
        worker_photo: (row.driver_photo as string) ?? null,
        worker_rating: row.driver_rating ? Number(row.driver_rating) : null,
        amount: Number(row.amount),
        note: null,
        distance_km: null,
        status: String(row.status),
        expires_at: (row.expires_at as string) ?? null,
        created_at: String(row.created_at),
        secondsLeft: null,
      };

      setOffers((prev) => {
        const idx = prev.findIndex((o) => o.id === mapped.id);
        const next = idx >= 0
          ? prev.map((o, i) => (i === idx ? mapped : o))
          : [...prev, mapped];
        return sortOffers(next, sortRef.current);
      });
    });

    // Tecnico offers — filtered by client_email (server-side: only this client's offers)
    ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tecnico_job_offers',
      filter: `client_email=eq.${userEmail}`,
    }, (payload) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown>;
      if (!row) return;

      if (payload.eventType === 'DELETE') {
        setOffers((prev) => sortOffers(prev.filter((o) => o.id !== row.id), sortRef.current));
        return;
      }

      if (row.status !== 'pending') {
        setOffers((prev) => sortOffers(prev.filter((o) => o.id !== row.id), sortRef.current));
        return;
      }

      if (jobIds && jobIds.length > 0 && !jobIds.includes(String(row.job_id))) return;

      const mapped: LiveOffer = {
        id: String(row.id),
        type: 'servicio',
        job_id: String(row.job_id),
        worker_email: String(row.tecnico_email),
        worker_name: (row.tecnico_name as string) ?? null,
        worker_photo: (row.tecnico_photo as string) ?? null,
        worker_rating: row.tecnico_rating ? Number(row.tecnico_rating) : null,
        amount: Number(row.proposed_price),
        note: (row.note as string) ?? null,
        distance_km: row.distance_km ? Number(row.distance_km) : null,
        status: String(row.status),
        expires_at: (row.expires_at as string) ?? null,
        created_at: String(row.created_at),
        secondsLeft: null,
      };

      setOffers((prev) => {
        const idx = prev.findIndex((o) => o.id === mapped.id);
        const next = idx >= 0
          ? prev.map((o, i) => (i === idx ? mapped : o))
          : [...prev, mapped];
        return sortOffers(next, sortRef.current);
      });
    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, enabled, orderIds?.join(','), jobIds?.join(',')]);

  // ── Expiry countdown timer ─────────────────────────────────────────────
  useEffect(() => {
    if (!offers.some((o) => o.expires_at)) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setOffers((prev) => {
        let changed = false;
        const next = prev
          .map((o) => {
            if (!o.expires_at) return o;
            const remaining = Math.max(0, Math.floor((new Date(o.expires_at).getTime() - now) / 1000));
            if (remaining !== o.secondsLeft) changed = true;
            return { ...o, secondsLeft: remaining };
          })
          .filter((o) => {
            if (o.expires_at && o.secondsLeft === 0) {
              changed = true;
              return false; // Remove expired
            }
            return true;
          });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offers]);

  // ── Re-sort when sort mode changes ─────────────────────────────────────
  useEffect(() => {
    setOffers((prev) => sortOffers(prev, sort));
  }, [sort]);

  return {
    offers,
    loading,
    refresh: fetchOffers,
    /** Count of pending offers */
    count: offers.length,
  };
}
