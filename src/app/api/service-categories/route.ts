import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin } from '@/lib/apiAuth';

// GET /api/service-categories — public list of active service categories
export async function GET() {
  const { data, error } = await sbAdmin()
    .from('service_pricing')
    .select('service_type, label, emoji, gender, suggested_price, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) return serverError(error);

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
