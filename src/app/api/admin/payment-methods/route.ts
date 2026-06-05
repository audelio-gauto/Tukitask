import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET — devuelve todos los métodos de pago con bank_data
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const db = sbAdmin();
  const { data, error } = await db
    .from('payment_methods_config')
    .select('id, name, key, description, is_active, vendor_allowed, fee_fixed, fee_percentage, icon, bank_data, updated_at')
    .order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH — actualiza bank_data y/o vendor_allowed de un método (solo admin)
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const { id, bank_data, vendor_allowed } = body as {
    id: string;
    bank_data?: Record<string, string> | null;
    vendor_allowed?: boolean;
  };

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (bank_data !== undefined) {
    patch.bank_data = bank_data
      ? {
          banco:        (bank_data.banco       ?? '').slice(0, 100),
          cuenta:       (bank_data.cuenta      ?? '').slice(0, 100),
          alias:        (bank_data.alias       ?? '').slice(0, 100),
          titular:      (bank_data.titular     ?? '').slice(0, 150),
          tipo_cuenta:  (bank_data.tipo_cuenta ?? '').slice(0, 80),
        }
      : null;
  }

  if (vendor_allowed !== undefined) {
    patch.vendor_allowed = !!vendor_allowed;
  }

  const db = sbAdmin();
  const { error } = await db
    .from('payment_methods_config')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
