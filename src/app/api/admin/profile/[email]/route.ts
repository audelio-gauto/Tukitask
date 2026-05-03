import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET /api/admin/profile/[email]
// Returns unified profile data for a user (driver, client, tecnico)
export async function GET(req: Request, { params }: { params: Promise<{ email: string }> }) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

  const db = sbAdmin();

  try {
    const [
      userRes, clientProfileRes, driverProfileRes,
      ordersAsClientRes, ordersAsDriverRes,
      walletRes, walletTxRes,
      ratingsReceivedRes, ratingsGivenRes,
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('users').select('id, email, role, created_at').eq('email', email).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('client_profiles').select('display_name, phone, photo_url, avg_rating, total_ratings').eq('email', email).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('driver_profiles').select('display_name, phone, photo_url, vehicle_type, avg_rating, total_ratings, status, documents_verified').eq('email', email).maybeSingle(),
      // Orders as client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('orders')
        .select('id, status, offer, suggested_price, created_at, accepted_by')
        .eq('client_email', email)
        .order('created_at', { ascending: false })
        .limit(10),
      // Orders as driver
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('orders')
        .select('id, status, offer, suggested_price, created_at, client_email')
        .eq('accepted_by', email)
        .order('created_at', { ascending: false })
        .limit(10),
      // Wallet balance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('driver_wallets').select('balance, updated_at').eq('driver_email', email).maybeSingle(),
      // Wallet transactions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('wallet_transactions')
        .select('amount, type, description, created_at')
        .eq('driver_email', email)
        .order('created_at', { ascending: false })
        .limit(10),
      // Ratings received
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('ratings')
        .select('score, comment, rater_email, created_at')
        .eq('rated_email', email)
        .order('created_at', { ascending: false })
        .limit(10),
      // Ratings given
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any)
        .from('ratings')
        .select('score, comment, rated_email, created_at')
        .eq('rater_email', email)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (!userRes.data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    return NextResponse.json({
      user: userRes.data,
      client_profile: clientProfileRes.data ?? null,
      driver_profile: driverProfileRes.data ?? null,
      orders_as_client: ordersAsClientRes.data ?? [],
      orders_as_driver: ordersAsDriverRes.data ?? [],
      wallet: walletRes.data ?? null,
      wallet_transactions: walletTxRes.data ?? [],
      ratings_received: ratingsReceivedRes.data ?? [],
      ratings_given: ratingsGivenRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
