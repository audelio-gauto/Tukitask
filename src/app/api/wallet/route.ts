import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';
import { allowRequest } from '@/lib/rateLimit';
import { notifyAdminsRecharge } from '@/lib/adminAlerts';

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

  // Rate limit: 10 solicitudes de recarga por hora por usuario
  const allowed = await allowRequest(`rl:wallet:post:${user.email}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: 'Demasiadas solicitudes en poco tiempo. Esperá un momento.' }, { status: 429 });

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

  if (error) return serverError(error);

  const { count } = await db
    .from('recharge_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  await notifyAdminsRecharge('driver', amount, count ?? 1);

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
