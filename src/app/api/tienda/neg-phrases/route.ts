import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const DEFAULT_PHRASES = [
  'Dame 3 segundos…',
  'Le estoy convenciendo 😏',
  'Dame 3 segundos más, ya casi…',
  'El vendedor respiró hondo…',
  'Creo que acepta...',
  '🤖 Dame unos segundos… está dudando...',
  '📉 El precio acaba de tambalearse...',
];

const DEFAULT_CLIMAX = {
  accepted: '😮 ALTO… creo que va a aceptar',
  countered: '👀 El vendedor no cedió más, pero bajó bastante',
};

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['neg_anim_phrases', 'neg_anim_climax_accepted', 'neg_anim_climax_countered', 'neg_anim_min_seconds']);

    const get = (key: string) => data?.find((r) => r.key === key)?.value ?? '';

    let phrases = DEFAULT_PHRASES;
    const rawPhrases = get('neg_anim_phrases');
    if (rawPhrases) {
      try {
        const parsed = JSON.parse(rawPhrases);
        if (Array.isArray(parsed) && parsed.length > 0) phrases = parsed;
      } catch {
        // fall back to defaults
      }
    }

    const rawSeconds = Number(get('neg_anim_min_seconds'));
    const minSeconds = Number.isFinite(rawSeconds) && rawSeconds >= 10 ? rawSeconds : 40;

    return NextResponse.json({
      phrases,
      climax: {
        accepted:  get('neg_anim_climax_accepted')  || DEFAULT_CLIMAX.accepted,
        countered: get('neg_anim_climax_countered') || DEFAULT_CLIMAX.countered,
      },
      minSeconds,
    });
  } catch {
    return NextResponse.json({
      phrases: DEFAULT_PHRASES,
      climax: DEFAULT_CLIMAX,
      minSeconds: 40,
    });
  }
}
