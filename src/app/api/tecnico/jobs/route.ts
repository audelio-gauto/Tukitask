import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tecnico/jobs
// Query params:
//   ?email=X&stats=true          → dashboard stats object
//   ?email=X&active=true         → accepted + in_progress jobs for this tecnico
//   ?email=X&history=true        → completed + cancelled jobs for this tecnico
//   ?email=X&offers=true         → pending marketplace jobs matching tecnico profile
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const url    = new URL(req.url);
    const email  = (url.searchParams.get('email') || '').toLowerCase();
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

    // ── Dashboard stats ──────────────────────────────────────────────────────
    if (url.searchParams.get('stats') === 'true') {
      // 1. Get tecnico profile to know gender + accepted services
      const { data: settings } = await sb
        .from('tecnico_settings')
        .select('gender, accepted_services, pickup_range')
        .eq('email', email)
        .maybeSingle();

      const gender: string            = settings?.gender ?? '';
      const acceptedServices: Record<string, boolean> = settings?.accepted_services ?? {};
      const rangeKm: number           = Number(settings?.pickup_range ?? 50);

      // Keys of services enabled by this tecnico
      const enabledServices = Object.entries(acceptedServices)
        .filter(([, v]) => v)
        .map(([k]) => k);

      // 2. Ofertas activas — pending jobs matching gender + accepted services
      let offerQ = sb
        .from('tecnico_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (gender === 'mujer' || gender === 'hombre') {
        offerQ = offerQ.in('service_gender', [gender, 'indiferente']);
      }
      if (enabledServices.length > 0) {
        offerQ = offerQ.in('service_type', enabledServices);
      }

      const { count: ofertasActivas } = await offerQ;

      // 3. Citas confirmadas — accepted or in_progress for this tecnico
      const { count: citasConfirmadas } = await sb
        .from('tecnico_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tecnico_email', email)
        .in('status', ['accepted', 'in_progress']);

      // 4. Tasa aceptación — completed / (completed + cancelled)
      const { data: history } = await sb
        .from('tecnico_jobs')
        .select('status')
        .eq('tecnico_email', email)
        .in('status', ['completed', 'cancelled']);

      let tasaAceptacion: number | null = null;
      if (history && history.length > 0) {
        const completed = history.filter(j => j.status === 'completed').length;
        tasaAceptacion = Math.round((completed / history.length) * 100);
      }

      // 5. Ganancias hoy — sum of price for completed jobs today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayJobs } = await sb
        .from('tecnico_jobs')
        .select('price')
        .eq('tecnico_email', email)
        .eq('status', 'completed')
        .gte('completed_at', todayStart.toISOString());

      const gananciasHoy = (todayJobs ?? []).reduce(
        (sum, j) => sum + Number(j.price ?? 0), 0
      );

      return NextResponse.json({
        stats: {
          ofertasActivas:  ofertasActivas  ?? 0,
          citasConfirmadas: citasConfirmadas ?? 0,
          tasaAceptacion,
          gananciasHoy,
          rangeKm,
        },
      });
    }

    // ── Active jobs (accepted / in_progress) ─────────────────────────────────
    if (url.searchParams.get('active') === 'true') {
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('tecnico_email', email)
        .in('status', ['accepted', 'in_progress'])
        .order('scheduled_at', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── History ───────────────────────────────────────────────────────────────
    if (url.searchParams.get('history') === 'true') {
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('tecnico_email', email)
        .in('status', ['completed', 'cancelled', 'rejected'])
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── Marketplace offers matching tecnico profile ───────────────────────────
    if (url.searchParams.get('offers') === 'true') {
      const { data: settings } = await sb
        .from('tecnico_settings')
        .select('gender, accepted_services')
        .eq('email', email)
        .maybeSingle();

      const gender: string = settings?.gender ?? '';
      const accepted: Record<string, boolean> = settings?.accepted_services ?? {};
      const enabled = Object.entries(accepted).filter(([, v]) => v).map(([k]) => k);

      let q = sb.from('tecnico_jobs').select('*').eq('status', 'pending');
      if (gender === 'mujer' || gender === 'hombre') {
        q = q.in('service_gender', [gender, 'indiferente']);
      }
      if (enabled.length > 0) q = q.in('service_type', enabled);
      q = q.order('created_at', { ascending: false });

      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  } catch (err) {
    console.error('GET /api/tecnico/jobs error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tecnico/jobs — accept, complete, cancel a job
// Body: { action: 'accept'|'complete'|'cancel', jobId, tecnicoEmail }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, jobId, tecnicoEmail } = body || {};
    if (!action || !jobId) return NextResponse.json({ error: 'Missing action or jobId' }, { status: 400 });

    const email = String(tecnicoEmail || '').toLowerCase();
    const now   = new Date().toISOString();

    if (action === 'create') {
      const { service_type, service_gender, client_email, client_name, address, lat, lng,
              description, price, payment_method, scheduled_at } = body || {};
      if (!service_type || !client_email) {
        return NextResponse.json({ error: 'Missing service_type or client_email' }, { status: 400 });
      }
      const { data, error } = await sb
        .from('tecnico_jobs')
        .insert({
          status:         'pending',
          service_type,
          service_gender: service_gender || 'indiferente',
          client_email:   String(client_email).toLowerCase(),
          client_name:    client_name || null,
          address:        address || null,
          lat:            lat   ? Number(lat)   : null,
          lng:            lng   ? Number(lng)   : null,
          description:    description || null,
          price:          price ? Number(price) : null,
          payment_method: payment_method || 'efectivo',
          scheduled_at:   scheduled_at || null,
        })
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    if (action === 'accept') {
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'accepted', tecnico_email: email, accepted_at: now })
        .eq('id', jobId)
        .eq('status', 'pending')
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    if (action === 'complete') {
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'completed', completed_at: now })
        .eq('id', jobId)
        .eq('tecnico_email', email)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    if (action === 'cancel') {
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'cancelled', cancelled_at: now })
        .eq('id', jobId)
        .eq('tecnico_email', email)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/tecnico/jobs error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
