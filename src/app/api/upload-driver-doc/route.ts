import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';

const BUCKET = 'driver-documents';

const VALID_PERSONAL_DOCS = ['cedula_frente', 'antecedentes', 'domicilio'];
const VEHICLE_PREFIXES    = ['moto', 'auto', 'moto_carro', 'camion'];
const VEHICLE_DOC_KEYS    = ['registro_frente', 'registro_dorso', 'cedula_verde_frente', 'cedula_verde_dorso'];
const VALID_TECNICO_DOCS  = ['selfie_cedula', 'cedula_frente', 'antecedentes', 'domicilio'];

/** Returns true for any doc_type that is still valid (not deprecated) */
function isCurrentDocType(doc_type: string, role: string): boolean {
  if (role === 'tecnico') return VALID_TECNICO_DOCS.includes(doc_type);
  return isValidDriverDoc(doc_type);
}

// Total expected docs per role (for dashboard count)
export const TECNICO_DOC_COUNT = VALID_TECNICO_DOCS.length;  // 4
export const DRIVER_PERSONAL_COUNT = VALID_PERSONAL_DOCS.length + VEHICLE_DOC_KEYS.length * VEHICLE_PREFIXES.length;

function isValidDriverDoc(doc_type: string): boolean {
  if (VALID_PERSONAL_DOCS.includes(doc_type)) return true;
  for (const prefix of VEHICLE_PREFIXES) {
    if (doc_type.startsWith(prefix + '_')) {
      const key = doc_type.slice(prefix.length + 1);
      if (VEHICLE_DOC_KEYS.includes(key)) return true;
    }
  }
  return false;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Validar magic bytes para prevenir spoofing de extensión */
function validateMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png')  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/webp') return buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString('ascii') === '%PDF';
  return false;
}

/** GET: devuelve lista de documentos del conductor/técnico autenticado */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || user.email;

  // Prevenir IDOR: solo puede ver sus propios documentos
  if (email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await sbAdmin()
    .from('driver_documents')
    .select('id, doc_type, role, status, rejection_reason, expires_at, created_at, updated_at')
    .eq('driver_email', email)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Filter out deprecated doc types so old DB records don’t appear on the frontend
  type DocRow = { doc_type: string; role: string };
  const docs = (data || []) as DocRow[];
  const filtered = docs.filter(d => isCurrentDocType(d.doc_type, d.role));
  return NextResponse.json({ docs: filtered });
}

/** POST: sube un documento al bucket privado vía servidor (nunca cliente directo) */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email, doc_type, base64, mimeType, role = 'driver', expires_at } = body;

    // Rate limit: max 20 uploads per user per hour
    const allowed = await allowRequest(`rl:doc-upload:${user.id}`, 20, 3600);
    if (!allowed) {
      return NextResponse.json({ error: 'Demasiadas subidas. Intentá en unos minutos.' }, { status: 429 });
    }

    // Prevenir IDOR: el email debe coincidir con el JWT
    if (!email || email !== user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validar MIME
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });
    }

    // Validar tipo de documento según el rol
    const isValid = role === 'tecnico' ? VALID_TECNICO_DOCS.includes(doc_type) : isValidDriverDoc(doc_type);
    if (!isValid) {
      return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 });
    }

    // Validar que base64 no sea excesivamente grande (10MB ≈ 13.3MB en base64)
    if (!base64 || typeof base64 !== 'string' || base64.length > 14_000_000) {
      return NextResponse.json({ error: 'Archivo demasiado grande o inválido' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');

    // Validar magic bytes (previene spoofing de MIME)
    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: 'El archivo no es válido' }, { status: 400 });
    }

    // Construir path seguro (sin caracteres especiales)
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1];
    const safeEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${role}/${safeEmail}/${doc_type}_${Date.now()}.${ext}`;

    // Subir al bucket privado usando service role (nunca clave pública)
    const { error: uploadError } = await sbAdmin()
      .storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Guardar metadata en BD (upsert: un doc por tipo por conductor+rol)
    const { error: dbError } = await sbAdmin()
      .from('driver_documents')
      .upsert({
        driver_email: email,
        role,
        doc_type,
        file_path: filePath,
        status: 'pending',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        expires_at: expires_at || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_email,role,doc_type' });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: 'pending' });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/** PATCH: actualiza expires_at. Si el doc estaba aprobado, vuelve a pending para re-revisión. */
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email, doc_type, expires_at } = body;

    if (!email || email !== user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate expires_at: must be a valid date in the future, not >10 years out
    if (expires_at) {
      const ts = new Date(expires_at).getTime();
      const now = Date.now();
      const tenYears = now + 10 * 365 * 24 * 60 * 60 * 1000;
      if (isNaN(ts) || ts < now || ts > tenYears) {
        return NextResponse.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 });
      }
    }

    // Fetch current status to decide if we need to reset to pending
    const { data: current } = await sbAdmin()
      .from('driver_documents')
      .select('status')
      .eq('driver_email', email)
      .eq('doc_type', doc_type)
      .single();

    // If doc was approved, changing expires_at triggers re-review
    const needsReview = current?.status === 'approved';

    const updatePayload: Record<string, unknown> = {
      expires_at: expires_at || null,
      updated_at: new Date().toISOString(),
    };
    if (needsReview) {
      updatePayload.status = 'pending';
      updatePayload.reviewed_by = null;
      updatePayload.reviewed_at = null;
      updatePayload.rejection_reason = null;
    }

    const { error } = await sbAdmin()
      .from('driver_documents')
      .update(updatePayload)
      .eq('driver_email', email)
      .eq('doc_type', doc_type);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, resetToPending: needsReview });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
