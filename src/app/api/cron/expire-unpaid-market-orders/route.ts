import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await sbAdmin().rpc('fn_expire_unpaid_market_orders');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, summary: data });
}