import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const DAY_MS = 86_400_000;
// Paraguay usa UTC-3 todo el año desde octubre de 2024.
const TZ_OFFSET_MS = -3 * 3_600_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

const safeUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;

const byNewest = (a: { created_at: string }, b: { created_at: string }) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

// Suma |amount| de un tipo de transacción recorriendo páginas (hasta MAX_PAGES).
async function sumByType(db: Db, table: string, type: string) {
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from(table)
      .select('amount')
      .eq('type', type)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Row[]) total += Math.abs(Number(row.amount) || 0);
    if ((data ?? []).length < PAGE_SIZE) return { total, truncated: false };
  }
  return { total, truncated: true };
}

async function commissions(db: Db) {
  const [drivers, vendors, driverSum, vendorSum] = await Promise.all([
    db.from('wallet_transactions')
      .select('id, driver_email, amount, job_id, note, created_at')
      .eq('type', 'commission')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('vendor_wallet_transactions')
      .select('id, vendor_email, amount, note, created_at')
      .eq('type', 'sale_commission')
      .order('created_at', { ascending: false })
      .limit(100),
    sumByType(db, 'wallet_transactions', 'commission'),
    sumByType(db, 'vendor_wallet_transactions', 'sale_commission'),
  ]);
  if (drivers.error) throw new Error(drivers.error.message);
  if (vendors.error) throw new Error(vendors.error.message);

  const rows = [
    ...((drivers.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.driver_email ?? ''),
      source: r.job_id ? 'service' : 'delivery',
      amount: Math.abs(Number(r.amount) || 0),
      note: (r.note as string | null) ?? null,
      created_at: String(r.created_at),
    })),
    ...((vendors.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.vendor_email ?? ''),
      source: 'marketplace',
      amount: Math.abs(Number(r.amount) || 0),
      note: (r.note as string | null) ?? null,
      created_at: String(r.created_at),
    })),
  ].sort(byNewest).slice(0, 100);

  return {
    rows,
    total: driverSum.total + vendorSum.total,
    truncated: driverSum.truncated || vendorSum.truncated,
  };
}

async function pendingRecharges(db: Db) {
  const [drivers, vendors] = await Promise.all([
    db.from('recharge_requests')
      .select('id, driver_email, amount, receipt_url, created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('vendor_recharge_requests')
      .select('id, vendor_email, amount, receipt_url, created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (drivers.error) throw new Error(drivers.error.message);
  if (vendors.error) throw new Error(vendors.error.message);

  const rows = [
    ...((drivers.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.driver_email ?? ''),
      role: 'driver' as const,
      amount: Number(r.amount) || 0,
      receipt_url: safeUrl(r.receipt_url),
      created_at: String(r.created_at),
    })),
    ...((vendors.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.vendor_email ?? ''),
      role: 'vendor' as const,
      amount: Number(r.amount) || 0,
      receipt_url: safeUrl(r.receipt_url),
      created_at: String(r.created_at),
    })),
  ].sort(byNewest);

  const driverCount = drivers.count ?? rows.filter((r) => r.role === 'driver').length;
  const vendorCount = vendors.count ?? rows.filter((r) => r.role === 'vendor').length;
  return {
    rows,
    counts: { driver: driverCount, vendor: vendorCount },
    truncated: driverCount > (drivers.data ?? []).length || vendorCount > (vendors.data ?? []).length,
  };
}

async function movements(db: Db, type: string, rawQuery: string) {
  // Sin comas/paréntesis (separadores de filtros PostgREST) y con comodines escapados.
  const q = rawQuery.replace(/[,()]/g, ' ').replace(/[%_\\]/g, '\\$&').trim().slice(0, 80);

  const build = (table: string, emailColumn: string, columns: string) => {
    let query = db.from(table).select(columns).order('created_at', { ascending: false }).limit(200);
    if (type) query = query.eq('type', type);
    if (q) query = query.or(`${emailColumn}.ilike.%${q}%,note.ilike.%${q}%`);
    return query;
  };

  const [drivers, vendors] = await Promise.all([
    build('wallet_transactions', 'driver_email', 'id, driver_email, type, amount, note, created_at'),
    build('vendor_wallet_transactions', 'vendor_email', 'id, vendor_email, type, amount, note, created_at'),
  ]);
  if (drivers.error) throw new Error(drivers.error.message);
  if (vendors.error) throw new Error(vendors.error.message);

  const rows = [
    ...((drivers.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.driver_email ?? ''),
      role: 'driver' as const,
      type: String(r.type),
      amount: Number(r.amount) || 0,
      note: (r.note as string | null) ?? null,
      created_at: String(r.created_at),
    })),
    ...((vendors.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      email: String(r.vendor_email ?? ''),
      role: 'vendor' as const,
      type: String(r.type),
      amount: Number(r.amount) || 0,
      note: (r.note as string | null) ?? null,
      created_at: String(r.created_at),
    })),
  ].sort(byNewest).slice(0, 200);

  return { rows };
}

async function summary(db: Db) {
  const todayStart = new Date(
    Math.floor((Date.now() + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS,
  ).toISOString();
  const head = (table: string) => db.from(table).select('*', { count: 'exact', head: true });

  const [commission, pending, driverToday, vendorToday] = await Promise.all([
    commissions(db),
    pendingRecharges(db),
    head('wallet_transactions').gte('created_at', todayStart),
    head('vendor_wallet_transactions').gte('created_at', todayStart),
  ]);
  if (driverToday.error) throw new Error(driverToday.error.message);
  if (vendorToday.error) throw new Error(vendorToday.error.message);

  return {
    commissionsTotal: commission.total,
    commissionsTruncated: commission.truncated,
    pendingRecharges: pending.counts.driver + pending.counts.vendor,
    movementsToday: (driverToday.count ?? 0) + (vendorToday.count ?? 0),
  };
}

// GET /api/admin/finanzas?section=summary|commissions|pending|movements (solo admin)
//   movements acepta ?type=<tipo>&q=<texto>
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section') || 'summary';

  try {
    const db = sbAdmin() as Db;
    switch (section) {
      case 'summary':
        return NextResponse.json(await summary(db));
      case 'commissions':
        return NextResponse.json(await commissions(db));
      case 'pending':
        return NextResponse.json(await pendingRecharges(db));
      case 'movements': {
        const type = (searchParams.get('type') || '').trim().slice(0, 40);
        return NextResponse.json(await movements(db, type, searchParams.get('q') || ''));
      }
      default:
        return NextResponse.json({ error: 'Sección inválida' }, { status: 400 });
    }
  } catch (err) {
    console.error('[admin/finanzas] error:', err);
    return NextResponse.json({ error: 'No se pudieron cargar los datos financieros' }, { status: 500 });
  }
}
