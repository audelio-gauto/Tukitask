import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

type PendingOrder = { id: string; vendor_email: string; created_at: string };
type BankData = Record<string, string>;

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let orderIds: string[];
  try {
    const body = await req.json() as { orderIds?: unknown };
    orderIds = Array.isArray(body.orderIds)
      ? Array.from(new Set(body.orderIds.filter((id): id is string => typeof id === 'string')))
      : [];
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (orderIds.length === 0 || orderIds.length > 20) {
    return NextResponse.json({ error: 'Lista de pedidos inválida' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data, error } = await db
    .from('market_orders')
    .select('id, vendor_email, created_at')
    .in('id', orderIds)
    .eq('client_email', user.email)
    .eq('payment_method', 'transferencia')
    .eq('payment_status', 'awaiting_confirmation')
    .eq('status', 'pending')
    .is('payment_proof_url', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = (data ?? []) as PendingOrder[];
  if (orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Uno o más pedidos ya no están pendientes de comprobante' }, { status: 404 });
  }
  if (orders.some(order => Date.now() - new Date(order.created_at).getTime() > 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'La reserva de estos pedidos venció. Generá una nueva orden.' }, { status: 410 });
  }

  const { data: transfer, error: transferError } = await db
    .from('payment_methods_config')
    .select('is_active, vendor_allowed, bank_data')
    .eq('key', 'transfer')
    .maybeSingle();

  if (transferError) return NextResponse.json({ error: transferError.message }, { status: 500 });

  let bankData: BankData | null = null;
  let source: 'global' | 'vendor' | null = null;
  if (transfer?.is_active && transfer.bank_data) {
    bankData = transfer.bank_data as BankData;
    source = 'global';
  } else if (transfer?.vendor_allowed) {
    const { data: bank, error: bankError } = await db
      .from('vendor_bank_data')
      .select('banco, cuenta, alias, titular, tipo_cuenta')
      .eq('vendor_email', orders[0].vendor_email)
      .maybeSingle();

    if (bankError) return NextResponse.json({ error: bankError.message }, { status: 500 });
    if (bank) {
      bankData = bank as BankData;
      source = 'vendor';
    }
  }

  if (!bankData || !Object.values(bankData).some(Boolean)) {
    return NextResponse.json({ error: 'No hay datos bancarios configurados para esta compra' }, { status: 409 });
  }

  return NextResponse.json({ orderIds, bank_data: bankData, bank_data_source: source });
}