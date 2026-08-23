import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

function normalizeCityEntry(raw: Record<string, unknown>) {
  const city = String(raw.city ?? '').trim();
  if (!city) return null;

  return {
    city,
    shipping_price: Number(raw.shipping_price ?? 0) || 0,
    cash_on_delivery: Boolean(raw.cash_on_delivery),
    transfer: Boolean(raw.transfer),
  };
}

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const db = sbAdmin();
  const { data, error } = await db
    .from('app_config')
    .select('value')
    .eq('key', 'marketplace_delivery_cities')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parsed = data?.value ? JSON.parse(data.value) : { cities: [] };
  const cities = Array.isArray(parsed?.cities)
    ? parsed.cities.map(normalizeCityEntry).filter(Boolean)
    : [];

  return NextResponse.json({ cities });
}

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json().catch(() => null);
  const cityName = String(body?.city ?? '').trim();
  if (!cityName) {
    return NextResponse.json({ error: 'La ciudad es obligatoria.' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data: currentRow, error: currentError } = await db
    .from('app_config')
    .select('value')
    .eq('key', 'marketplace_delivery_cities')
    .maybeSingle();

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

  const current = currentRow?.value ? JSON.parse(currentRow.value) : { cities: [] };
  const entries = Array.isArray(current?.cities) ? current.cities : [];

  const idx = entries.findIndex((entry: Record<string, unknown>) => String(entry.city ?? '').toLowerCase() === cityName.toLowerCase());
  const nextItem = normalizeCityEntry({
    ...((idx >= 0 ? entries[idx] : {}) as Record<string, unknown>),
    city: cityName,
    shipping_price: Number(body?.shipping_price ?? (idx >= 0 ? entries[idx]?.shipping_price : 0)) || 0,
    cash_on_delivery: body?.cash_on_delivery ?? (idx >= 0 ? Boolean(entries[idx]?.cash_on_delivery) : true),
    transfer: body?.transfer ?? (idx >= 0 ? Boolean(entries[idx]?.transfer) : true),
  });

  if (!nextItem) {
    return NextResponse.json({ error: 'Ciudad inválida.' }, { status: 400 });
  }

  const nextCities = idx >= 0 ? entries.map((entry: Record<string, unknown>, i: number) => i === idx ? nextItem : normalizeCityEntry(entry)).filter(Boolean) : [...entries.map(normalizeCityEntry).filter(Boolean), nextItem];

  const { error } = await db.from('app_config').upsert({
    key: 'marketplace_delivery_cities',
    value: JSON.stringify({ cities: nextCities }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, city: nextItem });
}

export async function PUT(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json().catch(() => null);
  const cities = Array.isArray(body?.cities) ? body.cities.map(normalizeCityEntry).filter(Boolean) : [];

  const db = sbAdmin();
  const { error } = await db.from('app_config').upsert({
    key: 'marketplace_delivery_cities',
    value: JSON.stringify({ cities }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cities });
}
