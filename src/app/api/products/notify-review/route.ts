import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';
import { notifyAdminsProductReview } from '@/lib/adminAlerts';

// POST /api/products/notify-review
// Avisa al panel de administración que un producto quedó pendiente de aprobación.
// No crea ni modifica productos: valida que el producto exista y pertenezca al
// vendedor autenticado antes de emitir la alerta.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const allowed = await allowRequest(`rl:product-notify:${user.email}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas notificaciones en poco tiempo.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const productId = String(body.productId ?? '').trim();
  if (!productId) {
    return NextResponse.json({ error: 'productId requerido' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data: product, error } = await db
    .from('products')
    .select('id, name, vendor_email, status')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'No se pudo verificar el producto' }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  if (
    String(product.vendor_email ?? '').toLowerCase() !== user.email.toLowerCase()
    || product.status !== 'pending_review'
  ) {
    return NextResponse.json({ error: 'Producto no habilitado para revisión' }, { status: 403 });
  }

  const { count } = await db
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending_review');

  await notifyAdminsProductReview(String(product.name ?? 'Producto'), count ?? 1);

  return NextResponse.json({ ok: true });
}
