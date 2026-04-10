import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

// GET — saldo actual + últimas transacciones del trabajador autenticado
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;

  const [walletRes, txRes] = await Promise.all([
    db.from('driver_wallets').select('balance, updated_at').eq('driver_email', user.email).maybeSingle(),
    db.from('wallet_transactions')
      .select('id, type, amount, order_id, job_id, note, created_at')
      .eq('driver_email', user.email)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    balance: walletRes.data?.balance ?? 0,
    updated_at: walletRes.data?.updated_at ?? null,
    transactions: txRes.data ?? [],
  });
}

// POST — solicitar recarga: body { amount, receipt_base64?, receipt_mime? }
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sbAdmin() as any;
  let receiptUrl: string | null = null;

  // Subir comprobante si viene en base64
  if (body.receipt_base64 && body.receipt_mime) {
    if (!ALLOWED_IMAGE_TYPES.includes(body.receipt_mime as never)) {
      return NextResponse.json({ error: 'Formato de imagen no soportado' }, { status: 400 });
    }
    const buffer = Buffer.from(body.receipt_base64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_PHOTO) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 2MB)' }, { status: 400 });
    }
    if (!validateImageMagicBytes(buffer, body.receipt_mime)) {
      return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 400 });
    }
    const ext = body.receipt_mime === 'image/png' ? 'png' : body.receipt_mime === 'image/webp' ? 'webp' : 'jpg';
    const emailSafe = user.email!.replace(/[^a-z0-9]/g, '_');
    const fileName = `receipts/${emailSafe}_${Date.now()}.${ext}`;

    // Upload receipts to private bucket — not publicly browseable
    const { error: uploadErr } = await db.storage
      .from('driver-documents')
      .upload(fileName, buffer, { contentType: body.receipt_mime, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: 'Error al subir comprobante: ' + uploadErr.message }, { status: 500 });
    }
    // Store relative path; admin generates signed URLs when needed
    receiptUrl = fileName;
  }

  const { data, error } = await db
    .from('recharge_requests')
    .insert({ driver_email: user.email, amount, receipt_url: receiptUrl, status: 'pending' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
