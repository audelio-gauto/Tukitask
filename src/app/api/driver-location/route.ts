import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

// GET /api/driver-location?job_id=X  → { lat, lng, updated_at } | null
// Requires auth: caller must be the driver themselves, or a client with an active job assigned to that driver.
export async function GET(req: Request) {
  const caller = await getAuthUser(req);
  if (!caller) return unauthorized();

  try {
    const url   = new URL(req.url);
    const jobId = url.searchParams.get('job_id');
    const email = (url.searchParams.get('email') || '').toLowerCase();

    if (jobId) {
      // Verify the caller is the assigned driver or the client of this job
      const { data: job } = await sb
        .from('tecnico_jobs')
        .select('tecnico_email, client_email')
        .eq('id', jobId)
        .maybeSingle();

      if (!job?.tecnico_email) return NextResponse.json(null);

      const isDriver = job.tecnico_email.toLowerCase() === caller.email;
      const isClient = job.client_email?.toLowerCase() === caller.email;
      if (!isDriver && !isClient) return unauthorized('No autorizado para ver esta ubicación');

      const { data: loc } = await sb
        .from('driver_locations')
        .select('lat, lng, updated_at')
        .eq('driver_email', job.tecnico_email)
        .maybeSingle();

      return NextResponse.json(loc ?? null);
    }

    if (email) {
      // Only the driver themselves can query their own location by email
      if (email !== caller.email) return unauthorized('Solo podés consultar tu propia ubicación');

      const { data: loc } = await sb
        .from('driver_locations')
        .select('lat, lng, updated_at, job_id')
        .eq('driver_email', email)
        .maybeSingle();
      return NextResponse.json(loc ?? null);
    }

    return NextResponse.json({ error: 'Missing job_id or email' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/driver-location  body: { job_id, lat, lng }
// driver_email is always taken from the auth token — body value ignored.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { job_id, lat, lng } = body || {};

    if (lat == null || lng == null) {
      return NextResponse.json({ error: 'Missing fields: lat, lng' }, { status: 400 });
    }

    const latN = Number(lat);
    const lngN = Number(lng);
    if (!isFinite(latN) || !isFinite(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const { error } = await sb
      .from('driver_locations')
      .upsert(
        {
          driver_email: user.email,  // always from token
          job_id: job_id ?? null,
          lat: latN,
          lng: lngN,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'driver_email' }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
