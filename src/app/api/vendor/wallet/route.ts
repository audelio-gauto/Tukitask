import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

// GET — saldo + últimas 50 transacciones + solicitudes de recarga del vendedor autenticado
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const db = sbAdmin();

  const [walletRes, txRes, rechargesRes, configRes] = await Promise.all([
    db.from('vendor_wallets')
      .select('balance, updated_at')
      .eq('vendor_email', user.email)
      .maybeSingle(),
    db.from('vendor_wallet_transactions')
      .select('id, type, amount, market_order_id, note, created_at')
      .eq('vendor_email', user.email)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('vendor_recharge_requests')
      .select('id, amount, status, receipt_url, created_at, rejection_note')
      .eq('vendor_email', user.email)
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('app_config')
      .select('value')
      .eq('key', 'vendor_credit_limit')
      .maybeSingle(),
  ]);

  return NextResponse.json({
    balance: walletRes.data?.balance ?? 0,
    updated_at: walletRes.data?.updated_at ?? null,
    credit_limit: Number(configRes.data?.value ?? -500000),
    transactions: txRes.data ?? [],
    recharge_requests: rechargesRes.data ?? [],
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

  const db = sbAdmin();
  let receiptUrl: string | null = null;

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
    const fileName = `vendor-receipts/${emailSafe}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('driver-documents')
      .upload(fileName, buffer, { contentType: body.receipt_mime, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: 'Error al subir comprobante: ' + uploadErr.message }, { status: 500 });
    }
    receiptUrl = fileName;
  }

  const { data, error } = await db
    .from('vendor_recharge_requests')
    .insert({ vendor_email: user.email, amount, receipt_url: receiptUrl, status: 'pending' })
    .select('id')
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
