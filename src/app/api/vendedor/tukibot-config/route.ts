import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type BotTone       = 'informal' | 'formal' | 'agresivo' | 'amigable';
type NegotiationProfile = 'balanced' | 'high_close' | 'high_margin';

interface BotConfig {
  botEnabled:          boolean;
  botTone:             BotTone;
  negotiationProfile:  NegotiationProfile;
  autoAcceptAbove:     number;
}

const DEFAULTS: BotConfig = {
  botEnabled:          true,
  botTone:             'amigable',
  negotiationProfile:  'balanced',
  autoAcceptAbove:     90,
};

function normalizeProfile(input: unknown): NegotiationProfile {
  if (input === 'balanced' || input === 'high_close' || input === 'high_margin') {
    return input;
  }
  return 'balanced';
}

function rowToConfig(row: Record<string, unknown>): BotConfig {
  return {
    botEnabled:          Boolean(row.bot_enabled ?? DEFAULTS.botEnabled),
    botTone:             (row.bot_tone as BotTone)             ?? DEFAULTS.botTone,
    negotiationProfile:  normalizeProfile(row.negotiation_profile),
    autoAcceptAbove:     Number(row.auto_accept_above)         ?? DEFAULTS.autoAcceptAbove,
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sbAdmin()
    .from('vendor_bot_config')
    .select('*')
    .eq('vendor_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data ? rowToConfig(data) : DEFAULTS });
}

export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Partial<BotConfig>;

  const record = {
    vendor_id:           user.id,
    bot_enabled:         body.botEnabled          ?? DEFAULTS.botEnabled,
    bot_tone:            body.botTone             ?? DEFAULTS.botTone,
    negotiation_profile: normalizeProfile(body.negotiationProfile),
    auto_accept_above:   body.autoAcceptAbove      ?? DEFAULTS.autoAcceptAbove,
    updated_at:          new Date().toISOString(),
  };

  const { error } = await sbAdmin()
    .from('vendor_bot_config')
    .upsert(record, { onConflict: 'vendor_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
