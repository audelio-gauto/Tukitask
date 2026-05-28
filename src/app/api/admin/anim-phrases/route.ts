import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function PUT(req: Request) {
  try {
    const admin = await getAuthAdmin(req);
    if (!admin) return unauthorized();

    const body = await req.json();
    const { phrases, climaxAccepted, climaxCountered, minSeconds } = body;

    if (!Array.isArray(phrases)) {
      return NextResponse.json({ error: 'phrases debe ser un array' }, { status: 400 });
    }

    const { error } = await supabaseServer.from('app_settings').upsert([
      { key: 'neg_anim_phrases',          value: JSON.stringify(phrases) },
      { key: 'neg_anim_climax_accepted',   value: String(climaxAccepted ?? '') },
      { key: 'neg_anim_climax_countered',  value: String(climaxCountered ?? '') },
      { key: 'neg_anim_min_seconds',       value: String(Number(minSeconds) || 40) },
    ], { onConflict: 'key' });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
