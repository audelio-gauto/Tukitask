import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET: Fetch all pricing config
export async function GET() {
  try {
    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });

    const [multipliers, vehicles, settings] = await Promise.all([
      sb.from('package_multipliers').select('*').order('sort_order'),
      sb.from('vehicle_pricing').select('*').order('sort_order'),
      sb.from('pricing_settings').select('*').order('key'),
    ]);

    if (multipliers.error) return NextResponse.json({ error: multipliers.error.message }, { status: 500 });
    if (vehicles.error) return NextResponse.json({ error: vehicles.error.message }, { status: 500 });
    if (settings.error) return NextResponse.json({ error: settings.error.message }, { status: 500 });

    return NextResponse.json({
      package_multipliers: multipliers.data,
      vehicle_pricing: vehicles.data,
      pricing_settings: settings.data,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT: Update pricing config
export async function PUT(req: Request) {
  try {
    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });

    const body = await req.json();
    const { package_multipliers, vehicle_pricing, pricing_settings } = body;
    const errors: string[] = [];

    // Update package multipliers
    if (Array.isArray(package_multipliers)) {
      for (const item of package_multipliers) {
        const multiplier = parseFloat(item.multiplier);
        if (isNaN(multiplier) || multiplier < 0 || multiplier > 100) {
          errors.push(`Multiplicador inválido para ${item.package_type}`);
          continue;
        }
        const { error } = await sb
          .from('package_multipliers')
          .update({ multiplier, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) errors.push(`package_multipliers ${item.id}: ${error.message}`);
      }
    }

    // Update vehicle pricing
    if (Array.isArray(vehicle_pricing)) {
      for (const item of vehicle_pricing) {
        const basePrice = item.base_price === '' || item.base_price === null ? null : parseFloat(item.base_price);
        const pricePerKm = item.price_per_km === '' || item.price_per_km === null ? null : parseFloat(item.price_per_km);

        if (basePrice !== null && (isNaN(basePrice) || basePrice < 0)) {
          errors.push(`Precio base inválido para ${item.vehicle_type}`);
          continue;
        }
        if (pricePerKm !== null && (isNaN(pricePerKm) || pricePerKm < 0)) {
          errors.push(`Precio por KM inválido para ${item.vehicle_type}`);
          continue;
        }

        const { error } = await sb
          .from('vehicle_pricing')
          .update({ base_price: basePrice, price_per_km: pricePerKm, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) errors.push(`vehicle_pricing ${item.id}: ${error.message}`);
      }
    }

    // Update pricing settings
    if (Array.isArray(pricing_settings)) {
      for (const item of pricing_settings) {
        const value = parseFloat(item.value);
        if (isNaN(value) || value < 0) {
          errors.push(`Valor inválido para ${item.key}`);
          continue;
        }
        const { error } = await sb
          .from('pricing_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) errors.push(`pricing_settings ${item.id}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
