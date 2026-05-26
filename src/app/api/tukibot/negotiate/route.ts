import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // segundos — da tiempo a Gemini de responder

type BotTone = 'informal' | 'formal' | 'agresivo' | 'amigable';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';
type NegotiationProfile = 'balanced' | 'high_close' | 'high_margin';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

function normalizeTone(input: unknown): BotTone {
  if (input === 'informal' || input === 'formal' || input === 'agresivo' || input === 'amigable') {
    return input;
  }
  return 'amigable';
}

function normalizeTimeoutAction(input: unknown): TimeoutAction {
  if (input === 'auto_counter' || input === 'auto_accept' || input === 'pressure_client') {
    return input;
  }
  return 'auto_counter';
}

function normalizeTimeoutMinutes(input: unknown): number {
  const n = Number(input);
  if ([1, 5, 10, 15, 30, 60].includes(n)) return n;
  return 15;
}

function normalizeNegotiationProfile(input: unknown): NegotiationProfile {
  if (input === 'balanced' || input === 'high_close' || input === 'high_margin') {
    return input;
  }
  return 'balanced';
}

type NegotiateRequest = {
  vendorId?: string;
  productId?: string;
  buyerOffer: number;
  quantity?: number;
  listedPrice: number;
  floorPrice: number;
  productName?: string;
  vendorName?: string;
};

type NegotiateResponse = {
  status: 'accepted' | 'countered';
  acceptedAmount?: number;
  counterAmount?: number;
  totalAmount: number;
  message: string;
  timeoutAt?: string;
  timeoutAction?: TimeoutAction;
  timeoutMessage?: string;
};

type LimitRow = {
  id: string;
  value: number | string;
  is_active: boolean;
};

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundToNearestThousand(n: number) {
  return Math.round(n / 1000) * 1000;
}

function fallbackMessage(args: {
  status: 'accepted' | 'countered';
  vendorName: string;
  productName: string;
  amount: number;
  listedPrice: number;
  quantity: number;
}) {
  const savedPerUnit = Math.max(0, args.listedPrice - args.amount);
  const isMultiple   = args.quantity > 1;
  const totalSaved   = savedPerUnit * args.quantity;
  const totalAmount  = args.amount * args.quantity;

  const priceStr = isMultiple
    ? `${gs(totalAmount)} (${args.quantity} und. × ${gs(args.amount)} c/u)`
    : gs(args.amount);
  const savedStr = isMultiple ? gs(totalSaved) : gs(savedPerUnit);
  const hasSaving = savedPerUnit > 0;

  if (args.status === 'accepted') {
    return hasSaving
      ? `¡Trato hecho! Te confirmamos ${priceStr} por ${args.productName} — ahorrás ${savedStr} frente al precio publicado. ¡Procedé con el pago para asegurar tu pedido!`
      : `¡Aceptado! ${priceStr} por ${args.productName}. Confirmá el pago para asegurar tu pedido.`;
  }
  return hasSaving
    ? `Nuestra mejor propuesta es ${priceStr} por ${args.productName}, así ya te llevás un ahorro real de ${savedStr}. ¿Cerramos?`
    : `Te ofrecemos ${priceStr} por ${args.productName} — es nuestro mejor precio. ¿Lo confirmamos?`;
}

async function generateGeminiMessage(args: {
  status: 'accepted' | 'countered';
  tone: BotTone;
  vendorName: string;
  productName: string;
  buyerOffer: number;
  finalAmount: number;
  listedPrice: number;
  buyerMessage?: string;
  quantity: number;
  isBulkOrder: boolean;
  stock?: number;
  negotiationHistory?: Array<{
    buyerOffer: number;
    counterAmount: number | null;
    status: string;
    createdAt: string;
  }>;
  apiKey: string;
  model: string;
}) {
  type GeminiFinishReason =
    | 'FINISH_REASON_UNSPECIFIED'
    | 'STOP'
    | 'MAX_TOKENS'
    | 'SAFETY'
    | 'RECITATION'
    | 'OTHER';

  type GeminiResponse = {
    promptFeedback?: {
      blockReason?: string;
    };
    candidates?: Array<{
      finishReason?: GeminiFinishReason;
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  function cleanModelText(text: string) {
    return text
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^"+|"+$/g, '')
      .trim();
  }

  function isCompleteSalesMessage(text: string) {
    const normalized = cleanModelText(text);
    if (!normalized) return false;
    if (normalized.length < 28) return false;
    if (normalized.split(/\s+/).length < 6) return false;
    if (!/Gs\.?\s?/i.test(normalized)) return false;
    if (!/[.!?…]$/.test(normalized)) return false;
    return true;
  }

  async function callGemini(promptText: string, temperature: number, maxOutputTokens: number) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          generationConfig: {
            temperature,
            maxOutputTokens,
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
        }),
      },
    );

    if (!resp.ok) return null;

    const data = (await resp.json()) as GeminiResponse;
    if (data?.promptFeedback?.blockReason) return null;

    const candidate = data?.candidates?.[0];
    if (!candidate) return null;

    // Reject responses that ended for truncation/safety reasons.
    if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED') {
      return null;
    }

    const raw = (candidate.content?.parts ?? [])
      .map((part) => part.text?.trim() || '')
      .filter(Boolean)
      .join(' ');

    const text = cleanModelText(raw);
    return isCompleteSalesMessage(text) ? text : null;
  }

  const { apiKey, model } = args;

  const savedPerUnit = Math.max(0, args.listedPrice - args.finalAmount);
  const totalSaved   = savedPerUnit * args.quantity;
  const totalAmount  = args.finalAmount * args.quantity;
  const isMultiple   = args.quantity > 1;

  const toneGuide: Record<BotTone, string> = {
    informal:  'Coloquial paraguayo, como vendedor amigo en WhatsApp. Podés usar "che", "dale", "igual de buena onda".',
    formal:    'Profesional y respetuoso. Trato de "usted". Claro, elegante, sin jerga.',
    agresivo:  'Directo, seguro, orientado a cerrar YA. Transmite que el producto vale cada guaraní. Sin amenazar, sí determinado.',
    amigable:  'Cálido y entusiasta. El cliente siempre se siente ganador. Natural, con energía positiva.',
  };

  const strategyGuide = args.status === 'accepted'
    ? 'El cliente ganó esta negociación. CELEBRÁ el trato, hacelo sentir que consiguió algo exclusivo que no das a todos — como un trato especial solo para él. Creá urgencia suave para que confirme el pago ahora.'
    : 'Estás haciendo una contraoferta. Reconocé su intención de compra, inventá UNA razón creíble (costo de importación, tipo de cambio, calidad premium) por la que no podés bajar más, y presentá tu precio como la mejor opción disponible. Cerrá invitándolo a confirmar.';

  const qtyLine = isMultiple
    ? `- Cantidad: ${args.quantity} unidades${args.isBulkOrder ? ' — precio especial mayorista aplicado' : ''}. Mencioná el total (${gs(totalAmount)}) y el ahorro total (${gs(totalSaved)}) para resaltar el buen negocio de llevar varios.`
    : '';

  const stockLine = args.stock !== undefined
    ? args.stock <= 3
      ? `- Stock: Quedan solo ${args.stock} unidades — mencioná la escasez de forma natural para crear urgencia real.`
      : args.stock <= 10
        ? `- Stock: Pocas unidades disponibles — podés insinuar suavemente que se agota pronto.`
        : ''
    : '';

  const buyerLine = '';
  // (campo mensaje eliminado — no se envía desde el cliente)

  const history = args.negotiationHistory ?? [];
  const historyLine = history.length
    ? [
        'HISTORIAL RECIENTE DE ESTA MISMA NEGOCIACION (mismo comprador + producto):',
        ...history.map((h, idx) =>
          `- Ronda ${idx + 1}: cliente ofrecio ${gs(h.buyerOffer)}${h.counterAmount ? `, vos contraofertaste ${gs(h.counterAmount)}` : ''} (estado: ${h.status})`
        ),
        '- Tenelo en cuenta para no repetirte y sostener una postura coherente entre rondas.',
      ].join('\n')
    : '';

  const prompt = [
    'Sos un vendedor humano paraguayo respondiendo una negociación por chat en un marketplace.',
    'Tu única misión: CERRAR ESTA VENTA con el monto exacto indicado abajo.',
    '',
    `RESULTADO: ${args.status === 'accepted' ? '✅ OFERTA ACEPTADA' : '🔄 CONTRAOFERTA'}`,
    isMultiple
      ? `MONTO FINAL TOTAL (obligatorio): ${gs(totalAmount)} (${args.quantity} und. × ${gs(args.finalAmount)} c/u)`
      : `MONTO FINAL (obligatorio, no cambies este número): ${gs(args.finalAmount)}`,
    totalSaved > 0
      ? isMultiple
        ? `Ahorro total del cliente: ${gs(totalSaved)} (${gs(savedPerUnit)} por unidad × ${args.quantity} und.)`
        : `Ahorro del cliente vs. precio publicado: ${gs(savedPerUnit)}`
      : '',
    '',
    `ESTRATEGIA: ${strategyGuide}`,
    `TONO DEL VENDEDOR: ${toneGuide[args.tone]}`,
    '',
    'CONTEXTO:',
    `- Tienda: ${args.vendorName}`,
    `- Producto: ${args.productName}`,
    qtyLine,
    stockLine,
    historyLine,
    buyerLine,
    '',
    'FORMATO (obligatorio, no negociable):',
    '- Devolvé SOLO el texto de respuesta, sin comillas, sin encabezados, nada más.',
    '- MÁXIMO 2 oraciones cortas. Si escribís 3 o más, fallaste la tarea.',
    '- La respuesta completa NO debe superar 60 palabras.',
    '- Incluí el monto con "Gs." y el ahorro total si es relevante.',
    '- Jamás menciones precio piso, reglas internas ni el sistema.',
    '- No uses saludos formales como "estimado" ni firmes como "TukiBot".',
  ].filter(Boolean).join('\n');

  // Timeout de 22s para dejar margen al fallback antes del límite de Vercel
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  try {
    const primary = await callGemini(prompt, 0.7, 260);
    if (primary) return primary;

    // Retry once with lower creativity and explicit hard ending instruction.
    const retryPrompt = `${prompt}\n- Terminá SIEMPRE con punto final y mensaje completo (nunca dejes frases cortadas).`;
    const retry = await callGemini(retryPrompt, 0.45, 320);
    if (retry) return retry;

    return null;
  } catch {
    // Timeout (AbortError) u otro error de red → fallback se usa en el caller
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  try {
    const buyer = await getAuthUser(req);
    const body = (await req.json()) as NegotiateRequest;
    const buyerOffer = Number(body?.buyerOffer || 0);
    const clientListedPrice = Number(body?.listedPrice || 0);
    const clientFloorPrice  = Number(body?.floorPrice || 0);
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const vendorId = body?.vendorId?.trim() || 'default-vendor';
    const productId = body?.productId?.trim() || null;
    const productName = body?.productName?.trim() || 'este producto';
    const vendorName = body?.vendorName?.trim() || 'la tienda';

    // Fetch real product data from DB to prevent price manipulation and apply tier pricing
    let listedPrice = clientListedPrice;
    let floorPrice  = clientFloorPrice;
    let baseListedPrice = clientListedPrice; // Track original price for savings display (never use tier price for ahorro)
    let isBulkOrder = false;
    let productStock: number | undefined = undefined;
    if (productId) {
      try {
        const { data: product } = await sb
          .from('products')
          .select('price, floor_price, stock, pricing_tiers')
          .eq('id', productId)
          .maybeSingle();
        if (product) {
          // Always use DB prices (never trust client-sent values)
          listedPrice   = Number(product.price) || clientListedPrice;
          baseListedPrice = listedPrice; // Save base price before any tier adjustments
          floorPrice    = Number(product.floor_price) || clientFloorPrice;
          productStock  = typeof product.stock === 'number' ? product.stock : undefined;
          // Apply wholesale tier if applicable (only to negotiation logic, not display savings)
          const tiers = (product.pricing_tiers as Array<{
            minQty: number; maxQty: number | null;
            listedPrice: number; floorPrice: number; autoAcceptFrom: number;
          }> | null) || [];
          if (tiers.length > 0) {
            const tier = tiers.find(t =>
              quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty)
            );
            if (tier) {
              listedPrice = tier.listedPrice;
              floorPrice  = tier.floorPrice;
              isBulkOrder = tier.minQty > 1 || quantity >= 5;
            }
          }
        }
      } catch { /* use client-sent prices as safe fallback */ }
    }

    // Fetch vendor bot config from DB — never trust client-sent tone/timeout values
    let botTone = normalizeTone(undefined);
    let botTimeoutMinutes = normalizeTimeoutMinutes(undefined);
    let botTimeoutAction = normalizeTimeoutAction(undefined);
    let negotiationProfile: NegotiationProfile = 'balanced';
    let autoAcceptFromVendor: number | null = null;
    let msgAutoCounter    = 'el precio sube de vuelta';
    let msgAutoAccept     = 'el precio vuelve al normal';
    let msgPressureClient = 'el precio sube de vuelta';
    try {
      const { data: vendorCfg } = await sb
        .from('vendor_bot_config')
        .select('bot_tone, timeout_minutes, timeout_action, negotiation_profile, auto_accept_above, bot_enabled, msg_auto_counter, msg_auto_accept, msg_pressure_client')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (vendorCfg) {
        botTone           = normalizeTone(vendorCfg.bot_tone);
        botTimeoutMinutes = normalizeTimeoutMinutes(vendorCfg.timeout_minutes);
        botTimeoutAction  = normalizeTimeoutAction(vendorCfg.timeout_action);
        negotiationProfile = normalizeNegotiationProfile(vendorCfg.negotiation_profile);
        if (vendorCfg.auto_accept_above && vendorCfg.auto_accept_above > 0) {
          autoAcceptFromVendor = vendorCfg.auto_accept_above;
        }
        if (vendorCfg.msg_auto_counter)    msgAutoCounter    = vendorCfg.msg_auto_counter;
        if (vendorCfg.msg_auto_accept)     msgAutoAccept     = vendorCfg.msg_auto_accept;
        if (vendorCfg.msg_pressure_client) msgPressureClient = vendorCfg.msg_pressure_client;
      }
    } catch { /* use defaults */ }

    const timeoutMessage =
      botTimeoutAction === 'auto_accept'     ? msgAutoAccept :
      botTimeoutAction === 'pressure_client' ? msgPressureClient :
      msgAutoCounter;

    // Resolve Gemini API key: env var takes priority, fallback to app_settings in DB
    let geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    let geminiModel = 'gemini-1.5-flash';
    if (!geminiApiKey) {
      try {
        const { data: appRows } = await sb
          .from('app_settings')
          .select('key, value')
          .in('key', ['gemini_api_key', 'ai_model']);
        if (appRows) {
          const keyRow = appRows.find((r: { key: string; value: string }) => r.key === 'gemini_api_key');
          const modelRow = appRows.find((r: { key: string; value: string }) => r.key === 'ai_model');
          if (keyRow?.value) geminiApiKey = keyRow.value;
          if (modelRow?.value) geminiModel = modelRow.value;
        }
      } catch { /* silent fallback */ }
    }

    if (!buyerOffer || !listedPrice || !floorPrice) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    if (floorPrice > listedPrice) {
      return NextResponse.json({ error: 'Configuración de precios inválida' }, { status: 400 });
    }

    // autoAcceptFrom: prefer vendor DB config (% of listed price), fallback to floorPrice
    const autoAcceptFrom = autoAcceptFromVendor
      ? Math.round(listedPrice * autoAcceptFromVendor / 100)
      : floorPrice;

    const normalizedAutoAccept = Math.min(listedPrice, Math.max(floorPrice, autoAcceptFrom));

    let payload: NegotiateResponse;
    let status: 'accepted' | 'countered';
    let finalAmount: number;

    // Memory window recommendation: 14 days balances context relevance and token usage.
    const memoryWindowDays = 14;
    const memorySince = new Date(Date.now() - memoryWindowDays * 24 * 60 * 60 * 1000).toISOString();
    let negotiationHistory: Array<{
      buyerOffer: number;
      counterAmount: number | null;
      status: string;
      createdAt: string;
    }> = [];

    if (buyer?.id && productId) {
      try {
        const { data: rounds } = await sb
          .from('tukibot_negotiations')
          .select('buyer_offer, counter_amount, status, created_at')
          .eq('vendor_id', vendorId)
          .eq('product_id', productId)
          .eq('buyer_id', buyer.id)
          .gte('created_at', memorySince)
          .order('created_at', { ascending: true })
          .limit(3);

        if (rounds?.length) {
          negotiationHistory = rounds.map((r) => ({
            buyerOffer: Number(r.buyer_offer) || 0,
            counterAmount: r.counter_amount ? Number(r.counter_amount) : null,
            status: String(r.status || ''),
            createdAt: String(r.created_at || ''),
          }));
        }
      } catch {
        // Non-blocking: if memory lookup fails, negotiation should still proceed.
      }
    }

    const limitIds = [
      'counter_band_min_pct',
      'counter_band_max_pct',
      'lowball_threshold_pct',
      'lowball_hardening_per_repeat_pct',
      'lowball_hardening_severity_pct',
      'round1_max_discount_pct',
      'round2_max_discount_pct',
      'round3_max_discount_pct',
      'roundN_max_discount_pct',
      'probing_guard_trigger_floor_pct',
      'probing_guard_span_pct',
      'offer_influence_low_pct',
      'offer_influence_normal_pct',
      'counter_jitter_step_gs',
      'counter_jitter_min_steps',
      'counter_jitter_max_steps',
    ];

    const limitDefaults = {
      counter_band_min_pct: 58,
      counter_band_max_pct: 78,
      lowball_threshold_pct: 60,
      lowball_hardening_per_repeat_pct: 3,
      lowball_hardening_severity_pct: 6,
      round1_max_discount_pct: 12,
      round2_max_discount_pct: 18,
      round3_max_discount_pct: 24,
      roundN_max_discount_pct: 30,
      probing_guard_trigger_floor_pct: 75,
      probing_guard_span_pct: 25,
      offer_influence_low_pct: 22,
      offer_influence_normal_pct: 34,
      counter_jitter_step_gs: 1000,
      counter_jitter_min_steps: -1,
      counter_jitter_max_steps: 2,
    } as const;

    let limitRows: LimitRow[] = [];
    try {
      const { data } = await sb
        .from('negotiation_limits')
        .select('id, value, is_active')
        .in('id', limitIds);
      if (data?.length) {
        limitRows = data as LimitRow[];
      }
    } catch {
      // Non-blocking: keep safe defaults if limits table lookup fails.
    }

    const limitMap = new Map(limitRows.map((r) => [r.id, r]));
    const getLimitNumber = (id: keyof typeof limitDefaults) => {
      const row = limitMap.get(id);
      if (!row || !row.is_active) return limitDefaults[id];
      const n = Number(row.value);
      return Number.isFinite(n) ? n : limitDefaults[id];
    };

    const counterBandMinPct = clamp(getLimitNumber('counter_band_min_pct'), 40, 90);
    const counterBandMaxPct = clamp(getLimitNumber('counter_band_max_pct'), counterBandMinPct, 95);
    const lowballThresholdPct = clamp(getLimitNumber('lowball_threshold_pct'), 20, 95);
    const lowballHardeningPerRepeat = clamp(getLimitNumber('lowball_hardening_per_repeat_pct') / 100, 0, 0.2);
    const lowballHardeningSeverity = clamp(getLimitNumber('lowball_hardening_severity_pct') / 100, 0, 0.25);
    const round1MaxDiscountPct = clamp(getLimitNumber('round1_max_discount_pct') / 100, 0.01, 0.6);
    const round2MaxDiscountPct = clamp(getLimitNumber('round2_max_discount_pct') / 100, 0.01, 0.7);
    const round3MaxDiscountPct = clamp(getLimitNumber('round3_max_discount_pct') / 100, 0.01, 0.8);
    const roundNMaxDiscountPct = clamp(getLimitNumber('roundN_max_discount_pct') / 100, 0.01, 0.9);
    const probingGuardTriggerFloorPct = clamp(getLimitNumber('probing_guard_trigger_floor_pct') / 100, 0.3, 1.2);
    const probingGuardSpanPct = clamp(getLimitNumber('probing_guard_span_pct') / 100, 0.05, 0.6);
    const offerInfluenceLow = clamp(getLimitNumber('offer_influence_low_pct') / 100, 0.05, 0.6);
    const offerInfluenceNormal = clamp(getLimitNumber('offer_influence_normal_pct') / 100, 0.05, 0.8);
    const counterJitterStepGs = Math.max(0, Math.round(getLimitNumber('counter_jitter_step_gs')));
    const counterJitterMinSteps = Math.round(clamp(getLimitNumber('counter_jitter_min_steps'), -5, 0));
    const counterJitterMaxSteps = Math.round(clamp(getLimitNumber('counter_jitter_max_steps'), 0, 8));

    // Vendor profile shifts strategy while keeping global admin limits as guardrails.
    const profileTuning =
      negotiationProfile === 'high_close'
        ? {
            counterBandShiftPct: -8,
            lowballThresholdShiftPct: +8,
            hardeningRepeatShiftPct: -1,
            hardeningSeverityShiftPct: -2,
            roundDiscountShiftPct: +6,
            probingGuardTriggerShiftPct: -8,
            probingGuardSpanShiftPct: -6,
            offerInfluenceShiftPct: +6,
            jitterMinShiftSteps: -1,
            jitterMaxShiftSteps: +1,
          }
        : negotiationProfile === 'high_margin'
          ? {
              counterBandShiftPct: +8,
              lowballThresholdShiftPct: -8,
              hardeningRepeatShiftPct: +2,
              hardeningSeverityShiftPct: +3,
              roundDiscountShiftPct: -6,
              probingGuardTriggerShiftPct: +10,
              probingGuardSpanShiftPct: +8,
              offerInfluenceShiftPct: -6,
              jitterMinShiftSteps: 0,
              jitterMaxShiftSteps: 0,
            }
          : {
              counterBandShiftPct: 0,
              lowballThresholdShiftPct: 0,
              hardeningRepeatShiftPct: 0,
              hardeningSeverityShiftPct: 0,
              roundDiscountShiftPct: 0,
              probingGuardTriggerShiftPct: 0,
              probingGuardSpanShiftPct: 0,
              offerInfluenceShiftPct: 0,
              jitterMinShiftSteps: 0,
              jitterMaxShiftSteps: 0,
            };

    const tunedCounterBandMinPct = clamp(counterBandMinPct + profileTuning.counterBandShiftPct, 40, 90);
    const tunedCounterBandMaxPct = clamp(counterBandMaxPct + profileTuning.counterBandShiftPct, tunedCounterBandMinPct, 95);
    const tunedLowballThresholdPct = clamp(lowballThresholdPct + profileTuning.lowballThresholdShiftPct, 20, 95);
    const tunedLowballHardeningPerRepeat = clamp(lowballHardeningPerRepeat + (profileTuning.hardeningRepeatShiftPct / 100), 0, 0.2);
    const tunedLowballHardeningSeverity = clamp(lowballHardeningSeverity + (profileTuning.hardeningSeverityShiftPct / 100), 0, 0.25);
    const tunedRound1MaxDiscountPct = clamp(round1MaxDiscountPct + (profileTuning.roundDiscountShiftPct / 100), 0.01, 0.6);
    const tunedRound2MaxDiscountPct = clamp(round2MaxDiscountPct + (profileTuning.roundDiscountShiftPct / 100), 0.01, 0.7);
    const tunedRound3MaxDiscountPct = clamp(round3MaxDiscountPct + (profileTuning.roundDiscountShiftPct / 100), 0.01, 0.8);
    const tunedRoundNMaxDiscountPct = clamp(roundNMaxDiscountPct + (profileTuning.roundDiscountShiftPct / 100), 0.01, 0.9);
    const tunedProbingGuardTriggerFloorPct = clamp(probingGuardTriggerFloorPct + (profileTuning.probingGuardTriggerShiftPct / 100), 0.3, 1.2);
    const tunedProbingGuardSpanPct = clamp(probingGuardSpanPct + (profileTuning.probingGuardSpanShiftPct / 100), 0.05, 0.6);
    const tunedOfferInfluenceLow = clamp(offerInfluenceLow + (profileTuning.offerInfluenceShiftPct / 100), 0.05, 0.6);
    const tunedOfferInfluenceNormal = clamp(offerInfluenceNormal + (profileTuning.offerInfluenceShiftPct / 100), 0.05, 0.8);
    const tunedCounterJitterMinSteps = Math.round(clamp(counterJitterMinSteps + profileTuning.jitterMinShiftSteps, -5, 0));
    const tunedCounterJitterMaxSteps = Math.round(clamp(counterJitterMaxSteps + profileTuning.jitterMaxShiftSteps, 0, 8));

    if (buyerOffer >= normalizedAutoAccept) {
      status = 'accepted';
      finalAmount = buyerOffer;
      payload = {
        status,
        acceptedAmount: finalAmount,
        totalAmount: finalAmount * quantity,
        message: fallbackMessage({
          status,
          vendorName,
          productName,
          amount: finalAmount,
          listedPrice: baseListedPrice,
          quantity,
        }),
      };
    } else {
      status = 'countered';
      const span = Math.max(0, listedPrice - floorPrice);
      const roundNumber = (negotiationHistory?.length || 0) + 1;

      // Detect strategic lowballing and make the bot less predictable/less permissive.
      const offerRatio = buyerOffer / listedPrice;
      const lowballSeverity =
        offerRatio <= 0.40 ? 1.0 :
        offerRatio <= 0.55 ? 0.65 :
        offerRatio <= 0.70 ? 0.30 : 0;

      const repeatedLowballCount = (negotiationHistory || []).filter(
        (h) => h.buyerOffer > 0 && h.buyerOffer <= listedPrice * (tunedLowballThresholdPct / 100),
      ).length;

      const roundHardening =
        roundNumber === 1 ? 0.05 :
        roundNumber === 2 ? 0.03 :
        roundNumber === 3 ? 0.015 : 0;

      const hardening = clamp(
        (repeatedLowballCount * tunedLowballHardeningPerRepeat) + (lowballSeverity * tunedLowballHardeningSeverity) + roundHardening,
        0,
        0.16,
      );

      // Random target band: by default this is closer to listedPrice than floorPrice.
      const kMin = clamp((tunedCounterBandMinPct / 100) + hardening, 0.55, 0.92);
      const kMax = clamp((tunedCounterBandMaxPct / 100) + hardening, kMin, 0.95);
      const k = kMin + (Math.random() * (kMax - kMin));
      const bandAnchor = floorPrice + (span * k);

      // Buyer offer influences counter, but cannot drag it aggressively toward floor.
      const offerInfluence = offerRatio < (tunedLowballThresholdPct / 100) ? tunedOfferInfluenceLow : tunedOfferInfluenceNormal;
      const offerAnchor = listedPrice - ((listedPrice - buyerOffer) * offerInfluence);

      // Round-based concession cap to avoid revealing floor too early.
      const maxDiscountPctByRound =
        roundNumber === 1 ? tunedRound1MaxDiscountPct :
        roundNumber === 2 ? tunedRound2MaxDiscountPct :
        roundNumber === 3 ? tunedRound3MaxDiscountPct : tunedRoundNMaxDiscountPct;
      const roundFloor = listedPrice * (1 - maxDiscountPctByRound);

      const probingGuard = buyerOffer <= floorPrice * tunedProbingGuardTriggerFloorPct
        ? listedPrice - (span * tunedProbingGuardSpanPct)
        : floorPrice;

      let counterAmount = Math.max(bandAnchor, offerAnchor, roundFloor, probingGuard, floorPrice);

      // Small controlled jitter prevents exact reverse-engineering by buyers.
      const jitterRange = Math.max(0, tunedCounterJitterMaxSteps - tunedCounterJitterMinSteps + 1);
      const jitterSteps = jitterRange > 0
        ? Math.floor(Math.random() * jitterRange) + tunedCounterJitterMinSteps
        : 0;
      const jitter = counterJitterStepGs > 0 ? (jitterSteps * counterJitterStepGs) : 0;
      counterAmount = roundToNearestThousand(counterAmount) + jitter;

      counterAmount = clamp(counterAmount, floorPrice, listedPrice);

      if (counterAmount <= buyerOffer) {
        counterAmount = clamp(roundToNearestThousand(buyerOffer + 1000), floorPrice, listedPrice);
      }

      finalAmount = counterAmount;
      const timeoutAt = new Date(Date.now() + botTimeoutMinutes * 60 * 1000).toISOString();
      payload = {
        status,
        counterAmount: finalAmount,
        totalAmount: finalAmount * quantity,
        timeoutAt,
        timeoutAction: botTimeoutAction,
        timeoutMessage,
        message: fallbackMessage({
          status,
          vendorName,
          productName,
          amount: finalAmount,
          listedPrice: baseListedPrice,
          quantity,
        }),
      };
    }

    const aiMessage = geminiApiKey ? await generateGeminiMessage({
      status,
      tone: botTone,
      vendorName,
      productName,
      buyerOffer,
      finalAmount,
      listedPrice: baseListedPrice,
      quantity,
      isBulkOrder,
      stock: productStock,
      negotiationHistory,
      apiKey: geminiApiKey,
      model: geminiModel,
    }) : null;
    if (aiMessage) payload.message = aiMessage;

    if (payload.status === 'countered' && payload.counterAmount && payload.timeoutAt) {
      try {
        await sb.from('tukibot_negotiations').insert({
          vendor_id: vendorId,
          buyer_id: buyer?.id ?? null,
          buyer_email: buyer?.email ?? null,
          product_id: productId,
          product_name: productName,
          listed_price: listedPrice,
          floor_price: floorPrice,
          buyer_offer: buyerOffer,
          counter_amount: payload.counterAmount,
          status: 'countered',
          timeout_action: payload.timeoutAction,
          timeout_at: payload.timeoutAt,
          meta: {
            vendorName,
            quantity,
            botTone,
            negotiationProfile,
          },
        });
      } catch {
        // Best effort queue write.
      }
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la negociación' }, { status: 500 });
  }
}
