import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const DEFAULT_PHRASES = [
  'Dame 3 segundos…',
  'Le estoy convenciendo 😏',
  'Dame 3 segundos más, ya casi…',
  'El vendedor respiró hondo…',
  'Creo que acepta...',
  '🤖 Dame unos segundos… está dudando...',
  '📉 El precio acaba de tambalearse...',
];

const DEFAULT_CLIMAX = {
  accepted: '😮 ALTO… creo que va a aceptar',
  countered: '👀 El vendedor no cedió más, pero bajó bastante',
};

type AiProvider = 'gemini' | 'openai' | 'openrouter';

type AnimRequestBody = {
  productName?: string;
  listedPrice?: number;
  floorPrice?: number;
  buyerOffer?: number;
  quantity?: number;
};

const AI_TIMEOUT_MS = 5000;

function cleanPhrase(text: string) {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function uniquePhrases(input: string[], fallback: string[]) {
  const out: string[] = [];
  for (const item of input) {
    const cleaned = cleanPhrase(String(item || ''));
    if (!cleaned) continue;
    if (!out.includes(cleaned)) out.push(cleaned);
    if (out.length >= 10) break;
  }
  return out.length >= 4 ? out : fallback;
}

function extractArrayFromText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  const match = trimmed.match(/\[[\s\S]*\]/);
  return match?.[0] ?? '';
}

function parseGeneratedPhrases(raw: string): string[] {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const possibleArray = extractArrayFromText(raw);
    if (possibleArray) {
      try {
        parsed = JSON.parse(possibleArray);
      } catch {
        parsed = null;
      }
    }
  }

  if (Array.isArray(parsed)) {
    return uniquePhrases(parsed as string[], []);
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { phrases?: unknown[] }).phrases)) {
    return uniquePhrases((parsed as { phrases: string[] }).phrases, []);
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\d).\s]+/, '').trim())
    .filter(Boolean);
  return uniquePhrases(lines, []);
}

function buildPrompt(ctx: {
  productName: string;
  listedPrice: number;
  floorPrice: number;
  buyerOffer: number;
  quantity: number;
}) {
  return [
    'Genera frases cortas para animación de negociación en español (Paraguay).',
    'Objetivo: que parezca que TukiBot está peleando para ahorrar al cliente.',
    'Devuelve SOLO un JSON array de strings, sin markdown, sin explicación.',
    'Entre 6 y 8 frases, cada una de 18 a 70 caracteres, legibles y naturales.',
    'No uses lenguaje ofensivo. Evita repetir frases.',
    `Producto: ${ctx.productName}. Precio lista: ${ctx.listedPrice}.`,
    `Oferta cliente: ${ctx.buyerOffer}. Piso vendedor: ${ctx.floorPrice}. Cantidad: ${ctx.quantity}.`,
    'Incluye 1-2 frases de tensión y 1 frase de cierre inminente.',
  ].join(' ');
}

async function loadBaseSettings(supabase: any) {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'neg_anim_phrases',
      'neg_anim_climax_accepted',
      'neg_anim_climax_countered',
      'neg_anim_min_seconds',
      'ai_anim_phrases_enabled',
      'ai_provider',
      'ai_model',
      'openrouter_model',
      'gemini_api_key',
      'openai_api_key',
      'openrouter_api_key',
      'ai_gemini_enabled',
      'ai_openai_enabled',
      'ai_openrouter_enabled',
    ]);

  const rows = (data || []) as Array<{ key: string; value: string }>;
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? '';

  let phrases = DEFAULT_PHRASES;
  const rawPhrases = get('neg_anim_phrases');
  if (rawPhrases) {
    try {
      const parsed = JSON.parse(rawPhrases);
      if (Array.isArray(parsed) && parsed.length > 0) {
        phrases = uniquePhrases(parsed as string[], DEFAULT_PHRASES);
      }
    } catch {
      // keep defaults
    }
  }

  const rawSeconds = Number(get('neg_anim_min_seconds'));
  const minSeconds = Number.isFinite(rawSeconds) && rawSeconds >= 10 ? rawSeconds : 40;

  const aiProviderRaw = get('ai_provider');
  const aiProvider: AiProvider = aiProviderRaw === 'openai' || aiProviderRaw === 'openrouter' ? aiProviderRaw : 'gemini';
  const aiModel = get('ai_model') || 'gemini-2.0-flash-lite';
  const openRouterModel = get('openrouter_model') || aiModel || 'deepseek/deepseek-chat';

  return {
    get,
    phrases,
    minSeconds,
    climax: {
      accepted: get('neg_anim_climax_accepted') || DEFAULT_CLIMAX.accepted,
      countered: get('neg_anim_climax_countered') || DEFAULT_CLIMAX.countered,
    },
    ai: {
      enabled: get('ai_anim_phrases_enabled') === '' ? true : get('ai_anim_phrases_enabled') === 'true',
      provider: aiProvider,
      model: aiProvider === 'openrouter' ? openRouterModel : aiModel,
      geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || get('gemini_api_key'),
      openAiKey: process.env.OPENAI_API_KEY || get('openai_api_key'),
      openRouterKey: process.env.OPENROUTER_API_KEY || get('openrouter_api_key'),
      geminiEnabled: get('ai_gemini_enabled') === '' ? true : get('ai_gemini_enabled') === 'true',
      openAiEnabled: get('ai_openai_enabled') === '' ? true : get('ai_openai_enabled') === 'true',
      openRouterEnabled: get('ai_openrouter_enabled') === '' ? true : get('ai_openrouter_enabled') === 'true',
    },
  };
}

async function callProvider(provider: AiProvider, model: string, apiKey: string, prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    if (provider === 'gemini') {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            generationConfig: { temperature: 0.8, maxOutputTokens: 180 },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          }),
        },
      );
      if (!resp.ok) return null;
      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join(' ').trim() || null;
    }

    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 180,
          temperature: 0.8,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data?.choices?.[0]?.message?.content?.trim() || null;
    }

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 180,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const settings = await loadBaseSettings(supabase);

    return NextResponse.json({
      phrases: settings.phrases,
      climax: settings.climax,
      minSeconds: settings.minSeconds,
      aiAnimationEnabled: settings.ai.enabled,
    });
  } catch {
    return NextResponse.json({
      phrases: DEFAULT_PHRASES,
      climax: DEFAULT_CLIMAX,
      minSeconds: 40,
      aiAnimationEnabled: true,
    });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const body = await req.json().catch(() => ({} as AnimRequestBody)) as AnimRequestBody;
    const settings = await loadBaseSettings(supabase);

    const fallback = {
      phrases: settings.phrases,
      climax: settings.climax,
      minSeconds: settings.minSeconds,
    };

    if (!settings.ai.enabled) {
      return NextResponse.json({ ...fallback, aiUsed: false, fallbackReason: 'disabled' });
    }

    const providerPool: Array<{ provider: AiProvider; enabled: boolean; key: string; model: string }> = [
      {
        provider: settings.ai.provider,
        enabled:
          settings.ai.provider === 'gemini'
            ? settings.ai.geminiEnabled
            : settings.ai.provider === 'openai'
              ? settings.ai.openAiEnabled
              : settings.ai.openRouterEnabled,
        key:
          settings.ai.provider === 'gemini'
            ? settings.ai.geminiKey
            : settings.ai.provider === 'openai'
              ? settings.ai.openAiKey
              : settings.ai.openRouterKey,
        model: settings.ai.model,
      },
      { provider: 'gemini', enabled: settings.ai.geminiEnabled, key: settings.ai.geminiKey, model: 'gemini-2.0-flash-lite' },
      { provider: 'openai', enabled: settings.ai.openAiEnabled, key: settings.ai.openAiKey, model: 'gpt-4o-mini' },
      { provider: 'openrouter', enabled: settings.ai.openRouterEnabled, key: settings.ai.openRouterKey, model: settings.get('openrouter_model') || 'deepseek/deepseek-chat' },
    ];

    const seen = new Set<string>();
    const orderedProviders = providerPool.filter((p) => {
      const id = `${p.provider}:${p.model}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return p.enabled && Boolean(p.key);
    });

    if (orderedProviders.length === 0) {
      return NextResponse.json({ ...fallback, aiUsed: false, fallbackReason: 'no_provider' });
    }

    const prompt = buildPrompt({
      productName: body.productName?.trim() || 'producto',
      listedPrice: Number(body.listedPrice) || 0,
      floorPrice: Number(body.floorPrice) || 0,
      buyerOffer: Number(body.buyerOffer) || 0,
      quantity: Math.max(1, Number(body.quantity) || 1),
    });

    for (const selected of orderedProviders) {
      const raw = await callProvider(selected.provider, selected.model, selected.key, prompt);
      if (!raw) continue;

      const parsedPhrases = parseGeneratedPhrases(raw);
      if (parsedPhrases.length >= 4) {
        return NextResponse.json({
          phrases: uniquePhrases(parsedPhrases, settings.phrases),
          climax: settings.climax,
          minSeconds: settings.minSeconds,
          aiUsed: true,
          provider: selected.provider,
          model: selected.model,
        });
      }
    }

    return NextResponse.json({ ...fallback, aiUsed: false, fallbackReason: 'ai_failed' });
  } catch {
    return NextResponse.json({
      phrases: DEFAULT_PHRASES,
      climax: DEFAULT_CLIMAX,
      minSeconds: 40,
      aiUsed: false,
      fallbackReason: 'server_error',
    });
  }
}
