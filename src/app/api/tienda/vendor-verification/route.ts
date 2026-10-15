import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';
import { cacheGet, cacheSet } from '@/lib/cache';

const REQUIRED_VENDOR_DOCS = ['cedula_frente', 'ruc_documento', 'constancia_bancaria', 'registro_comercial'];
const BULK_CACHE_TTL_SECONDS = 30;

type VendorVerificationSummary = { blocked: boolean };
type VendorVerificationMap = Record<string, VendorVerificationSummary>;

async function getBulkVerification(vendorIds: string[]) {
  const ids = Array.from(new Set(vendorIds)).sort();
  const cacheKey = `tienda:vendor-verification:v1:${ids.join(',')}`;
  const cached = await cacheGet<VendorVerificationMap>(cacheKey);
  if (cached) return NextResponse.json({ vendors: cached });

  const db = sbAdmin();
  const { data: vendors, error: vendorError } = await db
    .from('users')
    .select('id, email, verification_status, is_active')
    .in('id', ids);

  if (vendorError) return NextResponse.json({ error: 'verification_lookup_failed' }, { status: 500 });

  type VendorRow = { id: string; email: string | null; verification_status: string | null; is_active: boolean | null };
  type VendorDocRow = { driver_email: string; doc_type: string; status?: string | null };
  const vendorRows = (vendors ?? []) as VendorRow[];
  const emails = vendorRows.map((vendor) => vendor.email).filter((email): email is string => Boolean(email));
  const docsByEmail = new Map<string, VendorDocRow[]>();

  if (emails.length > 0) {
    const { data: docs, error: docsError } = await db
      .from('driver_documents')
      .select('driver_email, doc_type, status')
      .eq('role', 'vendedor')
      .in('driver_email', emails);

    if (docsError) return NextResponse.json({ error: 'verification_lookup_failed' }, { status: 500 });
    for (const doc of (docs ?? []) as VendorDocRow[]) {
      const rows = docsByEmail.get(doc.driver_email) ?? [];
      rows.push(doc);
      docsByEmail.set(doc.driver_email, rows);
    }
  }

  const vendorsById = new Map(vendorRows.map((vendor) => [vendor.id, vendor]));
  const summaries: VendorVerificationMap = {};

  for (const id of ids) {
    const vendor = vendorsById.get(id);
    if (!vendor?.email) {
      summaries[id] = { blocked: true };
      continue;
    }

    const docs = docsByEmail.get(vendor.email) ?? [];
    const approvedMap = new Map(docs.map((doc) => [doc.doc_type, doc.status ?? null]));
    const missingDocs = REQUIRED_VENDOR_DOCS.filter((doc) => approvedMap.get(doc) !== 'approved');
    const isApprovedByFlag = vendor.verification_status === 'approved' || vendor.is_active === true;
    const blockedByDocs = docs.length === 0 || missingDocs.length > 0 || docs.some((doc) => {
      return REQUIRED_VENDOR_DOCS.includes(doc.doc_type) && doc.status !== 'approved';
    });
    summaries[id] = { blocked: !isApprovedByFlag && blockedByDocs };
  }

  await cacheSet(cacheKey, summaries, BULK_CACHE_TTL_SECONDS);
  return NextResponse.json({ vendors: summaries });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vendorIds = (searchParams.get('vendor_ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (vendorIds.length > 0) return getBulkVerification(vendorIds);

  const vendorId = searchParams.get('vendor_id')?.trim();

  if (!vendorId) {
    return NextResponse.json({ blocked: true, reason: 'vendor_id_missing' }, { status: 400 });
  }

  const { data: vendor, error: vendorError } = await sbAdmin()
    .from('users')
    .select('id, email, verification_status, is_active')
    .eq('id', vendorId)
    .maybeSingle();

  if (vendorError || !vendor?.email) {
    return NextResponse.json({ blocked: true, reason: 'vendor_not_found' }, { status: 404 });
  }

  const { data: docs, error: docsError } = await sbAdmin()
    .from('driver_documents')
    .select('doc_type, status')
    .eq('driver_email', vendor.email)
    .eq('role', 'vendedor');

  if (docsError) {
    return NextResponse.json({ blocked: true, reason: 'verification_lookup_failed' }, { status: 500 });
  }

  type VendorDocRow = { doc_type: string; status?: string | null };
  const docRows: VendorDocRow[] = Array.isArray(docs) ? (docs as VendorDocRow[]) : [];
  const approvedMap = new Map<string, string | null>();
  for (const doc of docRows) {
    if (typeof doc.doc_type === 'string') {
      approvedMap.set(doc.doc_type, doc.status ?? null);
    }
  }

  const missingDocs = REQUIRED_VENDOR_DOCS.filter((doc) => approvedMap.get(doc) !== 'approved');
  const hasRejected = docRows.some((doc: VendorDocRow) => REQUIRED_VENDOR_DOCS.includes(doc.doc_type) && doc.status === 'rejected');
  const isApprovedByFlag = vendor.verification_status === 'approved' || vendor.is_active === true;
  const blockedByDocs = docRows.length === 0 || missingDocs.length > 0 || docRows.some((doc: VendorDocRow) => {
    const isRequired = REQUIRED_VENDOR_DOCS.includes(doc.doc_type);
    return isRequired && doc.status !== 'approved';
  });
  const blocked = !isApprovedByFlag && blockedByDocs;

  return NextResponse.json({
    blocked,
    vendor_email: vendor.email,
    verification_status: vendor.verification_status ?? (isApprovedByFlag ? 'approved' : blockedByDocs ? 'pending' : 'approved'),
    required_docs: REQUIRED_VENDOR_DOCS,
    approved_docs: REQUIRED_VENDOR_DOCS.filter((doc) => approvedMap.get(doc) === 'approved'),
    missing_docs: missingDocs,
    has_rejected: hasRejected,
    docs: docRows,
    message: blocked
      ? 'La tienda está en verificación pendiente. Cuando todos los documentos sean aprobados, podrá volver a publicarse.'
      : 'La tienda está verificada.',
  });
}
