import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

const BUCKET = 'driver-documents';

const VALID_DRIVER_DOCS = [
  'cedula_frente', 'cedula_dorso',
  'antecedentes', 'domicilio',
  'registro_frente', 'registro_dorso',
  'cedula_verde_frente', 'cedula_verde_dorso',
  'foto_vehiculo_1', 'foto_vehiculo_2',
];

const VALID_TECNICO_DOCS = [
  'selfie_cedula',
  'cedula_frente', 'cedula_dorso',
  'antecedentes', 'domicilio',
];

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
    .select('id, doc_type, role, status, rejection_reason, created_at, updated_at')
    .eq('driver_email', email)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ docs: data || [] });
}

/** POST: sube un documento al bucket privado vía servidor (nunca cliente directo) */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email, doc_type, base64, mimeType, role = 'driver' } = body;

    // Prevenir IDOR: el email debe coincidir con el JWT
    if (!email || email !== user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validar MIME
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });
    }

    // Validar tipo de documento según el rol
    const validDocs = role === 'tecnico' ? VALID_TECNICO_DOCS : VALID_DRIVER_DOCS;
    if (!validDocs.includes(doc_type)) {
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

    // Guardar metadata en BD (upsert: un doc por tipo por conductor)
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
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_email,doc_type' });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: 'pending' });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
