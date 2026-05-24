import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const provider: string = body?.provider || 'gemini';

    // Read keys and model from app_settings
    const { data: appRows } = await supabaseServer
      .from('app_settings')
      .select('key, value')
      .in('key', ['gemini_api_key', 'openai_api_key', 'ai_model']);

    const getVal = (k: string) =>
      (appRows || []).find((r: { key: string; value: string }) => r.key === k)?.value || '';

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || getVal('gemini_api_key');
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'No hay API Key de Gemini configurada.' });
      }
      const model = getVal('ai_model') || 'gemini-1.5-flash';
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
        return NextResponse.json({ ok: false, error: `Gemini respondió con error: ${msg}` });
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
        return NextResponse.json({ ok: false, error: `OpenAI respondió con error: ${msg}` });
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
