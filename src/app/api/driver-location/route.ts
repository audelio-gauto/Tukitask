import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

// GET /api/driver-location?job_id=X  → { lat, lng, updated_at } | null
export async function GET(req: Request) {
  try {
    const url    = new URL(req.url);
    const jobId  = url.searchParams.get('job_id');
    const email  = (url.searchParams.get('email') || '').toLowerCase();

    if (jobId) {
      // Lookup by job: first find tecnico_email from the job, then get their location
      const { data: job } = await sb
        .from('tecnico_jobs')
        .select('tecnico_email')
        .eq('id', jobId)
        .maybeSingle();

      if (!job?.tecnico_email) return NextResponse.json(null);

      const { data: loc } = await sb
        .from('driver_locations')
        .select('lat, lng, updated_at')
        .eq('driver_email', job.tecnico_email)
        .maybeSingle();

      return NextResponse.json(loc ?? null);
    }

    if (email) {
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

// POST /api/driver-location  body: { driver_email, job_id, lat, lng }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { driver_email, job_id, lat, lng } = body || {};

    if (!driver_email || lat == null || lng == null) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const latN = Number(lat);
    const lngN = Number(lng);
    if (!isFinite(latN) || !isFinite(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const { error } = await sb
      .from('driver_locations')
      .upsert(
        { driver_email: String(driver_email).toLowerCase(), job_id: job_id ?? null, lat: latN, lng: lngN, updated_at: new Date().toISOString() },
        { onConflict: 'driver_email' }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
