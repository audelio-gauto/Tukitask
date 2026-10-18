import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

interface VendorRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface SuspensionRow {
  user_id: string;
  is_suspended: boolean;
  is_blocked: boolean;
  is_active: boolean;
  suspension_reason: string | null;
  banned_until: string | null;
}

// GET /api/admin/vendors?page=1&limit=25&search=email&status=all
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')   || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '25'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAdmin() as any;

    if (searchParams.get('summary') === '1') {
      const now = Date.now();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const paraguayNow = new Date(now - 3 * 60 * 60 * 1000);
      const monthStart = new Date(Date.UTC(
        paraguayNow.getUTCFullYear(),
        paraguayNow.getUTCMonth(),
        1,
      ) + 3 * 60 * 60 * 1000).toISOString();

      const [vendors, vendorAccounts, newThisWeek, activeOrders] = await Promise.all([
        db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'vendedor'),
        db.from('users').select('email').eq('role', 'vendedor'),
        db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'vendedor').gte('created_at', weekAgo),
        db.from('market_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'preparing', 'ready', 'in_transit']),
      ]);

      const checks = [
        { label: 'vendedores', result: vendors },
        { label: 'correos_vendedores', result: vendorAccounts },
        { label: 'nuevos_esta_semana', result: newThisWeek },
        { label: 'pedidos_activos', result: activeOrders },
      ];
      const failedQuery = checks.find(({ result }) => result.error);
      if (failedQuery) {
        const { error } = failedQuery.result;
        return NextResponse.json({
          error: `Error en ${failedQuery.label}: ${error.message || error.code || 'consulta no disponible'}`,
        }, { status: 500 });
      }

      const vendorEmails = new Set<string>(
        (vendorAccounts.data ?? [])
          .map((row: { email?: string | null }) => row.email?.toLowerCase())
          .filter((email: string | undefined): email is string => Boolean(email)),
      );
      let suspendedCount = 0;
      const authPageSize = 100;
      for (let page = 1; page <= 20 && vendorEmails.size > 0; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: authPageSize });
        if (error) {
          return NextResponse.json({ error: `Error en estado_de_suspension: ${error.message || 'consulta no disponible'}` }, { status: 500 });
        }
        for (const authUser of data.users as Array<{
          email?: string;
          banned_until?: string | null;
          app_metadata?: Record<string, unknown>;
        }>) {
          if (!authUser.email || !vendorEmails.has(authUser.email.toLowerCase())) continue;
          const bannedUntil = authUser.banned_until ? new Date(authUser.banned_until).getTime() : 0;
          const metadata = authUser.app_metadata ?? {};
          if (bannedUntil > now && (metadata.suspended || metadata.blocked)) suspendedCount++;
        }
        if (data.users.length < authPageSize) break;
        if (page === 20) {
          return NextResponse.json({ error: 'No se pudo completar la revisión de suspensiones.' }, { status: 500 });
        }
      }

      let commissionsThisMonth = 0;
      const pageSize = 1000;
      const maxPages = 20;
      for (let page = 0; page < maxPages; page++) {
        const { data: rows, error } = await db
          .from('vendor_wallet_transactions')
          .select('amount')
          .eq('type', 'sale_commission')
          .gte('created_at', monthStart)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
          return NextResponse.json({ error: `Error en comisiones_del_mes: ${error.message || 'consulta no disponible'}` }, { status: 500 });
        }

        for (const row of rows ?? []) commissionsThisMonth += Math.abs(Number(row.amount) || 0);
        if ((rows ?? []).length < pageSize) break;
        if (page === maxPages - 1) {
          return NextResponse.json({ error: 'Demasiadas comisiones para calcular el resumen.' }, { status: 500 });
        }
      }

      return NextResponse.json({
        total: vendors.count ?? 0,
        newThisWeek: newThisWeek.count ?? 0,
        suspended: suspendedCount,
        activeOrders: activeOrders.count ?? 0,
        commissionsThisMonth,
      });
    }

    let query = db
      .from('users')
      .select('id, email, role, created_at', { count: 'exact' })
      .eq('role', 'vendedor')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data: vendorRows, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const vendors = (vendorRows ?? []) as VendorRow[];

    // Weekly stat: vendors registered in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newThisWeek } = await db
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'vendedor')
      .gte('created_at', weekAgo);

    // Suspension status for these vendors
    const ids = vendors.map((vendor) => vendor.id);
    const suspMap = new Map<string, SuspensionRow>();
    if (ids.length > 0) {
      const { data: suspRows } = await db
        .from('user_suspensions')
        .select('user_id, is_suspended, is_blocked, is_active, suspension_reason, banned_until')
        .in('user_id', ids);
      ((suspRows ?? []) as SuspensionRow[]).forEach((suspension) => suspMap.set(suspension.user_id, suspension));
    }

    const data = vendors.map((vendor) => ({
      ...vendor,
      ...(suspMap.get(vendor.id) ?? { is_suspended: false, is_blocked: false, is_active: true }),
    }));

    return NextResponse.json({
      data,
      total: count ?? 0,
      newThisWeek: newThisWeek ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
