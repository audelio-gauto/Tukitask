import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  const authHeader = req.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [{ data, error }, { data: cleanupData, error: cleanupError }] = await Promise.all([
      sb.rpc('fn_tukibot_process_timeouts'),
      sb.rpc('fn_tukibot_cleanup_expired_negotiations'),
    ]);
    if (error) return serverError(error, 'cron/tukibot-timeouts');
    if (cleanupError) return serverError(cleanupError, 'cron/tukibot-timeouts.cleanup');

    const result = data as {
      auto_counter_processed: number;
      auto_accept_processed: number;
      pressure_processed: number;
      total_processed: number;
      executed_at: string;
    };

    return NextResponse.json({
      ok: true,
      summary: result,
      cleanup: cleanupData,
    });
  } catch (err) {
    return serverError(err, 'cron/tukibot-timeouts');
  }
}
