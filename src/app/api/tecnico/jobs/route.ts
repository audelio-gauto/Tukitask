import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cacheGet, cacheSet } from '@/lib/cache';
import { emitNotification } from '@/lib/notificationEmitter';
import { getAuthUser, unauthorized } from '@/lib/apiAuth';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

const ACTIVE_STATUSES = ['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
const HISTORY_STATUSES = ['completado', 'cancelled', 'incidente'];

export async function GET(req: Request) {
  try {
    const url         = new URL(req.url);
    const email       = (url.searchParams.get('email')        || '').toLowerCase();
    const clientEmail = (url.searchParams.get('client_email') || '').toLowerCase();

    // ── Dashboard stats ──────────────────────────────────────────────────────
    if (url.searchParams.get('stats') === 'true') {
      if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
      const user = await getAuthUser(req);
      if (!user || user.email !== email) return unauthorized();

      // Try cache first (10s TTL — stats don't need to be real-time precise)
      const cacheKey = `tecnico:stats:${email}`;
      const cached = await cacheGet<object>(cacheKey);
      if (cached) return NextResponse.json(cached);

      const { data: settings } = await sb
        .from('tecnico_settings')
        .select('gender, accepted_services, pickup_range')
        .eq('email', email)
        .maybeSingle();

      const gender: string = settings?.gender ?? '';
      const acceptedServices: Record<string, boolean> = settings?.accepted_services ?? {};
      const rangeKm: number = Number(settings?.pickup_range ?? 50);
      const enabledServices = Object.entries(acceptedServices).filter(([, v]) => v).map(([k]) => k);

      // Fetch jobs where this tecnico already sent an offer (any status) to exclude rejected ones
      const { data: myOfferRows } = await sb
        .from('tecnico_job_offers')
        .select('job_id, status')
        .eq('tecnico_email', email);
      const rejectedJobIds = (myOfferRows ?? []).filter(o => o.status === 'rejected').map(o => o.job_id);

      let offerQ = sb.from('tecnico_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (gender === 'mujer' || gender === 'hombre') offerQ = offerQ.in('service_gender', [gender, 'indiferente']);
      if (enabledServices.length > 0) offerQ = offerQ.in('service_type', enabledServices);
      if (rejectedJobIds.length > 0) offerQ = offerQ.not('id', 'in', `(${rejectedJobIds.map(id => `'${id}'`).join(',')})`);
      const { count: ofertasActivas } = await offerQ;

      const { count: citasConfirmadas } = await sb
        .from('tecnico_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tecnico_email', email)
        .in('status', ACTIVE_STATUSES);

      const { data: history } = await sb
        .from('tecnico_jobs')
        .select('status')
        .eq('tecnico_email', email)
        .in('status', HISTORY_STATUSES)
        .order('created_at', { ascending: false })
        .limit(30);

      let tasaAceptacion: number | null = null;
      if (history && history.length > 0) {
        const completed = history.filter(j => j.status === 'completado').length;
        tasaAceptacion = Math.round((completed / history.length) * 100);
      }

      // Paraguay is UTC-4. Compute Paraguay's midnight expressed as UTC.
      // e.g. 2026-04-05 00:00 PY = 2026-04-05 04:00 UTC
      const PY_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC-4
      const nowInPY = new Date(Date.now() - PY_OFFSET_MS);
      const todayStart = new Date(Date.UTC(
        nowInPY.getUTCFullYear(), nowInPY.getUTCMonth(), nowInPY.getUTCDate(),
        4, 0, 0, 0, // +4h to convert PY midnight → UTC
      ));

      const { data: todayJobs } = await sb
        .from('tecnico_jobs')
        .select('total_price')
        .eq('tecnico_email', email)
        .eq('status', 'completado')
        .not('completed_at', 'is', null)
        .gte('completed_at', todayStart.toISOString());

      const gananciasHoy = (todayJobs ?? []).reduce((sum, j) => sum + Number(j.total_price ?? 0), 0);

      const statsPayload = {
        stats: { ofertasActivas: ofertasActivas ?? 0, citasConfirmadas: citasConfirmadas ?? 0, tasaAceptacion, gananciasHoy, rangeKm },
      };
      await cacheSet(cacheKey, statsPayload, 10);
      return NextResponse.json(statsPayload);
    }

    // ── Active jobs for tecnico ──────────────────────────────────────────────
    if (url.searchParams.get('active') === 'true') {
      if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
      const user = await getAuthUser(req);
      if (!user || user.email !== email) return unauthorized();
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('tecnico_email', email)
        .in('status', ACTIVE_STATUSES)
        .order('scheduled_at', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── History for tecnico ──────────────────────────────────────────────────
    if (url.searchParams.get('history') === 'true') {
      if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
      const user = await getAuthUser(req);
      if (!user || user.email !== email) return unauthorized();
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('tecnico_email', email)
        .in('status', HISTORY_STATUSES)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── Marketplace: pending jobs matching tecnico profile ───────────────────
    if (url.searchParams.get('offers') === 'true') {
      if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
      const user = await getAuthUser(req);
      if (!user || user.email !== email) return unauthorized();

      // E-1: Verificar saldo mínimo de billetera antes de mostrar solicitudes
      {
        const minBal = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
        const { data: wallet } = await sb
          .from('driver_wallets')
          .select('balance')
          .eq('driver_email', email)
          .maybeSingle();
        const balance = Number(wallet?.balance ?? 0);
        if (balance < minBal) {
          return NextResponse.json({ error: 'saldo_insuficiente', balance }, { status: 402 });
        }
      }

      const { data: settings } = await sb
        .from('tecnico_settings')
        .select('gender, accepted_services, is_verified')
        .eq('email', email)
        .maybeSingle();

      const gender: string = settings?.gender ?? '';
      const accepted: Record<string, boolean> = settings?.accepted_services ?? {};
      const enabled = Object.entries(accepted).filter(([, v]) => v).map(([k]) => k);
      const tecnicoIsVerified: boolean = settings?.is_verified === true;

      let q = sb.from('tecnico_jobs').select('*').eq('status', 'pending');
      if (gender === 'mujer' || gender === 'hombre') q = q.in('service_gender', [gender, 'indiferente']);
      if (enabled.length > 0) q = q.in('service_type', enabled);
      // If tecnico is not verified, exclude jobs that require verified professionals
      if (!tecnicoIsVerified) q = q.eq('require_verified_tecnico', false);
      q = q.order('created_at', { ascending: false });

      const { data: jobs, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Enrich with live client profile (photo + avg_rating) — works for old and new jobs
      const clientEmails = [...new Set((jobs ?? []).map(j => j.client_email).filter(Boolean))];
      const clientProfileMap: Record<string, { photo_url: string | null; avg_rating: number | null; is_verified: boolean }> = {};
      if (clientEmails.length > 0) {
        // Try full query including is_verified (migration 039+). Fall back to photo/rating only if column not yet available.
        const { data: profiles, error: profileErr } = await sb
          .from('client_profiles')
          .select('email, photo_url, avg_rating, is_verified')
          .in('email', clientEmails);
        if (!profileErr) {
          (profiles ?? []).forEach(p => { clientProfileMap[p.email] = { photo_url: p.photo_url ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null, is_verified: p.is_verified === true }; });
        } else {
          // Fallback: migration 039 not yet run — fetch without is_verified
          const { data: fallback } = await sb
            .from('client_profiles')
            .select('email, photo_url, avg_rating')
            .in('email', clientEmails);
          (fallback ?? []).forEach(p => { clientProfileMap[p.email] = { photo_url: p.photo_url ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null, is_verified: false }; });
        }
      }

      // Attach whether this tecnico already sent an offer for each job
      const jobIds = (jobs ?? []).map(j => j.id);
      if (jobIds.length > 0) {
        const { data: myOffers } = await sb
          .from('tecnico_job_offers')
          .select('job_id, status, proposed_price')
          .eq('tecnico_email', email)
          .in('job_id', jobIds);
        const offerMap: Record<string, { status: string; proposed_price: number }> = {};
        (myOffers ?? []).forEach(o => { offerMap[o.job_id] = { status: o.status, proposed_price: o.proposed_price }; });
        return NextResponse.json(
          (jobs ?? [])
            .map(j => ({
              ...j,
              client_photo:       clientProfileMap[j.client_email]?.photo_url  ?? j.client_photo  ?? null,
              client_rating:      clientProfileMap[j.client_email]?.avg_rating ?? j.client_rating ?? null,
              client_is_verified: clientProfileMap[j.client_email]?.is_verified ?? false,
              my_offer: offerMap[j.id] ?? null,
            }))
            .filter(j => j.my_offer?.status !== 'rejected')
        );
      }
      return NextResponse.json(
        (jobs ?? []).map(j => ({
          ...j,
          client_photo:       clientProfileMap[j.client_email]?.photo_url  ?? j.client_photo  ?? null,
          client_rating:      clientProfileMap[j.client_email]?.avg_rating ?? j.client_rating ?? null,
          client_is_verified: clientProfileMap[j.client_email]?.is_verified ?? false,
        }))
      );
    }

    // ── Single job by ID (client or tecnico tracking) ────────────────────────
    const singleJobId = url.searchParams.get('job_id');
    if (singleJobId) {
      const user = await getAuthUser(req);
      if (!user) return unauthorized();
      const { data: job, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('id', singleJobId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      const isClient  = job.client_email?.toLowerCase()  === user.email;
      const isTecnico = job.tecnico_email?.toLowerCase() === user.email;
      if (!isClient && !isTecnico) return unauthorized();
      return NextResponse.json({ data: [job] });
    }

    // ── Client: active service jobs ──────────────────────────────────────────
    if (url.searchParams.get('client_active') === 'true') {
      const user = await getAuthUser(req);
      if (!user || user.email !== clientEmail) return unauthorized();
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('client_email', clientEmail)
        .in('status', ['pending', ...ACTIVE_STATUSES])
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── Client: service history (completado / incidente / cancelled) ──────────
    if (url.searchParams.get('client_history') === 'true') {
      if (!clientEmail) return NextResponse.json({ error: 'Missing client_email' }, { status: 400 });
      const user = await getAuthUser(req);
      if (!user || user.email !== clientEmail) return unauthorized();
      const { data, error } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('client_email', clientEmail)
        .in('status', HISTORY_STATUSES)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }

    // ── All offers on a specific job (client picks a tecnico) ────────────────
    const jobOffersId = url.searchParams.get('job_offers');
    if (jobOffersId) {
      const user = await getAuthUser(req);
      if (!user) return unauthorized();
      const { data, error } = await sb
        .from('tecnico_job_offers')
        .select('*')
        .eq('job_id', jobOffersId)
        .eq('status', 'pending')
        .order('proposed_price', { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const offers = data ?? [];
      if (offers.length > 0) {
        const emails = [...new Set(offers.map((o: Record<string, unknown>) => o.tecnico_email as string))];
        const { data: settings } = await sb
          .from('tecnico_settings')
          .select('email, total_ratings')
          .in('email', emails);
        const settingsMap = Object.fromEntries(
          (settings ?? []).map((s: Record<string, unknown>) => [s.email, s])
        );
        return NextResponse.json(offers.map((o: Record<string, unknown>) => ({
          ...o,
          total_services: (settingsMap[o.tecnico_email as string] as Record<string, unknown>)?.total_ratings ?? null,
        })));
      }
      return NextResponse.json(offers);
    }

    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  } catch (err) {
    console.error('GET /api/tecnico/jobs error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body || {};
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

    // All mutations require a valid session
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const now = new Date().toISOString();

    // ── create (client submits service request) ───────────────────────────────
    if (action === 'create') {
      const { service_type, service_gender, client_name, client_photo, client_rating,
              address, lat, lng, description, price, payment_method, scheduled_at,
              require_verified_tecnico, promo_code, promo_discount } = body;
      if (!service_type) {
        return NextResponse.json({ error: 'Missing service_type' }, { status: 400 });
      }
      const { data, error } = await sb
        .from('tecnico_jobs')
        .insert({
          status:                   'pending',
          service_type,
          service_gender:           service_gender || 'indiferente',
          client_email:             user.email, // derived from token — prevents impersonation
          client_name:              client_name || null,
          client_photo:             client_photo || null,
          client_rating:            client_rating || null,
          address:                  address || null,
          lat:                      lat ? Number(lat) : null,
          lng:                      lng ? Number(lng) : null,
          description:              description || null,
          client_initial_price:     price ? Number(price) : null,
          payment_method:           payment_method || 'efectivo',
          scheduled_at:             scheduled_at || null,
          require_verified_tecnico: require_verified_tecnico === true,
          photos:                   body.photos || null,
          audio_url:                body.audio_url || null,
          promo_code:               promo_code || null,
          promo_discount:           promo_discount ? Number(promo_discount) : 0,
        })
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    // ── send_offer (tecnico sends price offer) ───────────────────────────────
    if (action === 'send_offer') {
      const { jobId, tecnicoName, tecnicoPhoto, tecnicoRating,
              proposedPrice, note, distanceKm } = body;
      if (!jobId || proposedPrice == null) {
        return NextResponse.json({ error: 'Missing jobId or proposedPrice' }, { status: 400 });
      }
      const tecnicoEmail = user.email; // derived from token — prevents impersonation

      // E-1: Verificar saldo mínimo antes de permitir la oferta
      {
        const minBal = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
        const { data: wallet } = await sb
          .from('driver_wallets')
          .select('balance')
          .eq('driver_email', tecnicoEmail)
          .maybeSingle();
        const balance = Number(wallet?.balance ?? 0);
        if (balance < minBal) {
          return NextResponse.json({ error: 'saldo_insuficiente', balance }, { status: 402 });
        }
      }
      // Fetch client_email to store on offer (enables filtered realtime subscriptions)
      const { data: jobForClient } = await sb
        .from('tecnico_jobs')
        .select('client_email')
        .eq('id', jobId)
        .single();
      const offerClientEmail = jobForClient?.client_email ?? null;

      const { data, error } = await sb
        .from('tecnico_job_offers')
        .upsert({
          job_id:         jobId,
          tecnico_email:  String(tecnicoEmail).toLowerCase(),
          tecnico_name:   tecnicoName   || null,
          tecnico_photo:  tecnicoPhoto  || null,
          tecnico_rating: tecnicoRating || null,
          proposed_price: Number(proposedPrice),
          note:           note          || null,
          distance_km:    distanceKm ? Number(distanceKm) : null,
          status:         'pending',
          client_email:   offerClientEmail,
        }, { onConflict: 'job_id,tecnico_email', ignoreDuplicates: false })
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Notify client about the new tecnico offer
      const { data: jobForNotif } = await sb
        .from('tecnico_jobs')
        .select('client_email')
        .eq('id', jobId)
        .single();
      if (jobForNotif?.client_email) {
        emitNotification(
          jobForNotif.client_email,
          'new_job_offer',
          'Nueva oferta de técnico',
          `Un técnico ofreció ${Number(proposedPrice).toLocaleString('es-PY')} ₲ para tu servicio`,
          { job_id: jobId, offer_id: data?.id },
          { groupKey: `offer:job:${jobId}` },
        );
      }

      return NextResponse.json({ offer: data });
    }

    // ── accept_offer (client picks a tecnico) — atomic RPC (migration 044) ──
    if (action === 'accept_offer') {
      const { jobId, offerId } = body;
      if (!jobId || !offerId) return NextResponse.json({ error: 'Missing jobId or offerId' }, { status: 400 });
      const normalizedEmail = user.email; // derived from token — prevents impersonation

      // Atomic RPC: locks offer + job rows, prevents double-assignment race condition
      const { data: rpcResult, error: rpcErr } = await sb.rpc('accept_tecnico_offer', {
        p_offer_id:     offerId,
        p_client_email: normalizedEmail,
      });
      if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

      const result = rpcResult as { success: boolean; error?: string; status?: number; tecnico_email?: string; job_id?: string; offer_id?: string };
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 409 });
      }

      // Fetch updated job for response
      const { data: updatedJob } = await sb
        .from('tecnico_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      // Notify the tecnico that their offer was accepted
      if (result.tecnico_email) {
        emitNotification(
          result.tecnico_email,
          'job_accepted',
          '¡Oferta aceptada!',
          'Tu oferta de servicio fue aceptada. Revisa los detalles.',
          { job_id: jobId, offer_id: offerId },
          { priority: 'urgent' },
        );
      }

      return NextResponse.json({ job: updatedJob });
    }

    // ── reject_offer (client rejects one offer) ───────────────────────────────
    if (action === 'reject_offer') {
      const { offerId } = body;
      if (!offerId) return NextResponse.json({ error: 'Missing offerId' }, { status: 400 });

      // Get tecnico email before rejecting
      const { data: offerInfo } = await sb
        .from('tecnico_job_offers')
        .select('tecnico_email')
        .eq('id', offerId)
        .single();

      const { data, error } = await sb
        .from('tecnico_job_offers')
        .update({ status: 'rejected', responded_at: now })
        .eq('id', offerId)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (offerInfo?.tecnico_email) {
        emitNotification(
          offerInfo.tecnico_email,
          'offer_rejected',
          'Oferta rechazada',
          'Tu oferta de servicio fue rechazada por el cliente.',
          { offer_id: offerId },
          { priority: 'high' },
        );
      }

      return NextResponse.json({ offer: data });
    }

    // ── en_camino ─────────────────────────────────────────────────────────────
    if (action === 'en_camino') {
      const { jobId, tecnicoEmail } = body;
      if (!jobId || !tecnicoEmail) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'en_camino', en_camino_at: now })
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .in('status', ['accepted'])
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // Notify client
      if (data?.client_email) {
        emitNotification(data.client_email, 'job_status', 'Técnico en camino', 'El técnico va en camino a tu ubicación.', { job_id: jobId }, { priority: 'urgent' });
      }
      return NextResponse.json({ job: data });
    }

    // ── llegue ────────────────────────────────────────────────────────────────
    if (action === 'llegue') {
      const { jobId, tecnicoEmail } = body;
      if (!jobId || !tecnicoEmail) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'llegue', llegue_at: now })
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .in('status', ['en_camino'])
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data?.client_email) {
        emitNotification(data.client_email, 'job_status', 'Técnico llegó', '¡El técnico llegó a tu ubicación!', { job_id: jobId }, { priority: 'urgent' });
      }
      return NextResponse.json({ job: data });
    }

    // ── en_proceso ────────────────────────────────────────────────────────────
    if (action === 'en_proceso') {
      const { jobId, tecnicoEmail } = body;
      if (!jobId || !tecnicoEmail) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'en_proceso', en_proceso_at: now })
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .in('status', ['llegue'])
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    // ── add_extra (tecnico manages extra charges — full list replacement) ─────
    if (action === 'add_extra') {
      const { jobId, tecnicoEmail, extraItems } = body;
      if (!jobId || !tecnicoEmail || !Array.isArray(extraItems)) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const items = (extraItems as Array<{ amount: number; reason: string }>)
        .filter(i => Number(i.amount) > 0)
        .map(i => ({ amount: Number(i.amount), reason: String(i.reason || '') }));
      const totalExtra = items.reduce((s, i) => s + i.amount, 0);
      // Fetch agreed_price to compute total_price
      const { data: cur } = await sb
        .from('tecnico_jobs')
        .select('agreed_price')
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .maybeSingle();
      const agreed = Number(cur?.agreed_price ?? 0);
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({
          extra_items:  items,
          extra_charge: totalExtra > 0 ? totalExtra : null,
          extra_reason: items.length > 0 ? items.map(i => i.reason).filter(Boolean).join(', ') : null,
          total_price:  agreed > 0 ? agreed + totalExtra : (totalExtra > 0 ? totalExtra : null),
        })
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .in('status', ['en_proceso', 'completion_pending'])
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    // ── completion_pending (tecnico marks job done, client must confirm) ──────
    if (action === 'completion_pending') {
      const { jobId, tecnicoEmail } = body;
      if (!jobId || !tecnicoEmail) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

      const { data: cur } = await sb
        .from('tecnico_jobs')
        .select('completion_attempts')
        .eq('id', jobId)
        .maybeSingle();
      const attempts = Number(cur?.completion_attempts ?? 0) + 1;

      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'completion_pending', completion_attempts: attempts })
        .eq('id', jobId)
        .eq('tecnico_email', String(tecnicoEmail).toLowerCase())
        .in('status', ['en_proceso'])
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data?.client_email) {
        emitNotification(data.client_email, 'job_status', 'Servicio completado', 'El técnico marcó el servicio como completado. Por favor confirma.', { job_id: jobId }, { priority: 'urgent', groupKey: `job:${jobId}:completion_pending` });
      }
      return NextResponse.json({ job: data });
    }

    // ── accept_completion (client confirms job is done) ───────────────────────
    if (action === 'accept_completion') {
      const { jobId } = body;
      if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({ status: 'completado', completed_at: now })
        .eq('id', jobId)
        .eq('client_email', user.email) // ownership from token
        .eq('status', 'completion_pending')
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // ── Deduct commission from tecnico wallet ──────────────────────────────
      if (data?.tecnico_email) {
        const tecnicoEmail = data.tecnico_email as string;
        const totalPrice   = Number(data.total_price ?? data.agreed_price ?? 0);
        console.log(`[accept_completion] jobId=${jobId} tecnico=${tecnicoEmail} total_price=${data.total_price} agreed_price=${data.agreed_price} → totalPrice=${totalPrice} service_type=${data.service_type}`);

        if (totalPrice > 0) {
          // Resolve commission rate: custom override (per tecnico) > service pricing (per service_type) > default 10%
          const { data: settings } = await sb
            .from('tecnico_settings')
            .select('custom_commission_pct, custom_commission_fixed')
            .eq('email', tecnicoEmail)
            .maybeSingle();

          let commissionPct   = 10;
          let commissionFixed = 0;

          // Priority 1: Custom override per tecnico (admin sets individual override)
          if (settings?.custom_commission_pct != null) {
            commissionPct   = Number(settings.custom_commission_pct);
            commissionFixed = Number(settings.custom_commission_fixed ?? 0);
            console.log(`[accept_completion] Using custom tecnico rate: ${commissionPct}% + ${commissionFixed} fixed`);
          } else {
            // Priority 2: Service pricing by service_type (admin sets per service)
            const { data: pricing, error: pricingErr } = await sb
              .from('service_pricing')
              .select('commission_pct, commission_fixed')
              .eq('service_type', data.service_type)
              .maybeSingle();
            console.log(`[accept_completion] service_pricing lookup: type=${data.service_type} pricing=${JSON.stringify(pricing)} err=${pricingErr?.message ?? 'none'}`);
            if (pricing) {
              commissionPct   = Number(pricing.commission_pct ?? 10);
              commissionFixed = Number(pricing.commission_fixed ?? 0);
            }
          }

          const commissionAmount = Math.round(totalPrice * commissionPct / 100 + commissionFixed);
          console.log(`[accept_completion] Commission: ${commissionPct}% + ${commissionFixed}Gs fixed = ${commissionAmount}Gs (of ${totalPrice}Gs)`);
          if (commissionAmount > 0) {
            let rpcErr: { message: string } | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              const { error } = await sb.rpc('deduct_tecnico_commission', {
                p_job_id: jobId,
                p_email:  tecnicoEmail,
                p_amount: commissionAmount,
              });
              rpcErr = error as { message: string } | null;
              if (!rpcErr) {
                console.log(`[accept_completion] Commission deducted OK on attempt ${attempt}: ${commissionAmount}Gs from ${tecnicoEmail}`);
                break;
              }
              console.error(`[accept_completion] RPC attempt ${attempt} failed:`, rpcErr.message);
              if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500));
            }
            if (rpcErr) {
              console.error('[accept_completion] deduct_tecnico_commission failed after 3 attempts:', rpcErr.message);
            }
          } else {
            console.log(`[accept_completion] Commission amount is 0, skipping deduction`);
          }
        } else {
          console.log(`[accept_completion] totalPrice is 0 or negative, skipping commission`);
        }
      } else {
        console.log(`[accept_completion] No tecnico_email on job data, skipping commission. data=${JSON.stringify(data)}`);
      }

      // Notify tecnico that client confirmed completion
      if (data?.tecnico_email) {
        emitNotification(String(data.tecnico_email), 'job_status', 'Servicio confirmado', '¡El cliente confirmó tu trabajo! Tu comisión fue descontada.', { job_id: jobId }, { priority: 'high', groupKey: `job:${jobId}:completado` });
      }
      // Notify client that service is now complete
      if (data?.client_email) {
        emitNotification(String(data.client_email), 'job_status', '¡Servicio completado!', 'Tu servicio fue completado y confirmado exitosamente.', { job_id: jobId }, { priority: 'normal', groupKey: `job:${jobId}:completado` });
      }

      return NextResponse.json({ job: data });
    }

    // ── reject_completion (client rejects; 3rd attempt → incidente) ──────────
    if (action === 'reject_completion') {
      const { jobId, reason } = body;
      if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

      const { data: cur } = await sb
        .from('tecnico_jobs')
        .select('completion_attempts')
        .eq('id', jobId)
        .maybeSingle();
      const attempts  = Number(cur?.completion_attempts ?? 0);
      const isIncident = attempts >= 3;

      const { data, error } = await sb
        .from('tecnico_jobs')
        .update({
          status:                 isIncident ? 'incidente' : 'en_proceso',
          last_rejection_reason:  reason || null,
          ...(isIncident ? { incident_at: now } : {}),
        })
        .eq('id', jobId)
        .eq('client_email', user.email) // ownership from token
        .eq('status', 'completion_pending')
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    // ── rate_tecnico (client rates the tecnico after completion) ───────────────
    if (action === 'rate_client') {
      const { jobId, rating, note } = body;
      if (!jobId || rating == null) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 });
      }

      const { data: job } = await sb
        .from('tecnico_jobs')
        .select('id, status, client_email, client_rating_given')
        .eq('id', jobId)
        .eq('tecnico_email', user.email) // ownership from token
        .maybeSingle();

      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      if (job.status !== 'completado') return NextResponse.json({ error: 'Solo se pueden calificar servicios completados' }, { status: 400 });
      if (job.client_rating_given != null) return NextResponse.json({ error: 'Ya calificaste a este cliente' }, { status: 409 });

      await sb.from('tecnico_jobs').update({
        client_rating_given:      ratingNum,
        client_rating_given_note: note || null,
      }).eq('id', jobId);

      // Recalculate client avg_rating in client_profiles
      if (job.client_email) {
        const { data: ratings } = await sb
          .from('tecnico_jobs')
          .select('client_rating_given')
          .eq('client_email', job.client_email)
          .not('client_rating_given', 'is', null);
        if (ratings && ratings.length > 0) {
          const avg = ratings.reduce((s: number, r: { client_rating_given: number }) => s + Number(r.client_rating_given), 0) / ratings.length;
          await sb.from('client_profiles')
            .update({
              avg_rating:    Math.round(avg * 10) / 10,
              total_ratings: ratings.length,
            })
            .eq('email', job.client_email);
        }
      }

      return NextResponse.json({ success: true });
    }

    // ── rate_tecnico (client rates the tecnico) ───────────────────────────────
    if (action === 'rate_tecnico') {
      const { jobId, rating, note } = body;
      if (!jobId || rating == null) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 });
      }

      const { data: job } = await sb
        .from('tecnico_jobs')
        .select('id, status, tecnico_email, tecnico_rating')
        .eq('id', jobId)
        .eq('client_email', user.email) // ownership from token
        .maybeSingle();

      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      if (job.status !== 'completado') return NextResponse.json({ error: 'Solo se pueden calificar servicios completados' }, { status: 400 });
      if (job.tecnico_rating != null) return NextResponse.json({ error: 'Ya calificaste este servicio' }, { status: 409 });

      await sb.from('tecnico_jobs').update({
        tecnico_rating:      ratingNum,
        tecnico_rating_note: note || null,
      }).eq('id', jobId);

      // Recalculate tecnico avg_rating
      if (job.tecnico_email) {
        const { data: ratings } = await sb
          .from('tecnico_jobs')
          .select('tecnico_rating')
          .eq('tecnico_email', job.tecnico_email)
          .not('tecnico_rating', 'is', null);
        if (ratings && ratings.length > 0) {
          const avg = ratings.reduce((s: number, r: { tecnico_rating: number }) => s + Number(r.tecnico_rating), 0) / ratings.length;
          await sb.from('tecnico_settings').update({
            avg_rating:    Math.round(avg * 10) / 10,
            total_ratings: ratings.length,
          }).eq('email', job.tecnico_email);
        }
      }

      return NextResponse.json({ success: true });
    }

    // ── cancel ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { jobId, cancelReason } = body;
      if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
      let q = sb
        .from('tecnico_jobs')
        .update({ status: 'cancelled', cancelled_at: now, cancel_reason: cancelReason || null });

      // Determine cancel scope from body hint; identity always from token
      if (body.tecnicoEmail) {
        q = q.eq('tecnico_email', user.email).in('status', ACTIVE_STATUSES);
      } else {
        q = q.eq('client_email', user.email).in('status', ['pending', ...ACTIVE_STATUSES]);
      }
      const { data, error } = await q.eq('id', jobId).select().maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ job: data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/tecnico/jobs error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
