import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

export interface CheckoutItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorEmail: string;
  vendorId: string;
  negotiationId?: string | null;
  image?: string | null;
}

export interface CheckoutBody {
  items: CheckoutItem[];
  billing: {
    name: string;
    email: string;
    phone: string;
    cedula: string;
    wants_invoice: boolean;
  };
  delivery: {
    ciudad: string;
    barrio: string;
    referencia: string;
    nombre: string;
    lat: number | null;
    lng: number | null;
  };
  notes?: string;
  payment_method?: string;
  payment_proof_base64?: string;
  payment_proof_mime?: string;
}

type ProductRow = {
  id: string;
  vendor_id: string;
  vendor_email: string;
  name: string;
  price: number;
  stock: number;
  image: string | null;
};

type NegotiationRow = {
  id: string;
  buyer_id: string | null;
  buyer_email: string | null;
  product_id: string | null;
  vendor_id: string;
  status: string;
  final_amount: number | null;
  counter_amount: number | null;
  quantity: number | null;
  expires_at: string | null;
};

type ResolvedItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorEmail: string;
  vendorId: string;
  negotiationId: string | null;
  image: string | null;
};

/** POST /api/tienda/checkout — crea una market_order por cada vendedor */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { items, billing, delivery, notes, payment_method } = body;

  if (!items?.length) {
    return NextResponse.json({ error: 'No hay productos en el pedido' }, { status: 400 });
  }
  if (!billing?.name || !billing?.email || !billing?.phone) {
    return NextResponse.json({ error: 'Datos de facturación incompletos' }, { status: 400 });
  }
  if (!delivery?.ciudad) {
    return NextResponse.json({ error: 'Dirección de entrega incompleta' }, { status: 400 });
  }

  const db = sbAdmin();
  const createdOrders: string[] = [];

  // Comprobante de pago (obligatorio para transferencia bancaria)
  let paymentProofUrl: string | null = null;
  if (payment_method === 'transferencia') {
    if (!body.payment_proof_base64 || !body.payment_proof_mime) {
      return NextResponse.json({ error: 'Debés adjuntar el comprobante de pago para continuar.' }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.includes(body.payment_proof_mime as never)) {
      return NextResponse.json({ error: 'Formato de imagen no soportado' }, { status: 400 });
    }
    const proofBuffer = Buffer.from(body.payment_proof_base64, 'base64');
    if (proofBuffer.length > MAX_FILE_SIZE_PHOTO) {
      return NextResponse.json({ error: 'El comprobante es demasiado grande (máx 2MB)' }, { status: 400 });
    }
    if (!validateImageMagicBytes(proofBuffer, body.payment_proof_mime)) {
      return NextResponse.json({ error: 'El comprobante no es una imagen válida' }, { status: 400 });
    }
    const ext = body.payment_proof_mime === 'image/png' ? 'png' : body.payment_proof_mime === 'image/webp' ? 'webp' : 'jpg';
    const emailSafe = user.email!.replace(/[^a-z0-9]/g, '_');
    const fileName = `market-checkout/${emailSafe}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('delivery-proofs')
      .upload(fileName, proofBuffer, { contentType: body.payment_proof_mime, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: 'Error al subir comprobante: ' + uploadErr.message }, { status: 500 });
    }
    const { data: urlData } = db.storage.from('delivery-proofs').getPublicUrl(fileName);
    paymentProofUrl = urlData.publicUrl;
  }

  const productIds = Array.from(new Set(items.map((i) => i.productId).filter(Boolean)));
  if (productIds.length === 0) {
    return NextResponse.json({ error: 'No hay productos válidos en el pedido' }, { status: 400 });
  }

  const { data: productsData, error: productsError } = await db
    .from('products')
    .select('id, vendor_id, vendor_email, name, price, stock, image, status')
    .in('id', productIds)
    .eq('status', 'published');

  if (productsError) return serverError(productsError);

  const products = (productsData ?? []) as ProductRow[];
  const productsById = new Map(products.map((p) => [p.id, p]));

  const negotiationIds = Array.from(
    new Set(
      items
        .map((i) => (i.negotiationId || '').trim())
        .filter(Boolean)
    )
  );

  const negotiationsById = new Map<string, NegotiationRow>();
  if (negotiationIds.length > 0) {
    const { data: negotiationsData, error: negotiationsError } = await db
      .from('tukibot_negotiations')
      .select('id, buyer_id, buyer_email, product_id, vendor_id, status, final_amount, counter_amount, quantity, expires_at')
      .in('id', negotiationIds);

    if (negotiationsError) return serverError(negotiationsError);
    ((negotiationsData ?? []) as NegotiationRow[]).forEach((n) => negotiationsById.set(n.id, n));
  }

  const resolvedItems: ResolvedItem[] = [];
  const requestedQtyByProduct = new Map<string, number>();

  for (const rawItem of items) {
    const product = productsById.get(rawItem.productId);
    if (!product) {
      return NextResponse.json({ error: 'Uno de los productos ya no está disponible' }, { status: 400 });
    }

    const qty = Math.floor(Number(rawItem.qty || 0));
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida en uno de los productos' }, { status: 400 });
    }

    if (qty > 100) {
      return NextResponse.json({ error: 'Cantidad máxima por producto superada' }, { status: 400 });
    }

    const negotiationId = (rawItem.negotiationId || '').trim() || null;
    let unitPrice = Number(product.price) || 0;
    if (unitPrice <= 0) {
      return NextResponse.json({ error: `Precio inválido para ${product.name}` }, { status: 400 });
    }

    if (negotiationId) {
      const negotiation = negotiationsById.get(negotiationId);
      if (!negotiation) {
        return NextResponse.json({ error: 'Negociación inválida' }, { status: 400 });
      }

      const buyerMatches =
        (negotiation.buyer_id && negotiation.buyer_id === user.id) ||
        (negotiation.buyer_email && negotiation.buyer_email.toLowerCase() === user.email);

      if (!buyerMatches) {
        return unauthorized('Esta negociación no te pertenece');
      }

      if (negotiation.status !== 'accepted_pending_payment') {
        return NextResponse.json({ error: 'La negociación ya no está disponible para pago' }, { status: 400 });
      }

      if (negotiation.product_id !== product.id || negotiation.vendor_id !== product.vendor_id) {
        return NextResponse.json({ error: 'La negociación no coincide con el producto seleccionado' }, { status: 400 });
      }

      if (negotiation.quantity && negotiation.quantity !== qty) {
        return NextResponse.json({ error: 'La cantidad no coincide con la negociación aceptada' }, { status: 400 });
      }

      if (negotiation.expires_at && new Date(negotiation.expires_at).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'La negociación expiró, generá una nueva oferta' }, { status: 400 });
      }

      const negotiatedUnitPrice = Number(negotiation.final_amount ?? negotiation.counter_amount ?? 0);
      if (!Number.isFinite(negotiatedUnitPrice) || negotiatedUnitPrice <= 0) {
        return NextResponse.json({ error: 'El monto negociado es inválido' }, { status: 400 });
      }
      unitPrice = negotiatedUnitPrice;
    }

    resolvedItems.push({
      productId: product.id,
      name: rawItem.name || product.name,
      price: unitPrice,
      qty,
      vendorEmail: product.vendor_email,
      vendorId: product.vendor_id,
      negotiationId,
      image: rawItem.image ?? product.image,
    });

    requestedQtyByProduct.set(product.id, (requestedQtyByProduct.get(product.id) || 0) + qty);
  }

  for (const [productId, requestedQty] of requestedQtyByProduct.entries()) {
    const product = productsById.get(productId);
    if (!product) {
      return NextResponse.json({ error: 'Producto inválido en el carrito' }, { status: 400 });
    }
    if ((product.stock ?? 0) < requestedQty) {
      return NextResponse.json({ error: `Sin stock suficiente para ${product.name}` }, { status: 409 });
    }
  }

  // Group items by vendor (one order per vendor)
  const byVendor = new Map<string, ResolvedItem[]>();
  for (const item of resolvedItems) {
    const key = item.vendorEmail;
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(item);
  }

  async function reserveStock(productId: string, qty: number): Promise<boolean> {
    // Optimistic CAS retries to avoid race-condition overselling.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data: currentProduct, error: currentError } = await db
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();

      if (currentError) return false;

      const currentStock = Number(currentProduct?.stock ?? 0);
      if (currentStock < qty) return false;

      const { data: updatedRows, error: updateError } = await db
        .from('products')
        .update({ stock: currentStock - qty })
        .eq('id', productId)
        .eq('stock', currentStock)
        .select('id');

      if (!updateError && Array.isArray(updatedRows) && updatedRows.length > 0) {
        return true;
      }
    }
    return false;
  }

  async function releaseStock(productId: string, qty: number): Promise<void> {
    const { data: currentProduct } = await db
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();

    const currentStock = Number(currentProduct?.stock ?? 0);
    await db
      .from('products')
      .update({ stock: currentStock + qty })
      .eq('id', productId)
      .eq('stock', currentStock);
  }

  for (const [vendorEmail, vendorItems] of byVendor) {
    const total = vendorItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const vendorId = vendorItems[0]?.vendorId ?? null;
    const negotiationIdsInOrder = Array.from(
      new Set(vendorItems.map((i) => i.negotiationId).filter(Boolean) as string[])
    );

    const qtyByProduct = new Map<string, number>();
    for (const item of vendorItems) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.qty);
    }

    const reserved: Array<{ productId: string; qty: number }> = [];
    for (const [productId, qty] of qtyByProduct.entries()) {
      const ok = await reserveStock(productId, qty);
      if (!ok) {
        await Promise.all(reserved.map((r) => releaseStock(r.productId, r.qty)));
        const productName = productsById.get(productId)?.name ?? 'el producto';
        return NextResponse.json({ error: `Sin stock suficiente para ${productName}` }, { status: 409 });
      }
      reserved.push({ productId, qty });
    }

    const addressSummary = [delivery.nombre, delivery.barrio, delivery.ciudad]
      .filter(Boolean).join(', ');

    const row = {
      vendor_email:  vendorEmail,
      vendor_id:     vendorId,
      client_email:  user.email,
      client_name:   billing.name,
      items:         vendorItems.map(i => ({
        productId: i.productId,
        name:      i.name,
        price:     i.price,
        qty:       i.qty,
        image:     i.image ?? null,
      })),
      total,
      address:       addressSummary,
      billing: {
        name:          billing.name,
        email:         billing.email,
        phone:         billing.phone,
        cedula:        billing.cedula,
        wants_invoice: billing.wants_invoice,
      },
      delivery: {
        ciudad:     delivery.ciudad,
        barrio:     delivery.barrio,
        referencia: delivery.referencia,
        nombre:     delivery.nombre,
        lat:        delivery.lat,
        lng:        delivery.lng,
      },
      notes:   notes ?? null,
      payment_method: payment_method ?? 'contra_entrega',
      payment_proof_url: paymentProofUrl,
      negotiation_id: negotiationIdsInOrder.length === 1 ? negotiationIdsInOrder[0] : null,
      negotiated: negotiationIdsInOrder.length > 0,
      status: 'pending',
    };

    const { data, error } = await db
      .from('market_orders')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      await Promise.all(reserved.map((r) => releaseStock(r.productId, r.qty)));
      return serverError(error);
    }
    createdOrders.push(data.id);

    if (negotiationIdsInOrder.length > 0) {
      const totalByNegotiation = new Map<string, number>();
      for (const item of vendorItems) {
        if (!item.negotiationId) continue;
        totalByNegotiation.set(
          item.negotiationId,
          (totalByNegotiation.get(item.negotiationId) || 0) + item.price * item.qty
        );
      }

      for (const negotiationId of negotiationIdsInOrder) {
        const negotiatedTotal = totalByNegotiation.get(negotiationId) || 0;
      await db
        .from('tukibot_negotiations')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          market_order_id: data.id,
          final_amount: negotiatedTotal,
        })
          .eq('id', negotiationId)
          .eq('buyer_id', user.id);
      }
    }

    // Notify vendor
    const itemSummary = vendorItems.map(i => `${i.name} ×${i.qty}`).join(', ');
    await db.from('notifications').insert({
      user_email: vendorEmail,
      type:       'new_market_order',
      title:      '🛒 Nuevo pedido recibido',
      body:       `${billing.name} ordenó: ${itemSummary} — Total: ${total.toLocaleString('es-PY')} Gs`,
      data:       { order_id: data.id, client_email: user.email },
    });
  }

  return NextResponse.json({ success: true, orderIds: createdOrders });
}
