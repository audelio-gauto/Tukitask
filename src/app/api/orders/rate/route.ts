import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(url, key);
};

/**
 * POST /api/orders/rate
 * Body: { order_id, rated_by: 'client'|'driver', rating: 1–5, note?: string }
 *
 * - rated_by='client'  → saves driver_rating on order, recalculates driver_profiles.avg_rating
 * - rated_by='driver'  → saves client_rating on order, recalculates client_profiles.avg_rating
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { order_id, rated_by, rating, note } = body;

    if (!order_id || !rated_by || rating == null) {
      return NextResponse.json({ error: 'order_id, rated_by y rating son requeridos' }, { status: 400 });
    }
    if (!['client', 'driver'].includes(rated_by)) {
      return NextResponse.json({ error: 'rated_by debe ser "client" o "driver"' }, { status: 400 });
    }
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: 'rating debe estar entre 1 y 5' }, { status: 400 });
    }

    const sb = getSupabase();

    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('id, status, accepted_by, client_email, driver_rating, client_rating')
      .eq('id', order_id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    const DELIVERED_STATUSES = ['delivered', 'commission_charged', 'client_confirmed'];
    if (!DELIVERED_STATUSES.includes(order.status)) {
      return NextResponse.json({ error: 'Solo se puede calificar un pedido entregado' }, { status: 400 });
    }

    if (rated_by === 'client') {
      if (order.driver_rating !== null && order.driver_rating !== undefined) {
        return NextResponse.json({ error: 'Ya calificaste a este conductor' }, { status: 409 });
      }
      await sb.from('orders').update({
        driver_rating: ratingNum,
        driver_rating_note: note || null,
      }).eq('id', order_id);

      // Recalculate driver avg_rating
      const driverEmail = order.accepted_by;
      if (driverEmail) {
        const { data: ratings } = await sb
          .from('orders')
          .select('driver_rating')
          .eq('accepted_by', driverEmail)
          .not('driver_rating', 'is', null);
        if (ratings && ratings.length > 0) {
          const avg = ratings.reduce((s: number, r: { driver_rating: number }) => s + r.driver_rating, 0) / ratings.length;
          await sb.from('driver_profiles').upsert(
            { email: driverEmail, avg_rating: Math.round(avg * 10) / 10, total_ratings: ratings.length },
            { onConflict: 'email' }
          );
        }
      }
    } else {
      if (order.client_rating !== null && order.client_rating !== undefined) {
        return NextResponse.json({ error: 'Ya calificaste a este cliente' }, { status: 409 });
      }
      await sb.from('orders').update({
        client_rating: ratingNum,
        client_rating_note: note || null,
      }).eq('id', order_id);

      // Recalculate client avg_rating
      const clientEmail = order.client_email;
      if (clientEmail) {
        const { data: ratings } = await sb
          .from('orders')
          .select('client_rating')
          .eq('client_email', clientEmail)
          .not('client_rating', 'is', null);
        if (ratings && ratings.length > 0) {
          const avg = ratings.reduce((s: number, r: { client_rating: number }) => s + r.client_rating, 0) / ratings.length;
          await sb.from('client_profiles').upsert(
            { email: clientEmail, avg_rating: Math.round(avg * 10) / 10, total_ratings: ratings.length },
            { onConflict: 'email' }
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
