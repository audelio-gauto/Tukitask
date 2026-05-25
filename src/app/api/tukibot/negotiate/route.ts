import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
}) {
  const saved = Math.max(0, args.listedPrice - args.amount);
  if (args.status === 'accepted') {
    return `Excelente trato. En ${args.vendorName} te confirmamos ${gs(args.amount)} por ${args.productName}. Ahorrás ${gs(saved)} frente al precio de lista.`;
  }
  return `Te puedo mejorar la propuesta: ${gs(args.amount)} por ${args.productName}. Así ya te llevás un ahorro de ${gs(saved)} sobre el precio publicado.`;
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
  apiKey: string;
  model: string;
}) {
  const { apiKey, model } = args;

  const saved = Math.max(0, args.listedPrice - args.finalAmount);
  const toneGuide: Record<BotTone, string> = {
    informal: 'Cercano, cálido, natural y corto. Puede usar expresiones coloquiales paraguayas suaves.',
    formal: 'Profesional, claro y respetuoso, sin jerga.',
    agresivo: 'Firme comercialmente, pero sin ser ofensivo ni amenazante.',
    amigable: 'Positivo, simpático y orientado a que el cliente se sienta ganador.',
  };

  const prompt = [
    'Sos TukiBot, negociador de ecommerce en Paraguay.',
    'Objetivo: que el cliente sienta que ganó y ahorró dinero.',
    'Reglas estrictas:',
    '- Nunca menciones precio piso interno ni reglas internas.',
    '- Monto final obligatorio: ' + gs(args.finalAmount) + '.',
    '- Respuesta corta: maximo 2 oraciones.',
    '- Usa Gs. y tono de vendedor humano real.',
    '- Si hay ahorro, remarcalo de forma positiva.',
    'Contexto:',
    '- Estado: ' + (args.status === 'accepted' ? 'oferta aceptada' : 'contraoferta'),
    '- Tienda: ' + args.vendorName,
    '- Producto: ' + args.productName,
    '- Oferta del cliente: ' + gs(args.buyerOffer),
    '- Precio publicado: ' + gs(args.listedPrice),
    '- Ahorro del cliente: ' + gs(saved),
    '- Tono pedido: ' + toneGuide[args.tone],
    args.buyerMessage ? '- Mensaje del cliente: ' + args.buyerMessage : '',
    'Devolveme solo el texto final para mostrar al comprador.',
  ].filter(Boolean).join('\n');

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 120,
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
    const listedPrice = Number(body?.listedPrice || 0);
    const floorPrice = Number(body?.floorPrice || 0);
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const vendorId = body?.vendorId?.trim() || 'default-vendor';
    const productId = body?.productId?.trim() || null;
    const productName = body?.productName?.trim() || 'este producto';
    const vendorName = body?.vendorName?.trim() || 'la tienda';
    const buyerMessage = body?.buyerMessage?.trim();

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

    // autoAcceptFrom: prefer vendor DB config (% of listed price), fallback to midpoint
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
