import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type BotTone       = 'informal' | 'formal' | 'agresivo' | 'amigable';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';

interface BotConfig {
  botEnabled:          boolean;
  botTone:             BotTone;
  botTimeoutMinutes:   number;
  botTimeoutAction:    TimeoutAction;
  autoAcceptAbove:     number;
  msgAutoCounter:      string;
  msgAutoAccept:       string;
  msgPressureClient:   string;
}

const DEFAULTS: BotConfig = {
  botEnabled:          true,
  botTone:             'amigable',
  botTimeoutMinutes:   15,
  botTimeoutAction:    'auto_counter',
  autoAcceptAbove:     90,
  msgAutoCounter:      '🔥 Oferta exclusiva hasta las {hora}. Aprovechá este precio especial antes de que vuelva a subir.',
  msgAutoAccept:       'Tu oferta fue aprobada por tiempo limitado hasta las {hora}. Confirmá ahora y asegurá este precio antes de que regrese al valor normal.',
  msgPressureClient:   '⚡ Última oportunidad hasta las {hora}. Aprovechá el descuento antes de que el precio vuelva a aumentar.',
};

function rowToConfig(row: Record<string, unknown>): BotConfig {
  return {
    botEnabled:          Boolean(row.bot_enabled ?? DEFAULTS.botEnabled),
    botTone:             (row.bot_tone as BotTone)             ?? DEFAULTS.botTone,
    botTimeoutMinutes:   Number(row.timeout_minutes)           ?? DEFAULTS.botTimeoutMinutes,
    botTimeoutAction:    (row.timeout_action as TimeoutAction) ?? DEFAULTS.botTimeoutAction,
    autoAcceptAbove:     Number(row.auto_accept_above)         ?? DEFAULTS.autoAcceptAbove,
    msgAutoCounter:      (row.msg_auto_counter    as string)   ?? DEFAULTS.msgAutoCounter,
    msgAutoAccept:       (row.msg_auto_accept     as string)   ?? DEFAULTS.msgAutoAccept,
    msgPressureClient:   (row.msg_pressure_client as string)   ?? DEFAULTS.msgPressureClient,
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
    timeout_minutes:     body.botTimeoutMinutes   ?? DEFAULTS.botTimeoutMinutes,
    timeout_action:      body.botTimeoutAction    ?? DEFAULTS.botTimeoutAction,
    auto_accept_above:   body.autoAcceptAbove      ?? DEFAULTS.autoAcceptAbove,
    msg_auto_counter:    body.msgAutoCounter       ?? DEFAULTS.msgAutoCounter,
    msg_auto_accept:     body.msgAutoAccept        ?? DEFAULTS.msgAutoAccept,
    msg_pressure_client: body.msgPressureClient    ?? DEFAULTS.msgPressureClient,
    updated_at:          new Date().toISOString(),
  };

  const { error } = await sbAdmin()
    .from('vendor_bot_config')
    .upsert(record, { onConflict: 'vendor_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
