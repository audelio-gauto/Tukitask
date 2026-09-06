import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data, error } = await db
    .from('market_orders')
    .select('id, status, vendor_email, vendor_id, client_name, items, total, shipping_price, address, payment_method, created_at, delivery')
    .eq('client_email', email)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []) as Array<Record<string, unknown> & { vendor_id?: string | null }>;

  // Best-effort store branding lookup (name + logo) — never fails the main response.
  const vendorIds = Array.from(new Set(orders.map((o) => o.vendor_id).filter((v): v is string => Boolean(v))));
  const storeInfo = new Map<string, { name: string | null; logo: string | null }>();
  if (vendorIds.length > 0) {
    try {
      const { data: stores } = await db
        .from('store_configs')
        .select('vendor_id, config')
        .in('vendor_id', vendorIds);
      for (const row of (stores ?? []) as Array<{ vendor_id: string; config: { storeName?: string; logoImage?: string } }>) {
        storeInfo.set(row.vendor_id, {
          name: row.config?.storeName?.trim() || null,
          logo: row.config?.logoImage || null,
        });
      }
    } catch { /* ignore — fall back to vendor_email on the client */ }
  }

  const enriched = orders.map((o) => ({
    ...o,
    store_name: (o.vendor_id && storeInfo.get(o.vendor_id)?.name) || null,
    store_logo: (o.vendor_id && storeInfo.get(o.vendor_id)?.logo) || null,
  }));

  return NextResponse.json(enriched);
}
