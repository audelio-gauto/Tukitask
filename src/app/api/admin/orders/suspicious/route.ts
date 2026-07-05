import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const db = sbAdmin();
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const since7d  = new Date(Date.now() -  7 * 24 * 3600 * 1000).toISOString();

  try {
     
    const [recentOrdersRes, cancellationsRes, lowOfferRes] = await Promise.all([
      // All orders in last 30 days (status != cancelled) with a driver assigned
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('orders')
        .select('id, client_email, accepted_by, offer, created_at, status, pickup_address, dropoff_address')
        .gte('created_at', since30d)
        .not('accepted_by', 'is', null)
        .neq('status', 'cancelled'),
      // Cancellations in last 7 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('orders')
        .select('client_email, id')
        .gte('created_at', since7d)
        .eq('status', 'cancelled'),
      // Very low offer orders (< 1000 Gs) in last 30 days, not cancelled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('orders')
        .select('id, client_email, accepted_by, offer, created_at, status, pickup_address, dropoff_address')
        .gte('created_at', since30d)
        .lt('offer', 1000)
        .not('offer', 'is', null)
        .neq('status', 'cancelled'),
    ]);

    const suspicious: {
      reason: string;
      severity: 'high' | 'medium';
      client_email: string;
      driver_email?: string;
      count?: number;
      order_ids?: string[];
      order_id?: string;
      offer?: number;
      created_at?: string;
    }[] = [];

    // ── 1. Pairs with repeated orders ──────────────────────────────────────
    const pairMap = new Map<string, { ids: string[]; created_ats: string[] }>();
    for (const o of recentOrdersRes.data ?? []) {
      const key = `${o.client_email}||${o.accepted_by}`;
      if (!pairMap.has(key)) pairMap.set(key, { ids: [], created_ats: [] });
      pairMap.get(key)!.ids.push(o.id);
      pairMap.get(key)!.created_ats.push(o.created_at);
    }
    for (const [key, val] of pairMap.entries()) {
      if (val.ids.length > 3) {
        const [client_email, driver_email] = key.split('||');
        suspicious.push({
          reason: `Par cliente-driver con ${val.ids.length} pedidos en 30 días`,
          severity: val.ids.length > 6 ? 'high' : 'medium',
          client_email,
          driver_email,
          count: val.ids.length,
          order_ids: val.ids.slice(0, 5),
        });
      }
    }

    // ── 2. Clients with many cancellations ────────────────────────────────
    const cancelMap = new Map<string, number>();
    for (const o of cancellationsRes.data ?? []) {
      cancelMap.set(o.client_email, (cancelMap.get(o.client_email) || 0) + 1);
    }
    for (const [client_email, count] of cancelMap.entries()) {
      if (count > 5) {
        suspicious.push({
          reason: `${count} cancelaciones en los últimos 7 días`,
          severity: count > 10 ? 'high' : 'medium',
          client_email,
          count,
        });
      }
    }

    // ── 3. Very low offer orders ───────────────────────────────────────────
    for (const o of lowOfferRes.data ?? []) {
      suspicious.push({
        reason: `Oferta anormalmente baja (${o.offer} Gs)`,
        severity: 'medium',
        client_email: o.client_email,
        driver_email: o.accepted_by ?? undefined,
        order_id: o.id,
        offer: o.offer,
        created_at: o.created_at,
      });
    }

    // Sort: high first, then by client_email
    suspicious.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return a.client_email.localeCompare(b.client_email);
    });

    return NextResponse.json({ data: suspicious, total: suspicious.length });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
