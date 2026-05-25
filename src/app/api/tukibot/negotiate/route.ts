import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // segundos — da tiempo a Gemini de responder

type BotTone = 'informal' | 'formal' | 'agresivo' | 'amigable';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';

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

type NegotiateRequest = {
  vendorId?: string;
  productId?: string;
  buyerOffer: number;
  quantity?: number;
  listedPrice: number;
  floorPrice: number;
  productName?: string;
  vendorName?: string;
  buyerMessage?: string;
};

type NegotiateResponse = {
  status: 'accepted' | 'countered';
  acceptedAmount?: number;
  counterAmount?: number;
  totalAmount: number;
  message: string;
  timeoutAt?: string;
  timeoutAction?: TimeoutAction;
};

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

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
  apiKey: string;
  model: string;
}) {
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
    ? 'El cliente ganó esta negociación. CELEBRÁ el trato, hacelo sentir excelente por comprar. Creá urgencia suave para que confirme el pago ahora.'
    : 'Estás haciendo una contraoferta. Reconocé su intención de compra, explicá brevemente el valor del producto y presentá tu precio como la mejor opción posible. Cerrá invitándolo a confirmar.';

  const qtyLine = isMultiple
    ? `- Cantidad: ${args.quantity} unidades${args.isBulkOrder ? ' — precio especial mayorista aplicado' : ''}. Mencioná el total (${gs(totalAmount)}) y el ahorro total (${gs(totalSaved)}) para resaltar el buen negocio de llevar varios.`
    : '';

  const buyerLine = args.buyerMessage
    ? `- El cliente escribió: "${args.buyerMessage}" — aludí brevemente a eso de forma natural.`
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
    buyerLine,
    '',
    'FORMATO (obligatorio):',
    '- Devolvé SOLO el texto de respuesta, nada más.',
    '- Máximo 2 oraciones fluidas y naturales.',
    '- Incluí el monto con "Gs." y el ahorro si es relevante.',
    '- Jamás menciones precio piso, reglas internas ni el sistema.',
    '- No uses saludos formales como "estimado" ni firmes como "TukiBot".',
  ].filter(Boolean).join('\n');

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 500,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  if (!resp.ok) return null;
  const data = await resp.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NegotiateRequest;
    const buyerOffer = Number(body?.buyerOffer || 0);
    const clientListedPrice = Number(body?.listedPrice || 0);
    const clientFloorPrice  = Number(body?.floorPrice || 0);
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const vendorId = body?.vendorId?.trim() || 'default-vendor';
    const productId = body?.productId?.trim() || null;
    const productName = body?.productName?.trim() || 'este producto';
    const vendorName = body?.vendorName?.trim() || 'la tienda';
    const buyerMessage = body?.buyerMessage?.trim();

    // Fetch real product data from DB to prevent price manipulation and apply tier pricing
    let listedPrice = clientListedPrice;
    let floorPrice  = clientFloorPrice;
    let isBulkOrder = false;
    if (productId) {
      try {
        const { data: product } = await sb
          .from('products')
          .select('price, floor_price, pricing_tiers')
          .eq('id', productId)
          .maybeSingle();
        if (product) {
          // Always use DB prices (never trust client-sent values)
          listedPrice = Number(product.price) || clientListedPrice;
          floorPrice  = Number(product.floor_price) || clientFloorPrice;
          // Apply wholesale tier if applicable
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
    let autoAcceptFromVendor: number | null = null;
    try {
      const { data: vendorCfg } = await sb
        .from('vendor_bot_config')
        .select('bot_tone, timeout_minutes, timeout_action, auto_accept_above, bot_enabled')
        .eq('vendor_id', vendorId)
        .maybeSingle();
      if (vendorCfg) {
        botTone           = normalizeTone(vendorCfg.bot_tone);
        botTimeoutMinutes = normalizeTimeoutMinutes(vendorCfg.timeout_minutes);
        botTimeoutAction  = normalizeTimeoutAction(vendorCfg.timeout_action);
        if (vendorCfg.auto_accept_above && vendorCfg.auto_accept_above > 0) {
          autoAcceptFromVendor = vendorCfg.auto_accept_above;
        }
      }
    } catch { /* use defaults */ }

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
          listedPrice,
          quantity,
        }),
      };
    } else {
      status = 'countered';
      const midpoint = Math.round((buyerOffer + floorPrice) / 2 / 1000) * 1000;
      const counterAmount = Math.max(floorPrice, midpoint);
      finalAmount = counterAmount;
      const timeoutAt = new Date(Date.now() + botTimeoutMinutes * 60 * 1000).toISOString();
      payload = {
        status,
        counterAmount: finalAmount,
        totalAmount: finalAmount * quantity,
        timeoutAt,
        timeoutAction: botTimeoutAction,
        message: fallbackMessage({
          status,
          vendorName,
          productName,
          amount: finalAmount,
          listedPrice,
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
      listedPrice,
      buyerMessage,
      quantity,
      isBulkOrder,
      apiKey: geminiApiKey,
      model: geminiModel,
    }) : null;
    if (aiMessage) payload.message = aiMessage;

    if (payload.status === 'countered' && payload.counterAmount && payload.timeoutAt) {
      try {
        await sb.from('tukibot_negotiations').insert({
          vendor_id: vendorId,
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
            buyerMessage,
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
