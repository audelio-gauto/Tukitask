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

  const { items, billing, delivery, notes } = body;

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
      status: 'pending',
    };

    const { data, error } = await db
      .from('market_orders')
      .insert(row)
      .select('id')
      .single();

    if (error) return serverError(error);
    createdOrders.push(data.id);
  }

  return NextResponse.json({ success: true, orderIds: createdOrders });
}
