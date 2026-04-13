import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET — unified paginated orders + tecnico_jobs for admin
// ?type=all|orders|tecnico
// &status=pending,accepted,...
// &page=1&limit=50
// &search=email_or_id
// &driver=email
// &date_from=ISO&date_to=ISO
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type     = searchParams.get('type') || 'all';          // all | orders | tecnico
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit    = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const offset   = (page - 1) * limit;
  const search   = (searchParams.get('search') || '').trim().slice(0, 200);
  const statusRaw = searchParams.get('status') || '';           // comma-separated
  const driver   = (searchParams.get('driver') || '').trim();
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo   = searchParams.get('date_to') || '';

  const statuses = statusRaw ? statusRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const db = sbAdmin();

  /* ── Fetch driver_locations to mark active (< 5 min) ──────────── */
  const { data: locations } = await db
    .from('driver_locations')
    .select('driver_email, updated_at')
    .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

  const activeDriverEmails = new Set<string>(
    (locations || []).map((l: { driver_email: string }) => l.driver_email)
  );

  const results: object[] = [];
  let totalOrders = 0;
  let totalTecnico = 0;

  /* ── ORDERS ──────────────────────────────────────────────────── */
  if (type === 'all' || type === 'orders') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .from('orders')
      .select(
        'id, created_at, status, client_email, pickup_address, delivery_address, ' +
        'vehicle_type, offer, suggested_price, accepted_by, accepted_at, completed_at, ' +
        'cancelled_at, payment_method, description',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (statuses.length > 0) q = q.in('status', statuses);
    if (driver) q = q.eq('accepted_by', driver);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo);
    if (search) {
      q = q.or(
        `client_email.ilike.%${search}%,accepted_by.ilike.%${search}%,pickup_address.ilike.%${search}%,id.eq.${isUUID(search) ? search : '00000000-0000-0000-0000-000000000000'}`
      );
    }

    // For "all" type, we still need full count; pagination applied only when type=orders
    if (type === 'orders') {
      q = q.range(offset, offset + limit - 1);
    } else {
      q = q.limit(500); // cap for combined view
    }

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    totalOrders = count ?? 0;

    // Enrich with driver active status
    const enriched = (data || []).map((o: Record<string, unknown>) => ({
      ...o,
      _type: 'order',
      _driver_active: o.accepted_by ? activeDriverEmails.has(String(o.accepted_by)) : false,
    }));
    results.push(...enriched);
  }

  /* ── TECNICO JOBS ─────────────────────────────────────────────── */
  if (type === 'all' || type === 'tecnico') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .from('tecnico_jobs')
      .select(
        'id, created_at, updated_at, status, client_email, client_name, ' +
        'tecnico_email, tecnico_name, accepted_at, completed_at, ' +
        'service_type, address, description, agreed_price, client_initial_price',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (statuses.length > 0) q = q.in('status', statuses);
    if (driver) q = q.eq('tecnico_email', driver);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo);
    if (search) {
      q = q.or(
        `client_email.ilike.%${search}%,tecnico_email.ilike.%${search}%,address.ilike.%${search}%,id.eq.${isUUID(search) ? search : '00000000-0000-0000-0000-000000000000'}`
      );
    }

    if (type === 'tecnico') {
      q = q.range(offset, offset + limit - 1);
    } else {
      q = q.limit(500);
    }

    const { data, count, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    totalTecnico = count ?? 0;

    const enriched = (data || []).map((j: Record<string, unknown>) => ({
      ...j,
      _type: 'tecnico',
      _driver_active: j.tecnico_email ? activeDriverEmails.has(String(j.tecnico_email)) : false,
    }));
    results.push(...enriched);
  }

  /* ── For "all": sort combined by created_at desc, then paginate ── */
  let paginatedResults = results;
  let total = totalOrders + totalTecnico;

  if (type === 'all') {
    results.sort((a, b) => {
      const ta = new Date((a as Record<string, unknown>).created_at as string).getTime();
      const tb = new Date((b as Record<string, unknown>).created_at as string).getTime();
      return tb - ta;
    });
    total = results.length;
    paginatedResults = results.slice(offset, offset + limit);
  } else if (type === 'orders') {
    total = totalOrders;
    paginatedResults = results;
  } else {
    total = totalTecnico;
    paginatedResults = results;
  }

  return NextResponse.json({
    data: paginatedResults,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    active_drivers: activeDriverEmails.size,
  });
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
