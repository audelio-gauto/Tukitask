import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

const REQUIRED_VENDOR_DOCS = ['cedula_frente', 'ruc_documento', 'constancia_bancaria', 'registro_comercial'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
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
