import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function parseProviderError(provider: 'gemini' | 'openai' | 'openrouter', status: number, msg: string) {
  const lower = msg.toLowerCase();
  const isQuota =
    status === 429 ||
    lower.includes('quota exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted');

  if (!isQuota) {
    return {
      ok: false,
      code: 'provider_error',
      provider,
      error: `${provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'OpenRouter'} respondió con error: ${msg}`,
    };
  }

  const retryMatch = msg.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  const retryAfterSeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;

  const recommendation = provider === 'gemini'
    ? 'Superaste la cuota/rate-limit de Gemini. Probá esperar el tiempo sugerido, cambiar temporalmente a OpenAI o usar un modelo con más disponibilidad.'
    : provider === 'openai'
      ? 'Superaste la cuota/rate-limit de OpenAI. Probá esperar el tiempo sugerido o revisar límites/billing del proveedor.'
      : 'Superaste la cuota/rate-limit de OpenRouter. Probá esperar el tiempo sugerido o cambiar a otro modelo/proveedor temporalmente.';

  return {
    ok: false,
    code: 'quota_exceeded',
    provider,
    retryAfterSeconds,
    recommendation,
    error: `${provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'OpenRouter'} alcanzó su cuota/límite temporal.`,
    details: msg,
  };
}

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const provider: string = body?.provider || 'gemini';

    const testLimiterKey = `rl:admin:test-aikey:${admin.id}:${provider}`;
    const testAllowed = await allowRequest(testLimiterKey, 1, 15);
    if (!testAllowed) {
      return NextResponse.json({
        ok: false,
        code: 'test_cooldown',
        error: 'Esperá 15 segundos antes de volver a probar la conexión.',
      });
    }

    // Read keys and model from app_settings
    const { data: appRows } = await supabaseServer
      .from('app_settings')
      .select('key, value')
      .in('key', ['gemini_api_key', 'openai_api_key', 'openrouter_api_key', 'ai_model', 'openrouter_model']);

    const getVal = (k: string) =>
      (appRows || []).find((r: { key: string; value: string }) => r.key === k)?.value || '';

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || getVal('gemini_api_key');
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'No hay API Key de Gemini configurada.' });
      }
      const model = getVal('ai_model') || 'gemini-2.0-flash-lite';
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { temperature: 0.5, maxOutputTokens: 40 },
            contents: [{ role: 'user', parts: [{ text: 'Respondé solo con la palabra: OK' }] }],
          }),
        },
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody as { error?: { message?: string } })?.error?.message || `HTTP ${resp.status}`;
        return NextResponse.json(parseProviderError('gemini', resp.status, msg));
      }
      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(sin respuesta)';
      return NextResponse.json({ ok: true, model, reply: text });
    }

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY || getVal('openai_api_key');
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'No hay API Key de OpenAI configurada.' });
      }
      const model = getVal('ai_model') || 'gpt-4o-mini';
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Respondé solo con la palabra: OK' }],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody as { error?: { message?: string } })?.error?.message || `HTTP ${resp.status}`;
        return NextResponse.json(parseProviderError('openai', resp.status, msg));
      }
      const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data?.choices?.[0]?.message?.content?.trim() || '(sin respuesta)';
      return NextResponse.json({ ok: true, model, reply: text });
    }

    if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY || getVal('openrouter_api_key');
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'No hay API Key de OpenRouter configurada.' });
      }
      const model = getVal('openrouter_model') || getVal('ai_model') || 'deepseek/deepseek-chat';
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 20,
          messages: [{ role: 'user', content: 'Respondé solo con la palabra: OK' }],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody as { error?: { message?: string } })?.error?.message || `HTTP ${resp.status}`;
        return NextResponse.json(parseProviderError('openrouter', resp.status, msg));
      }
      const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data?.choices?.[0]?.message?.content?.trim() || '(sin respuesta)';
      return NextResponse.json({ ok: true, model, reply: text });
    }

    return NextResponse.json({ ok: false, error: 'Proveedor no soportado.' });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
