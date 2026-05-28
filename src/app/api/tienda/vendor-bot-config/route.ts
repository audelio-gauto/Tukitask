import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type VendorBotConfigRow = {
  vendor_id: string;
  bot_enabled: boolean | null;
};

function parseIds(input: string | null) {
  return (input || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const vendorId = url.searchParams.get('vendorId')?.trim() || '';
    const vendorIds = parseIds(url.searchParams.get('vendorIds'));
    const ids = vendorIds.length > 0 ? vendorIds : (vendorId ? [vendorId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ configs: {} });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from('vendor_bot_config')
      .select('vendor_id, bot_enabled')
      .in('vendor_id', ids);

    if (error) throw new Error(error.message);

    const rows = (data || []) as VendorBotConfigRow[];
    const configs: Record<string, { botEnabled: boolean }> = {};
    for (const id of ids) {
      const row = rows.find((item) => item.vendor_id === id);
      configs[id] = { botEnabled: row?.bot_enabled ?? true };
    }

    if (vendorId && vendorIds.length === 0) {
      return NextResponse.json({ config: configs[vendorId] ?? { botEnabled: true } });
    }

    return NextResponse.json({ configs });
  } catch {
    return NextResponse.json({ configs: {} }, { status: 200 });
  }
}