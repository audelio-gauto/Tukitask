import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

export const dynamic = 'force-dynamic';

// Public endpoint — returns service_pricing for client-side use
export async function GET() {
  const { data, error } = await supabaseServer
    .from('service_pricing')
    .select('service_type, suggested_price')
    .order('sort_order');

  if (error) return NextResponse.json({ pricing: {} }, { status: 200 });

  // Build a map: { service_type: suggested_price | null }
  const pricing: Record<string, number | null> = {};
  for (const row of data || []) {
    pricing[row.service_type] = row.suggested_price ?? null;
  }
  return NextResponse.json({ pricing }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
