import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const db = sbAdmin();

    // Get all drivers and technicians (role can be 'servicio' or 'tecnico')
    const { data: users, error: usersErr } = await db
      .from('users')
      .select('id, email, role')
      .in('role', ['driver', 'tecnico', 'servicio']);

    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
    if (!users || users.length === 0) return NextResponse.json({ data: [] });

    const emails = users.map((u: any) => u.email as string);

    // Driver locations updated in the last 60 minutes = "online"
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: locations } = await db
      .from('driver_locations')
      .select('driver_email, lat, lng, job_id, updated_at')
      .in('driver_email', emails)
      .gte('updated_at', cutoff);

    const locationMap = new Map<string, any>();
    (locations || []).forEach((l: any) => locationMap.set(l.driver_email, l));

    // Driver profiles (name, photo, transport)
    const { data: profiles } = await db
      .from('driver_profiles')
      .select('email, first_name, last_name, profile_photo, transport_mode, verified')
      .in('email', emails);

    const profileMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profileMap.set(p.email, p));

    // Tecnico profiles from tecnico_settings
    const { data: tecProfiles } = await db
      .from('tecnico_settings')
      .select('email, first_name, last_name, profile_photo')
      .in('email', emails);

    (tecProfiles || []).forEach((p: any) => {
      if (!profileMap.has(p.email)) {
        profileMap.set(p.email, { ...p, transport_mode: null, verified: true });
      }
    });

    // Active orders — accepted_by is the driver email
    const driverEmails = users.filter((u: any) => u.role === 'driver').map((u: any) => u.email as string);
    const tecnicoEmails = users.filter((u: any) => u.role === 'tecnico' || u.role === 'servicio').map((u: any) => u.email as string);

    const orderMap = new Map<string, any>();
    if (driverEmails.length > 0) {
      const { data: orders } = await db
        .from('orders')
        .select('accepted_by, pickup_lat, pickup_lng, delivery_lat, delivery_lng, pickup_address, delivery_address, status, id, is_multi_stop, stop_count, order_stops(sequence, address, lat, lng, status)')
        .in('accepted_by', driverEmails)
        .in('status', ['accepted', 'picking_up', 'picked_up', 'in_transit']);
      (orders || []).forEach((o: any) => {
        if (o.accepted_by) orderMap.set(o.accepted_by, o);
      });
    }

    const jobMap = new Map<string, any>();
    if (tecnicoEmails.length > 0) {
      const { data: jobs } = await db
        .from('tecnico_jobs')
        .select('tecnico_email, client_address, client_lat, client_lng, status, id')
        .in('tecnico_email', tecnicoEmails)
        .in('status', ['accepted', 'en_route', 'arrived', 'in_progress']);
      (jobs || []).forEach((j: any) => {
        if (j.tecnico_email) jobMap.set(j.tecnico_email, j);
      });
    }

    // Get ban/suspend status from Supabase Auth
    const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
    const banMap = new Map<string, any>();
    (authData?.users || []).forEach((u: any) => {
      const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
      banMap.set((u.email || '').toLowerCase(), {
        banned: isBanned,
        banned_until: u.banned_until ?? null,
        suspended: u.app_metadata?.suspended ?? false,
      });
    });

    const data = users.map((u: any) => {
      const loc      = locationMap.get(u.email);
      const profile  = profileMap.get(u.email) || {};
      const order    = orderMap.get(u.email);
      const job      = jobMap.get(u.email);
      const banInfo  = banMap.get(u.email) || {};

      return {
        id:             u.id,
        email:          u.email,
        role:           (u.role === 'servicio' ? 'tecnico' : u.role) as string,
        name:           [profile.first_name, profile.last_name].filter(Boolean).join(' ') || u.email.split('@')[0],
        transport_mode: profile.transport_mode ?? null,
        profile_photo:  profile.profile_photo ?? null,
        verified:       profile.verified ?? false,
        // Live location
        lat:        loc?.lat ?? null,
        lng:        loc?.lng ?? null,
        updated_at: loc?.updated_at ?? null,
        online:     !!loc || !!(order || job),
        en_route:   !!(order || job),
        // Route A → stops → B for driver
        pickup:      order && order.pickup_lat != null
          ? { lat: order.pickup_lat, lng: order.pickup_lng, address: order.pickup_address }
          : null,
        delivery:    order && order.delivery_lat != null
          ? { lat: order.delivery_lat, lng: order.delivery_lng, address: order.delivery_address }
          : null,
        is_multi_stop: order?.is_multi_stop ?? false,
        stop_count:    order?.stop_count ?? null,
        order_stops:   order?.order_stops ?? null,
        // Tecnico destination
        job_dest:   job && job.client_lat != null
          ? { lat: job.client_lat, lng: job.client_lng, address: job.client_address }
          : null,
        // Status
        banned:       banInfo.banned     ?? false,
        banned_until: banInfo.banned_until ?? null,
        suspended:    banInfo.suspended  ?? false,
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/ruta/live]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
