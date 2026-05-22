import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET — unified paginated orders + tecnico_jobs + market_orders for admin
// ?type=all|orders|tecnico|venta
// &status=pending,accepted,...
// &page=1&limit=50
// &search=email_or_id
// &driver=email
// &date_from=ISO&date_to=ISO
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type     = searchParams.get('type') || 'all';          // all | orders | tecnico | venta
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
  let totalVenta = 0;

  /* ── ORDERS ──────────────────────────────────────────────────── */
  if (type === 'all' || type === 'orders') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .from('orders')
      .select(
        'id, created_at, status, client_email, pickup_address, delivery_address, ' +
        'vehicle_type, offer, suggested_price, accepted_by, accepted_at, completed_at, ' +
        'cancelled_at, payment_method, description, is_multi_stop, stop_count, ' +
        'order_type, ' +
        'order_stops(sequence, address, lat, lng, status, fail_reason)',
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

  /* ── MARKET ORDERS (Ventas) ──────────────────────────────────── */
  if (type === 'all' || type === 'venta') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (db as any)
      .from('market_orders')
      .select(
        'id, created_at, updated_at, status, vendor_email, client_email, client_name, ' +
        'items, total, final_price, address, driver_email, ' +
        'accepted_at, completed_at, cancelled_at, negotiated, notes',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (statuses.length > 0) q = q.in('status', statuses);
    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo);
    if (search) {
      q = q.or(
        `client_email.ilike.%${search}%,vendor_email.ilike.%${search}%,address.ilike.%${search}%,id.eq.${isUUID(search) ? search : '00000000-0000-0000-0000-000000000000'}`
      );
    }

    if (type === 'venta') {
      q = q.range(offset, offset + limit - 1);
    } else {
      q = q.limit(200);
    }

    const { data, count, error } = await q;
    // Graceful fallback if table doesn't exist yet (migration pending)
    if (error) {
      const msg = String((error as Record<string, unknown>)?.message || error);
      if (msg.includes('market_orders') || msg.includes('schema cache') || msg.includes('does not exist')) {
        // Table not yet created — return empty, don't crash
        totalVenta = 0;
      } else {
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else {
      totalVenta = count ?? 0;
      const enriched = (data || []).map((v: Record<string, unknown>) => ({
        ...v,
        _type: 'venta',
        _driver_active: v.driver_email ? activeDriverEmails.has(String(v.driver_email)) : false,
      }));
      results.push(...enriched);
    }
  }

  /* ── For "all": sort combined by created_at desc, then paginate ── */
  let paginatedResults = results;
  let total = totalOrders + totalTecnico + totalVenta;

  if (type === 'all') {
    results.sort((a, b) => {
      const ta = new Date((a as Record<string, unknown>).created_at as string).getTime();
      const tb = new Date((b as Record<string, unknown>).created_at as string).getTime();
      return tb - ta;
    });
    total = totalOrders + totalTecnico + totalVenta;
    paginatedResults = results.slice(offset, offset + limit);
  } else if (type === 'orders') {
    total = totalOrders;
    paginatedResults = results;
  } else if (type === 'tecnico') {
    total = totalTecnico;
    paginatedResults = results;
  } else {
    total = totalVenta;
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

// PATCH — cancel, set_status, or reassign an order/tecnico job from admin
export async function PATCH(req: Request) {
  try {
    return await handlePatch(req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin PATCH] Unhandled error:', msg, err);
    return NextResponse.json({ error: `Unhandled: ${msg}` }, { status: 500 });
  }
}

async function handlePatch(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { id?: string; type?: 'order' | 'tecnico' | 'venta'; action?: string; status?: string; driver_email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { id, type, action } = body;
  if (!id || !type || !action) {
    return NextResponse.json({ error: 'id, type, and action required' }, { status: 400 });
  }

  const db = sbAdmin();
  const table = type === 'order' ? 'orders' : type === 'tecnico' ? 'tecnico_jobs' : 'market_orders';
  const terminalStatuses = ['delivered', 'commission_charged', 'client_confirmed', 'cancelled', 'failed', 'returned', 'completado', 'rechazado'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (db as any).from(table).select('status, accepted_by, driver_email').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    if (terminalStatuses.includes(row.status)) {
      return NextResponse.json({ error: `No se puede cancelar — estado actual: ${row.status}` }, { status: 400 });
    }
    const updates: Record<string, unknown> = { status: 'cancelled' };
    if (type === 'order' || type === 'venta') updates.cancelled_at = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from(table).update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log (best-effort — table may not exist yet)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('admin_audit_log').insert({
        admin_email: admin.email, action: 'cancel_order', target_type: type,
        target_id: id, metadata: { prev_status: row.status },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  }

  // ── Force status change ───────────────────────────────────────────────────
  if (action === 'set_status') {
    const { status: newStatus } = body;
    if (!newStatus) return NextResponse.json({ error: 'status required' }, { status: 400 });

    let rpcError: unknown = null;

    if (type === 'order') {
      const cancelledAt = newStatus === 'cancelled' ? new Date().toISOString() : null;
      const completedAt = ['delivered', 'commission_charged'].includes(newStatus) ? new Date().toISOString() : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).rpc('admin_force_set_order_status', {
        p_id: id,
        p_status: newStatus,
        p_cancelled_at: cancelledAt,
        p_completed_at: completedAt,
      });
      rpcError = error;
    } else if (type === 'venta') {
      // market_orders: direct update (no RPC needed)
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'cancelled') updates.cancelled_at = new Date().toISOString();
      if (newStatus === 'delivered') updates.completed_at = new Date().toISOString();
      if (newStatus === 'preparing' && !row.accepted_at) updates.accepted_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).from('market_orders').update(updates).eq('id', id);
      rpcError = error;
    } else {
      const completedAt = newStatus === 'completado' ? new Date().toISOString() : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db as any).rpc('admin_force_set_tecnico_status', {
        p_id: id,
        p_status: newStatus,
        p_completed_at: completedAt,
      });
      rpcError = error;
    }

    if (rpcError) {
      const e = rpcError as Record<string, unknown>;
      // Use getOwnPropertyNames to capture non-enumerable Error properties (like message)
      const fullErr = JSON.stringify(rpcError, Object.getOwnPropertyNames(rpcError as object));
      console.error('[admin set_status] RPC error:', fullErr);
      const msg = String(e?.message || e?.details || e?.code || fullErr || 'DB error desconocido');
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Audit log (best-effort)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('admin_audit_log').insert({
        admin_email: admin.email, action: 'set_status', target_type: type,
        target_id: id, metadata: { prev_status: row.status, new_status: newStatus },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  }

  // ── Reassign driver ───────────────────────────────────────────────────────
  if (action === 'reassign') {
    const { driver_email } = body;
    if (!driver_email) return NextResponse.json({ error: 'driver_email required' }, { status: 400 });

    // Validate driver exists (skip for venta — any driver can be assigned)
    if (type !== 'venta') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: driverUser } = await (db as any).from('users').select('email, role').eq('email', driver_email.toLowerCase().trim()).maybeSingle();
      if (!driverUser) return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
      if (!['driver', 'tecnico'].includes(driverUser.role)) {
        return NextResponse.json({ error: 'El usuario no es driver ni técnico' }, { status: 400 });
      }
    }

    const field = type === 'order' ? 'accepted_by' : type === 'venta' ? 'driver_email' : 'tecnico_email';
    const updates: Record<string, unknown> = {
      [field]: driver_email.toLowerCase().trim(),
      status: type === 'venta' ? 'in_transit' : 'accepted',
      accepted_at: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from(table).update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log (best-effort)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('admin_audit_log').insert({
        admin_email: admin.email, action: 'reassign_driver', target_type: type,
        target_id: id, metadata: { prev_driver: row.accepted_by, new_driver: driver_email },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
}
