import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

/**
 * GET /api/payment-info?vendor_email=xxx@mail.com
 *
 * Devuelve los métodos de pago activos y los datos bancarios correctos para el checkout:
 *   - Si "Transferencia Bancaria" global está activa → bank_data del marketplace
 *   - Si está inactiva → bank_data del vendedor específico
 *
 * No requiere autenticación (lo usan clientes anónimos o autenticados en el checkout).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vendorEmail = searchParams.get('vendor_email') ?? '';

  const db = sbAdmin();

  // Traer configuración de métodos de pago
  const { data: methods, error: methodsError } = await db
    .from('payment_methods_config')
    .select('id, name, key, description, is_active, vendor_allowed, fee_fixed, fee_percentage, bank_data')
    .order('id');

  if (methodsError) return NextResponse.json({ error: methodsError.message }, { status: 500 });

  type MethodRow = { id: string; key: string; name: string; description: string; is_active: boolean; vendor_allowed: boolean; fee_fixed: number; fee_percentage: number; bank_data: Record<string, string> | null };
  const rows = methods as MethodRow[] ?? [];
  const transferMethod = rows.find(m => m.key === 'transfer');
  const cashMethod     = rows.find(m => m.key === 'cash_on_delivery');
  const globalTransferActive    = !!transferMethod?.is_active;
  const vendorTransferAllowed   = !!transferMethod?.vendor_allowed;
  const vendorCashAllowed       = !!cashMethod?.vendor_allowed;

  let bankData: Record<string, string> | null = null;
  let bankDataSource: 'global' | 'vendor' | null = null;

  if (globalTransferActive) {
    // Usar datos bancarios globales del marketplace
    bankData = transferMethod?.bank_data ?? null;
    bankDataSource = 'global';
  } else if (vendorEmail && vendorTransferAllowed) {
    // Usar datos bancarios del vendedor específico (solo si vendor_allowed=true)
    const { data: vendorBank } = await db
      .from('vendor_bank_data')
      .select('banco, cuenta, alias, titular, tipo_cuenta')
      .eq('vendor_email', vendorEmail)
      .maybeSingle();

    if (vendorBank && (vendorBank.banco || vendorBank.cuenta || vendorBank.alias)) {
      bankData = vendorBank as Record<string, string>;
      bankDataSource = 'vendor';
    }
  }

  const activeTransferEnabled = globalTransferActive || (!!bankData && bankDataSource === 'vendor');

  return NextResponse.json({
    methods: rows.map(m => ({
      id:             m.id,
      key:            m.key,
      name:           m.name,
      description:    m.description,
      is_active:      m.is_active,
      vendor_allowed: m.vendor_allowed,
      fee_fixed:      m.fee_fixed,
      fee_percentage: m.fee_percentage,
    })),
    transfer: {
      available:   activeTransferEnabled,
      source:      bankDataSource,
      bank_data:   bankData,
    },
    vendor_methods: {
      transfer_allowed:   vendorTransferAllowed,
      cash_allowed:       vendorCashAllowed,
    },
  });
}
