import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

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
}

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

  // Group items by vendor (one order per vendor)
  const byVendor = new Map<string, CheckoutItem[]>();
  for (const item of items) {
    const key = item.vendorEmail;
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(item);
  }

  const db = sbAdmin();
  const createdOrders: string[] = [];

  for (const [vendorEmail, vendorItems] of byVendor) {
    const total = vendorItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const addressSummary = [delivery.nombre, delivery.barrio, delivery.ciudad]
      .filter(Boolean).join(', ');

    const row = {
      vendor_email:  vendorEmail,
      vendor_id:     vendorItems[0].vendorId ?? null,
      client_email:  billing.email,
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
      negotiation_id: vendorItems[0].negotiationId ?? null,
      negotiated: Boolean(vendorItems[0].negotiationId),
      status: 'pending',
    };

    const { data, error } = await db
      .from('market_orders')
      .insert(row)
      .select('id')
      .single();

    if (error) return serverError(error);
    createdOrders.push(data.id);

    const negotiationId = vendorItems[0].negotiationId;
    if (negotiationId) {
      await db
        .from('tukibot_negotiations')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          market_order_id: data.id,
          final_amount: total,
        })
        .eq('id', negotiationId);
    }

    // Decrement stock for each product in this vendor's order
    for (const item of vendorItems) {
      const { data: prod } = await db
        .from('products')
        .select('stock')
        .eq('id', item.productId)
        .single();
      const newStock = Math.max(0, (prod?.stock ?? 0) - item.qty);
      await db.from('products').update({ stock: newStock }).eq('id', item.productId);
    }

    // Notify vendor
    const itemSummary = vendorItems.map(i => `${i.name} ×${i.qty}`).join(', ');
    await db.from('notifications').insert({
      user_email: vendorEmail,
      type:       'new_market_order',
      title:      '🛒 Nuevo pedido recibido',
      body:       `${billing.name} ordenó: ${itemSummary} — Total: ${total.toLocaleString('es-PY')} Gs`,
      data:       { order_id: data.id, client_email: billing.email },
    });
  }

  return NextResponse.json({ success: true, orderIds: createdOrders });
}
