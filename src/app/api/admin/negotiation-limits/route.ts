import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';
import { APPLIED_NEGOTIATION_LIMIT_IDS, effectiveNegotiationLimitValue } from '@/lib/negotiationLimits';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { data, error } = await sbAdmin()
    .from('negotiation_limits')
    .select('id, name, key, description, value, unit, min, max, step, is_active')
    .in('id', APPLIED_NEGOTIATION_LIMIT_IDS)
    .order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const limits = (data ?? []) as Array<{
    id: string;
    name: string;
    key: string;
    description: string | null;
    value: number | string;
    unit: string | null;
    min: number;
    max: number;
    step: number;
    is_active: boolean;
  }>;
  return NextResponse.json({
    limits: limits.map((limit) => ({
      ...limit,
      effective_value: effectiveNegotiationLimitValue(limit),
    })),
  });
}

export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  let body: { id?: unknown; value?: unknown; is_active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!APPLIED_NEGOTIATION_LIMIT_IDS.includes(id as typeof APPLIED_NEGOTIATION_LIMIT_IDS[number])) {
    return NextResponse.json({ error: 'Límite no disponible para edición' }, { status: 404 });
  }
  if (body.value === undefined && body.is_active === undefined) {
    return NextResponse.json({ error: 'Se requiere id y un cambio de valor o estado' }, { status: 400 });
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data: current, error: lookupError } = await db
    .from('negotiation_limits')
    .select('id, min, max, step')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Límite no encontrado' }, { status: 404 });

  const update: { value?: number; is_active?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.value !== undefined) {
    const value = Number(body.value);
    const min = Number(current.min);
    const max = Number(current.max);
    const step = Number(current.step);
    if (!Number.isFinite(value) || value < min || value > max) {
      return NextResponse.json({ error: `El valor debe estar entre ${min} y ${max}` }, { status: 400 });
    }
    if (step > 0 && Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-8) {
      return NextResponse.json({ error: `El valor debe avanzar en pasos de ${step}` }, { status: 400 });
    }
    update.value = value;
  }
  if (body.is_active !== undefined) update.is_active = body.is_active;

  const { data, error } = await db
    .from('negotiation_limits')
    .update(update)
    .eq('id', id)
    .select('id, name, key, description, value, unit, min, max, step, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    limit: { ...data, effective_value: effectiveNegotiationLimitValue(data) },
  });
}