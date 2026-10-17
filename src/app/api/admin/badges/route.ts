import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type CountResult = { count: number | null; error: { message: string } | null };

// GET /api/admin/badges — contadores del menú lateral del panel (solo admin).
// Las claves coinciden con el href de cada entrada del menú.
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAdmin() as any;
    const head = (table: string) => db.from(table).select('*', { count: 'exact', head: true });
    const value = (label: string, { count, error }: CountResult) => {
      if (error) {
        console.error(`[admin/badges] ${label}:`, error.message);
        return null;
      }
      return count ?? 0;
    };

    const [products, disputes, driverRecharges, vendorRecharges] = await Promise.all([
      head('products').eq('status', 'pending_review') as Promise<CountResult>,
      head('reports').eq('reference_type', 'order').in('status', ['pending', 'reviewing']) as Promise<CountResult>,
      head('recharge_requests').eq('status', 'pending') as Promise<CountResult>,
      head('vendor_recharge_requests').eq('status', 'pending') as Promise<CountResult>,
    ]);

    const payments = [value('driver_recharges', driverRecharges), value('vendor_recharges', vendorRecharges)];

    const counts: Record<string, number> = {};
    const productsCount = value('products', products);
    const disputesCount = value('disputes', disputes);
    if (productsCount !== null) counts['/admin/vendors/productos/aprobar'] = productsCount;
    if (disputesCount !== null) counts['/admin/vendors/pedidos/disputas'] = disputesCount;
    if (payments.every((n) => n !== null)) {
      counts['/admin/finanzas/pagos-pendientes'] = (payments[0] as number) + (payments[1] as number);
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error('[admin/badges] unexpected error:', err);
    return NextResponse.json({ error: 'No se pudieron cargar los contadores' }, { status: 500 });
  }
}
