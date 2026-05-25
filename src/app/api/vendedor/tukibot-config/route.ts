import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type BotTone       = 'informal' | 'formal' | 'agresivo' | 'amigable';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';
type CounterFormula = 'midpoint' | 'percentage' | 'fixed';

interface BotConfig {
  botEnabled:        boolean;
  botTone:           BotTone;
  botTimeoutMinutes: number;
  botTimeoutAction:  TimeoutAction;
  botCounterFormula: CounterFormula;
  botCounterPercent: number;
  autoAcceptAbove:   number;
}

const DEFAULTS: BotConfig = {
  botEnabled:        true,
  botTone:           'amigable',
  botTimeoutMinutes: 15,
  botTimeoutAction:  'auto_counter',
  botCounterFormula: 'midpoint',
  botCounterPercent: 10,
  autoAcceptAbove:   90,
};

function rowToConfig(row: Record<string, unknown>): BotConfig {
  return {
    botEnabled:        Boolean(row.bot_enabled ?? DEFAULTS.botEnabled),
    botTone:           (row.bot_tone as BotTone)           ?? DEFAULTS.botTone,
    botTimeoutMinutes: Number(row.timeout_minutes)         ?? DEFAULTS.botTimeoutMinutes,
    botTimeoutAction:  (row.timeout_action as TimeoutAction) ?? DEFAULTS.botTimeoutAction,
    botCounterFormula: (row.counter_formula as CounterFormula) ?? DEFAULTS.botCounterFormula,
    botCounterPercent: Number(row.counter_percent)         ?? DEFAULTS.botCounterPercent,
    autoAcceptAbove:   Number(row.auto_accept_above)       ?? DEFAULTS.autoAcceptAbove,
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
    vendor_id:        user.id,
    bot_enabled:      body.botEnabled      ?? DEFAULTS.botEnabled,
    bot_tone:         body.botTone         ?? DEFAULTS.botTone,
    timeout_minutes:  body.botTimeoutMinutes ?? DEFAULTS.botTimeoutMinutes,
    timeout_action:   body.botTimeoutAction ?? DEFAULTS.botTimeoutAction,
    counter_formula:  body.botCounterFormula ?? DEFAULTS.botCounterFormula,
    counter_percent:  body.botCounterPercent ?? DEFAULTS.botCounterPercent,
    auto_accept_above: body.autoAcceptAbove ?? DEFAULTS.autoAcceptAbove,
    updated_at:       new Date().toISOString(),
  };

  const { error } = await sbAdmin()
    .from('vendor_bot_config')
    .upsert(record, { onConflict: 'vendor_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
