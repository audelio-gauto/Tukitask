import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { createClient } from '@supabase/supabase-js';

// Lazy proxy — createClient is only called on first request, never at build time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sb: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = new Proxy({}, { get(_t, p) { _sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string); return _sb[p]; } });

// Vercel Cron Jobs envía automáticamente:
//   Authorization: Bearer <CRON_SECRET>
// donde CRON_SECRET está definido en las env vars del proyecto Vercel.
// Ver: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // Sin secreto configurado → solo permitir en desarrollo local
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development';
  }
  const authHeader = req.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Llamar a la función PostgreSQL que hace toda la limpieza atómica
    const { data, error } = await sb.rpc('fn_cleanup_stale_data');

    if (error) {
      console.error('[cron/cleanup] DB error:', error.message);
      return serverError(error);
    }

    const result = data as {
      driver_feed_deleted:   number;
      tecnico_feed_deleted:  number;
      notifications_deleted: number;
      offers_deleted:        number;
      executed_at:           string;
    };

    console.log('[cron/cleanup] Completado:', result);

    return NextResponse.json({
      ok: true,
      summary: {
        driver_feed_deleted:   result.driver_feed_deleted,
        tecnico_feed_deleted:  result.tecnico_feed_deleted,
        notifications_deleted: result.notifications_deleted,
        offers_deleted:        result.offers_deleted,
        executed_at:           result.executed_at,
      },
    });
  } catch (err) {
    console.error('[cron/cleanup] Error inesperado:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
