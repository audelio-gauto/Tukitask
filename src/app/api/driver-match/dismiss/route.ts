import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

/**
 * POST /api/driver-match/dismiss
 * Registra que el driver autenticado ignoró una solicitud.
 * Actualiza total_orders_ignored y recalcula acceptance_rate en driver_profiles.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const db = sbAdmin();

  // Llamar al RPC — creado en migration 045
  const { error } = await db.rpc('record_driver_dismiss', {
    p_driver_email: user.email,
  });

  if (error) {
    // Si el RPC no existe todavía (migration no aplicada), ignorar silenciosamente
    if (error.code === 'PGRST202' || error.message?.includes('does not exist')) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return serverError(error);
  }

  return NextResponse.json({ ok: true });
}
