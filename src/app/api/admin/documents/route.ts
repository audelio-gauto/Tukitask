import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';
import { sendEmailToDriver } from '@/lib/notify';

const PAGE_SIZE = 30;

// GET /api/admin/documents
// - ?id=<uuid>            → fresh signed URL for single doc (lazy preview)
// - ?view=drivers         → all docs grouped by driver, with profile info
// - ?status=pending|all&page=N → legacy paginated flat list
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const url = new URL(req.url);
  const docId = url.searchParams.get('id');
  const view  = url.searchParams.get('view');

  // ── Lazy signed URL ────────────────────────────────────────────────────────
  if (docId) {
    const { data: doc, error } = await sbAdmin()
      .from('driver_documents')
      .select('file_path')
      .eq('id', docId)
      .single();
    if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: signed } = await sbAdmin()
      .storage.from('driver-documents')
      .createSignedUrl(doc.file_path as string, 600);
    return NextResponse.json({ signedUrl: signed?.signedUrl ?? null });
  }

  // ── Audit history for a doc ───────────────────────────────────────────────
  const auditId = url.searchParams.get('audit');
  if (auditId) {
    const { data: history, error: auditError } = await sbAdmin()
      .from('driver_document_audit')
      .select('id, action, admin_email, rejection_reason, created_at')
      .eq('doc_id', auditId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });
    return NextResponse.json({ history: history || [] });
  }

  // ── Grouped by driver view ─────────────────────────────────────────────────
  if (view === 'drivers') {
    const roleParam = url.searchParams.get('role') || 'all';

    let docsQuery = sbAdmin()
      .from('driver_documents')
      .select('id, driver_email, role, doc_type, file_path, status, rejection_reason, expires_at, reviewed_at, created_at, updated_at')
      .order('driver_email')
      .limit(1000);
    if (roleParam !== 'all') docsQuery = docsQuery.eq('role', roleParam);

    const { data: docs, error } = await docsQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by email+role
    const grouped = new Map<string, { email: string; role: string; docs: unknown[] }>();
    for (const doc of docs || []) {
      const key = `${doc.driver_email}__${doc.role}`;
      if (!grouped.has(key)) grouped.set(key, { email: doc.driver_email, role: doc.role, docs: [] });
      grouped.get(key)!.docs.push(doc);
    }

    // Unique emails per role
    const allDocs = (docs ?? []) as Array<{ driver_email: string; role: string }>;
    const driverEmails  = [...new Set(allDocs.filter((d: { driver_email: string; role: string }) => d.role === 'driver').map((d: { driver_email: string; role: string }) => d.driver_email))];
    const tecnicoEmails = [...new Set(allDocs.filter((d: { driver_email: string; role: string }) => d.role === 'tecnico').map((d: { driver_email: string; role: string }) => d.driver_email))];

    const profiles: Record<string, { name: string; photo: string | null; vehicle: string | null }> = {};

    if (driverEmails.length > 0) {
      const { data: dProfiles } = await sbAdmin()
        .from('driver_profiles')
        .select('email, first_name, last_name, profile_photo, transport_mode, license_plate')
        .in('email', driverEmails);
      for (const p of dProfiles || []) {
        const name    = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
        const vehicle = p.transport_mode
          ? `${p.transport_mode}${p.license_plate ? ' · ' + String(p.license_plate).toUpperCase() : ''}`
          : null;
        profiles[`${p.email}__driver`] = { name, photo: p.profile_photo || null, vehicle };
      }
    }

    if (tecnicoEmails.length > 0) {
      const { data: tSettings } = await sbAdmin()
        .from('tecnico_settings')
        .select('email, first_name, last_name, profile_photo')
        .in('email', tecnicoEmails);
      for (const p of tSettings || []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
        profiles[`${p.email}__tecnico`] = { name, photo: p.profile_photo || null, vehicle: null };
      }
    }

    const drivers = [...grouped.values()].map(g => ({
      ...g,
      profile: profiles[`${g.email}__${g.role}`] || { name: g.email, photo: null, vehicle: null },
    }));

    // Sort: drivers with oldest pending doc first so they get reviewed first
    drivers.sort((a, b) => {
      type D = { status: string; created_at: string };
      const oldestPending = (g: { docs: unknown[] }) => {
        const pending = (g.docs as D[]).filter(d => d.status === 'pending').sort((x, y) => x.created_at.localeCompare(y.created_at));
        return pending[0]?.created_at ?? '9999';
      };
      return oldestPending(a).localeCompare(oldestPending(b));
    });

    return NextResponse.json({ drivers, total: drivers.length });
  }

  // ── Paginated flat list (legacy) ───────────────────────────────────────────
  const statusFilter = url.searchParams.get('status');
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));

  let query = sbAdmin()
    .from('driver_documents')
    .select('id, driver_email, role, doc_type, file_path, status, rejection_reason, expires_at, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    docs: data || [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > (page + 1) * PAGE_SIZE,
  });
}

// PATCH /api/admin/documents  { id, status, rejection_reason?, previous_status }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json().catch(() => null);
  const { id, status, rejection_reason, previous_status } = body || {};

  if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // Validate rejection_reason length
  if (rejection_reason && typeof rejection_reason === 'string' && rejection_reason.length > 500) {
    return NextResponse.json({ error: 'Motivo demasiado largo (máx 500 caracteres)' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status,
    reviewed_by: admin.email,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status === 'rejected') update.rejection_reason = (rejection_reason || '').trim().slice(0, 500);
  if (status === 'approved') update.rejection_reason = null;

  // Optimistic lock: only update if status hasn't changed since the client last fetched
  let query = sbAdmin()
    .from('driver_documents')
    .update(update)
    .eq('id', id);

  if (previous_status) {
    query = query.eq('status', previous_status);
  }

  const { data: updated, error } = await query.select('id, status, driver_email, doc_type').single();

  if (error) {
    // If no row was updated (status changed by another admin), return 409
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'El documento ya fue modificado por otro admin. Actualizá la lista.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log to audit table (fire-and-forget, non-blocking)
  if (updated) {
    sbAdmin()
      .from('driver_document_audit')
      .insert({
        doc_id: id,
        driver_email: updated.driver_email,
        doc_type: updated.doc_type,
        action: status,
        admin_email: admin.email,
        rejection_reason: status === 'rejected' ? (rejection_reason || '').trim().slice(0, 500) : null,
        created_at: new Date().toISOString(),
      })
      .then(() => {})
      .catch(() => {}); // non-fatal — table may not exist yet
  }

  // Notify driver/tecnico of the decision (fire-and-forget, non-blocking)
  if (updated && (status === 'approved' || status === 'rejected')) {
    notifyDocDecision(updated.driver_email, updated.doc_type, status, rejection_reason).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

/** Send in-app notification to driver/tecnico when their document is reviewed */
async function notifyDocDecision(email: string, docType: string, status: 'approved' | 'rejected', reason?: string) {
  const docLabel = docType.replace(/_/g, ' ');
  const message = status === 'approved'
    ? `Tu documento "${docLabel}" fue aprobado ✅`
    : `Tu documento "${docLabel}" fue rechazado ❌${reason ? `: ${reason}` : ''}`;

  // Store notification in DB for in-app display
  await sbAdmin()
    .from('notifications')
    .insert({
      user_email: email,
      type: `doc_${status}`,
      message,
      read: false,
      created_at: new Date().toISOString(),
    })
    .single()
    .catch(() => {}); // table may not exist yet — non-fatal

  // Send email to the driver/tecnico
  const subject = status === 'approved'
    ? `Tu documento "${docLabel}" fue aprobado — Tukitask`
    : `Tu documento "${docLabel}" fue rechazado — Tukitask`;
  const html = status === 'approved'
    ? `<p>¡Hola! Tu documento <strong>${docLabel}</strong> fue <strong>aprobado ✅</strong>.</p><p>Ya podés continuar con el proceso de registro en Tukitask.</p>`
    : `<p>Tu documento <strong>${docLabel}</strong> fue <strong>rechazado ❌</strong>.</p>${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}<p>Por favor revisá y volvé a subir el documento desde la configuración de tu cuenta.</p>`;
  await sendEmailToDriver(email, subject, message, html).catch(() => {});
}

