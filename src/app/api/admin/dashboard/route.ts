import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';
import { ADMIN_ROLES } from '@/lib/constants';
import { cacheGet, cacheSet } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
// Paraguay usa UTC-3 todo el año desde octubre de 2024.
const TZ_OFFSET_MS = -3 * 3_600_000;
const CACHE_KEY = 'admin:dashboard:v1';
const CACHE_TTL_SECONDS = 30;
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

const ORDER_PENDING = ['pending', 'negotiating'];
const ORDER_DELIVERED = ['delivered', 'commission_charged', 'client_confirmed'];
const ORDER_CLOSED_UNSUCCESSFULLY = ['cancelled', 'failed', 'returned', 'return_rejected'];
const MARKET_SOLD = ['delivered', 'commission_charged'];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

type QueryResult = { count?: number | null; data?: unknown; error: { message: string } | null };

const dayKey = (ms: number) => Math.floor((ms + TZ_OFFSET_MS) / DAY_MS);
const dayStartMs = (key: number) => key * DAY_MS - TZ_OFFSET_MS;

async function buildDashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;
  const warnings: string[] = [];

  const count = async (label: string, query: PromiseLike<QueryResult>): Promise<number> => {
    const { count: total, error } = await query;
    if (error) {
      warnings.push(label);
      console.error(`[admin/dashboard] ${label}:`, error.message);
      return 0;
    }
    return total ?? 0;
  };

  const head = (table: string) => db.from(table).select('*', { count: 'exact', head: true });

  const now = Date.now();
  const todayKey = dayKey(now);
  const windowStart = new Date(dayStartMs(todayKey - 29)).toISOString();
  const staleBefore = new Date(now - 30 * 60 * 1000).toISOString();

  const sumRows = async (
    label: string,
    table: 'orders' | 'market_orders',
    columns: string,
    statuses: string[],
    amountOf: (row: Record<string, unknown>) => number,
  ) => {
    const rows: Array<{ amount: number; createdAt: number }> = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .in('status', statuses)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        warnings.push(label);
        console.error(`[admin/dashboard] ${label}:`, error.message);
        return rows;
      }
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        rows.push({ amount: amountOf(row), createdAt: new Date(String(row.created_at)).getTime() });
      }
      if ((data ?? []).length < PAGE_SIZE) return rows;
    }
    warnings.push(`${label}_truncated`);
    return rows;
  };

  const [
    total, admins, drivers, vendedores, servicios, hoteleria, clientes, recentUsersResult,
    totalOrders, pendingOrders, deliveredOrders, cancelledOrders,
    deliveredRows,
    marketTotal, marketPending, marketSoldRows,
    pendingDriverRecharges, pendingVendorRecharges, stalePendingOrders, unresolvedReports, pendingProducts,
  ] = await Promise.all([
    count('users_total', head('users')),
    count('users_admins', head('users').in('role', ADMIN_ROLES)),
    count('users_drivers', head('users').eq('role', 'driver')),
    count('users_vendedores', head('users').eq('role', 'vendedor')),
    count('users_servicios', head('users').in('role', ['servicio', 'tecnico'])),
    count('users_hoteleria', head('users').eq('role', 'hoteleria')),
    count('users_clientes', head('users').eq('role', 'cliente')),
    db.from('users').select('id, email, role, created_at').order('created_at', { ascending: false }).limit(5),
    count('orders_total', head('orders')),
    count('orders_pending', head('orders').in('status', ORDER_PENDING)),
    count('orders_delivered', head('orders').in('status', ORDER_DELIVERED)),
    count('orders_cancelled', head('orders').in('status', ORDER_CLOSED_UNSUCCESSFULLY)),
    sumRows('orders_revenue', 'orders', 'offer, suggested_price, created_at', ORDER_DELIVERED,
      (row) => Number(row.offer ?? row.suggested_price ?? 0) || 0),
    count('market_total', head('market_orders')),
    count('market_pending', head('market_orders').eq('status', 'pending')),
    sumRows('market_revenue', 'market_orders', 'total, created_at', MARKET_SOLD,
      (row) => Number(row.total ?? 0) || 0),
    count('recharges_drivers', head('recharge_requests').eq('status', 'pending')),
    count('recharges_vendors', head('vendor_recharge_requests').eq('status', 'pending')),
    count('orders_stale', head('orders').in('status', ORDER_PENDING).lte('created_at', staleBefore)),
    count('reports_open', head('reports').in('status', ['pending', 'reviewing'])),
    count('products_pending', head('products').eq('status', 'pending_review')),
  ]);

  if (recentUsersResult.error) {
    warnings.push('users_recent');
    console.error('[admin/dashboard] users_recent:', recentUsersResult.error.message);
  }

  const todayStart = dayStartMs(todayKey);
  const sumSince = (rows: Array<{ amount: number; createdAt: number }>, from: number, to = Infinity) =>
    rows.filter((r) => r.createdAt >= from && r.createdAt < to).reduce((s, r) => s + r.amount, 0);

  const daily = Array.from({ length: 7 }, (_, i) => {
    const key = todayKey - (6 - i);
    const from = dayStartMs(key);
    return {
      date: new Date(key * DAY_MS).toISOString().slice(0, 10),
      label: WEEKDAYS[new Date(key * DAY_MS).getUTCDay()],
      amount: sumSince(deliveredRows, from, from + DAY_MS),
    };
  });

  return {
    stats: { total, admins, drivers, vendedores, servicios, hoteleria, clientes },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      delivered: deliveredOrders,
      cancelled: cancelledOrders,
      revenueToday: sumSince(deliveredRows, todayStart),
      revenueLast30Days: sumSince(deliveredRows, 0),
      daily,
    },
    marketplace: {
      total: marketTotal,
      pending: marketPending,
      revenueLast30Days: sumSince(marketSoldRows, 0),
    },
    alerts: {
      pendingDriverRecharges,
      pendingVendorRecharges,
      stalePendingOrders,
      unresolvedReports,
      pendingProducts,
    },
    recentUsers: recentUsersResult.data ?? [],
    warnings,
    generatedAt: new Date(now).toISOString(),
  };
}

// GET /api/admin/dashboard — resumen del panel (solo admin). ?refresh=1 omite la caché.
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const refresh = new URL(req.url).searchParams.get('refresh') === '1';

  try {
    if (!refresh) {
      const cached = await cacheGet<Awaited<ReturnType<typeof buildDashboard>>>(CACHE_KEY);
      if (cached) return NextResponse.json(cached);
    }

    const dashboard = await buildDashboard();
    // No se cachean resultados parciales para que un fallo transitorio no persista.
    if (dashboard.warnings.length === 0) await cacheSet(CACHE_KEY, dashboard, CACHE_TTL_SECONDS);
    return NextResponse.json(dashboard);
  } catch (err) {
    console.error('[admin/dashboard] unexpected error:', err);
    return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 });
  }
}
