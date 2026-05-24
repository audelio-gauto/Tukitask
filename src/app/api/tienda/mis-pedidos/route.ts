import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const { data, error } = await sbAdmin()
    .from('market_orders')
    .select('id, status, vendor_email, client_name, items, total, created_at, delivery')
    .eq('client_email', email)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
