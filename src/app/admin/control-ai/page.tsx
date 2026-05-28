'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type TabKey = 'observability' | 'operational' | 'tukibot';
type AiProvider = 'gemini' | 'openai' | 'openrouter';
type MsgTipo = 'accepted_single' | 'accepted_multi' | 'countered_single' | 'countered_multi';

interface TukiMessage {
  id: string;
  tipo: MsgTipo;
  texto: string;
  activo: boolean;
}

interface AppSetting {
  id: string;
  key: string;
  value: string;
  label?: string;
  description?: string;
}

interface ObservabilityStats {
  total24h: number;
  accepted24h: number;
  countered24h: number;
  acceptanceRate: number;
  aiUsageRate: number;
  aiSuccessRate: number;
  fallbackRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  failures15m: number;
}

interface AiEvent {
  id: string;
  created_at: string;
  provider: 'gemini' | 'openai' | 'openrouter' | 'none';
  model: string | null;
  ai_used: boolean;
  ai_success: boolean;
  fallback_reason: string | null;
  latency_ms: number | null;
  status: 'accepted' | 'countered';
}

interface AlertState {
  label: string;
  level: 'ok' | 'warn' | 'danger';
  detail: string;
}

export default function ControlAiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('observability');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // TukiBot messages state
  const [tukiMessages, setTukiMessages] = useState<TukiMessage[]>([]);
  const [tukiLoading, setTukiLoading] = useState(false);
  const [tukiSaving, setTukiSaving] = useState<string | null>(null);
  const [tukiError, setTukiError] = useState('');
  const [tukiSuccess, setTukiSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTexto, setEditingTexto] = useState('');
  const [newTipo, setNewTipo] = useState<MsgTipo>('accepted_single');
  const [newTexto, setNewTexto] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  // Animation phrases state
  const [animPhrases, setAnimPhrases] = useState<string[]>([]);
  const [animClimaxAccepted, setAnimClimaxAccepted] = useState('');
  const [animClimaxCountered, setAnimClimaxCountered] = useState('');
  const [animPhrasesLoading, setAnimPhrasesLoading] = useState(false);
  const [animPhrasesSaving, setAnimPhrasesSaving] = useState(false);
  const [animPhrasesError, setAnimPhrasesError] = useState('');
  const [animPhrasesSuccess, setAnimPhrasesSuccess] = useState('');
  const [newAnimPhrase, setNewAnimPhrase] = useState('');
  const [editingAnimIdx, setEditingAnimIdx] = useState<number | null>(null);
  const [editingAnimText, setEditingAnimText] = useState('');

  const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash-lite');
  const [aiNegotiationEnabled, setAiNegotiationEnabled] = useState(true);
  const [aiGeminiEnabled, setAiGeminiEnabled] = useState(true);
  const [aiOpenAiEnabled, setAiOpenAiEnabled] = useState(true);
  const [aiOpenRouterEnabled, setAiOpenRouterEnabled] = useState(true);
  const [aiAutoDegradeEnabled, setAiAutoDegradeEnabled] = useState(true);
  const [alertFallbackPct, setAlertFallbackPct] = useState(25);
  const [alertLatencyP95Ms, setAlertLatencyP95Ms] = useState(16000);
  const [alertFailures15m, setAlertFailures15m] = useState(15);
  const [events24h, setEvents24h] = useState<AiEvent[]>([]);
  const [telemetryAvailable, setTelemetryAvailable] = useState(true);
  const [stats, setStats] = useState<ObservabilityStats>({
    total24h: 0,
    accepted24h: 0,
    countered24h: 0,
    acceptanceRate: 0,
    aiUsageRate: 0,
    aiSuccessRate: 0,
    fallbackRate: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    failures15m: 0,
  });

  const hasGeminiKey = useMemo(
    () => appSettings.some((s) => s.key === 'gemini_api_key' && Boolean(s.value)),
    [appSettings],
  );
  const hasOpenAiKey = useMemo(
    () => appSettings.some((s) => s.key === 'openai_api_key' && Boolean(s.value)),
    [appSettings],
  );
  const hasOpenRouterKey = useMemo(
    () => appSettings.some((s) => s.key === 'openrouter_api_key' && Boolean(s.value)),
    [appSettings],
  );

  const recentIncidents = useMemo(
    () => events24h
      .filter((e) => e.fallback_reason || (e.ai_used && !e.ai_success))
      .slice(0, 8),
    [events24h],
  );

  const providerCounts = useMemo(() => {
    const counters = { gemini: 0, openai: 0, openrouter: 0, none: 0 };
    events24h.forEach((e) => {
      if (e.provider === 'gemini' || e.provider === 'openai' || e.provider === 'openrouter' || e.provider === 'none') counters[e.provider] += 1;
    });
    return counters;
  }, [events24h]);

  const alerts = useMemo<AlertState[]>(() => {
    if (!telemetryAvailable) {
      return [{
        label: 'Telemetría AI',
        level: 'warn',
        detail: 'Tabla ai_negotiation_events no disponible. Ejecutá migración 088.',
      }];
    }

    const fallbackAlert: AlertState = stats.fallbackRate > alertFallbackPct
      ? {
          label: 'Fallback alto',
          level: 'danger',
          detail: `${stats.fallbackRate}% en 24h supera umbral ${alertFallbackPct}%`,
        }
      : {
          label: 'Fallback controlado',
          level: 'ok',
          detail: `${stats.fallbackRate}% en 24h`,
        };

    const latencyAlert: AlertState = stats.p95LatencyMs > alertLatencyP95Ms
      ? {
          label: 'Latencia p95 alta',
          level: 'warn',
          detail: `${stats.p95LatencyMs} ms supera ${alertLatencyP95Ms} ms`,
        }
      : {
          label: 'Latencia p95 estable',
          level: 'ok',
          detail: `${stats.p95LatencyMs} ms`,
        };

    const failuresAlert: AlertState = stats.failures15m > alertFailures15m
      ? {
          label: 'Errores recientes',
          level: 'danger',
          detail: `${stats.failures15m} fallos en 15m supera ${alertFailures15m}`,
        }
      : {
          label: 'Errores recientes',
          level: 'ok',
          detail: `${stats.failures15m} fallos en 15m`,
        };

    return [fallbackAlert, latencyAlert, failuresAlert];
  }, [alertFallbackPct, alertFailures15m, alertLatencyP95Ms, stats, telemetryAvailable]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const pricingRes = await fetch('/api/admin/pricing', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pricingRes.ok) {
        const body = await pricingRes.json().catch(() => ({}));
        throw new Error(body.error || `Error ${pricingRes.status} cargando Control AI`);
      }

      const pricingData = await pricingRes.json();
      const settings = (pricingData.app_settings || []) as AppSetting[];
      setAppSettings(settings);

      const getApp = (key: string) => {
        const row = settings.find((s) => s.key === key);
        return row?.value ?? '';
      };

      const provider = getApp('ai_provider');
      if (provider === 'gemini' || provider === 'openai' || provider === 'openrouter') {
        setAiProvider(provider);
      }
      const model = provider === 'openrouter' ? (getApp('openrouter_model') || getApp('ai_model')) : getApp('ai_model');
      if (model) setAiModel(model);

      const enabledRaw = getApp('ai_negotiation_enabled');
      setAiNegotiationEnabled(enabledRaw === '' ? true : enabledRaw === 'true');
      const geminiEnabledRaw = getApp('ai_gemini_enabled');
      setAiGeminiEnabled(geminiEnabledRaw === '' ? true : geminiEnabledRaw === 'true');
      const openAiEnabledRaw = getApp('ai_openai_enabled');
      setAiOpenAiEnabled(openAiEnabledRaw === '' ? true : openAiEnabledRaw === 'true');
      const openRouterEnabledRaw = getApp('ai_openrouter_enabled');
      setAiOpenRouterEnabled(openRouterEnabledRaw === '' ? true : openRouterEnabledRaw === 'true');
      const autoDegradeRaw = getApp('ai_auto_degrade_enabled');
      setAiAutoDegradeEnabled(autoDegradeRaw === '' ? true : autoDegradeRaw === 'true');

      const fallbackPctRaw = Number(getApp('ai_alert_fallback_pct'));
      if (Number.isFinite(fallbackPctRaw) && fallbackPctRaw > 0) setAlertFallbackPct(fallbackPctRaw);
      const latencyRaw = Number(getApp('ai_alert_latency_p95_ms'));
      if (Number.isFinite(latencyRaw) && latencyRaw > 0) setAlertLatencyP95Ms(latencyRaw);
      const failuresRaw = Number(getApp('ai_alert_failures_15m'));
      if (Number.isFinite(failuresRaw) && failuresRaw > 0) setAlertFailures15m(failuresRaw);

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const { data: events, error: eventsErr } = await supabase
        .from('ai_negotiation_events')
        .select('id, created_at, provider, model, ai_used, ai_success, fallback_reason, latency_ms, status')
        .gte('created_at', since24h)
        .order('created_at', { ascending: false })
        .limit(1500);

      if (eventsErr) {
        setTelemetryAvailable(false);
        setEvents24h([]);

        const [{ count: total24h }, { count: accepted24h }, { count: countered24h }] = await Promise.all([
          supabase
            .from('tukibot_negotiations')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', since24h),
          supabase
            .from('tukibot_negotiations')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'accepted')
            .gte('created_at', since24h),
          supabase
            .from('tukibot_negotiations')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'countered')
            .gte('created_at', since24h),
        ]);

        const total = total24h ?? 0;
        const accepted = accepted24h ?? 0;
        const countered = countered24h ?? 0;
        const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
        setStats({
          total24h: total,
          accepted24h: accepted,
          countered24h: countered,
          acceptanceRate,
          aiUsageRate: 0,
          aiSuccessRate: 0,
          fallbackRate: 0,
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          failures15m: 0,
        });
      } else {
        const rows = (events || []) as AiEvent[];
        setTelemetryAvailable(true);
        setEvents24h(rows);

        const total = rows.length;
        const accepted = rows.filter((r) => r.status === 'accepted').length;
        const countered = rows.filter((r) => r.status === 'countered').length;
        const used = rows.filter((r) => r.ai_used).length;
        const successUsed = rows.filter((r) => r.ai_used && r.ai_success).length;
        const fallbackCount = rows.filter((r) => Boolean(r.fallback_reason)).length;
        const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
        const aiUsageRate = total > 0 ? Math.round((used / total) * 100) : 0;
        const aiSuccessRate = used > 0 ? Math.round((successUsed / used) * 100) : 0;
        const fallbackRate = total > 0 ? Math.round((fallbackCount / total) * 100) : 0;

        const latencies = rows
          .filter((r) => r.ai_used && typeof r.latency_ms === 'number')
          .map((r) => Number(r.latency_ms))
          .sort((a, b) => a - b);
        const avgLatencyMs = latencies.length
          ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
          : 0;
        const p95LatencyMs = latencies.length
          ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
          : 0;

        const failures15m = rows.filter((r) => r.ai_used && !r.ai_success && r.created_at >= since15m).length;

        setStats({
          total24h: total,
          accepted24h: accepted,
          countered24h: countered,
          acceptanceRate,
          aiUsageRate,
          aiSuccessRate,
          fallbackRate,
          avgLatencyMs,
          p95LatencyMs,
          failures15m,
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchTukiMessages = useCallback(async () => {
    setTukiLoading(true);
    setTukiError('');
    try {
      const { data, error: dbErr } = await supabase
        .from('tukibot_messages')
        .select('id, tipo, texto, activo')
        .order('tipo')
        .order('created_at');
      if (dbErr) throw new Error(dbErr.message);
      setTukiMessages((data || []) as TukiMessage[]);
    } catch (err) {
      setTukiError(String(err));
    } finally {
      setTukiLoading(false);
    }
  }, []);

  const fetchAnimPhrases = useCallback(async () => {
    setAnimPhrasesLoading(true);
    setAnimPhrasesError('');
    try {
      const res = await fetch('/api/tienda/neg-phrases');
      const data = await res.json();
      setAnimPhrases(Array.isArray(data.phrases) ? data.phrases : []);
      setAnimClimaxAccepted(data.climax?.accepted ?? '');
      setAnimClimaxCountered(data.climax?.countered ?? '');
    } catch {
      setAnimPhrasesError('Error cargando frases de animación');
    } finally {
      setAnimPhrasesLoading(false);
    }
  }, []);

  const saveAnimPhrases = async (phrases: string[], climaxAcc: string, climaxCnt: string) => {
    setAnimPhrasesSaving(true);
    setAnimPhrasesError('');
    try {
      const { error: dbErr } = await supabase.from('app_settings').upsert([
        { key: 'neg_anim_phrases',          value: JSON.stringify(phrases) },
        { key: 'neg_anim_climax_accepted',   value: climaxAcc },
        { key: 'neg_anim_climax_countered',  value: climaxCnt },
      ], { onConflict: 'key' });
      if (dbErr) throw new Error(dbErr.message);
      setAnimPhrasesSuccess('Frases guardadas correctamente.');
      setTimeout(() => setAnimPhrasesSuccess(''), 2500);
    } catch (err) {
      setAnimPhrasesError(String(err));
    } finally {
      setAnimPhrasesSaving(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tukibot') {
      fetchTukiMessages();
      fetchAnimPhrases();
    }
  }, [activeTab, fetchTukiMessages, fetchAnimPhrases]);

  const toggleActivo = async (msg: TukiMessage) => {
    setTukiSaving(msg.id);
    const { error: dbErr } = await supabase
      .from('tukibot_messages')
      .update({ activo: !msg.activo })
      .eq('id', msg.id);
    if (dbErr) setTukiError(dbErr.message);
    else setTukiMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, activo: !m.activo } : m));
    setTukiSaving(null);
  };

  const saveTexto = async (msg: TukiMessage) => {
    if (!editingTexto.trim()) return;
    setTukiSaving(msg.id);
    const { error: dbErr } = await supabase
      .from('tukibot_messages')
      .update({ texto: editingTexto.trim() })
      .eq('id', msg.id);
    if (dbErr) setTukiError(dbErr.message);
    else {
      setTukiMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, texto: editingTexto.trim() } : m));
      setTukiSuccess('Mensaje actualizado.');
      setTimeout(() => setTukiSuccess(''), 2500);
    }
    setEditingId(null);
    setTukiSaving(null);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('¿Eliminar este mensaje?')) return;
    setTukiSaving(id);
    const { error: dbErr } = await supabase.from('tukibot_messages').delete().eq('id', id);
    if (dbErr) setTukiError(dbErr.message);
    else setTukiMessages((prev) => prev.filter((m) => m.id !== id));
    setTukiSaving(null);
  };

  const addMessage = async () => {
    if (!newTexto.trim()) return;
    setTukiSaving('new');
    const { data, error: dbErr } = await supabase
      .from('tukibot_messages')
      .insert({ tipo: newTipo, texto: newTexto.trim(), activo: true })
      .select('id, tipo, texto, activo')
      .single();
    if (dbErr) setTukiError(dbErr.message);
    else if (data) {
      setTukiMessages((prev) => [...prev, data as TukiMessage]);
      setNewTexto('');
      setAddingNew(false);
      setTukiSuccess('Mensaje agregado.');
      setTimeout(() => setTukiSuccess(''), 2500);
    }
    setTukiSaving(null);
  };

  const saveOperationalControls = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const mergedApp = [...appSettings];
      const setApp = (key: string, value: string) => {
        const idx = mergedApp.findIndex((s) => s.key === key);
        if (idx >= 0) mergedApp[idx] = { ...mergedApp[idx], value };
        else mergedApp.push({ id: key, key, value, label: key, description: '' });
      };

      setApp('ai_provider', aiProvider);
      setApp('ai_model', aiModel);
      setApp('ai_negotiation_enabled', aiNegotiationEnabled ? 'true' : 'false');
      setApp('ai_gemini_enabled', aiGeminiEnabled ? 'true' : 'false');
      setApp('ai_openai_enabled', aiOpenAiEnabled ? 'true' : 'false');
      setApp('ai_openrouter_enabled', aiOpenRouterEnabled ? 'true' : 'false');
      setApp('ai_auto_degrade_enabled', aiAutoDegradeEnabled ? 'true' : 'false');
      setApp('ai_alert_fallback_pct', String(alertFallbackPct));
      setApp('ai_alert_latency_p95_ms', String(alertLatencyP95Ms));
      setApp('ai_alert_failures_15m', String(alertFailures15m));

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          package_multipliers: [],
          vehicle_pricing: [],
          pricing_settings: [],
          app_settings: mergedApp,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.errors?.join(', ') || data.error || 'No se pudo guardar Control AI');
      }

      setSuccess('Control operativo guardado correctamente.');
      setTimeout(() => setSuccess(''), 3000);
      await fetchData();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/test-aikey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider: aiProvider }),
      });

      const data = await res.json();
      if (!data.ok) {
        if (data.code === 'quota_exceeded') {
          const retryLabel = data.retryAfterSeconds ? ` Reintento sugerido en ${data.retryAfterSeconds}s.` : '';
          const recommendation = data.recommendation ? ` ${data.recommendation}` : '';
          setTestMsg(`Cuota/límite temporal alcanzado.${retryLabel}${recommendation}`);
        } else {
          setTestMsg(data.error || 'La prueba de conexión falló.');
        }
        return;
      }

      setTestMsg(`Conexión exitosa (${data.model}).`);
    } catch (err) {
      if (err instanceof Error) {
        setTestMsg(err.message);
      } else {
        setTestMsg('No se pudo completar la prueba de conexión.');
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Control AI</h1>
        <p className="text-gray-500 text-sm mt-1">
          Centro de operación y monitoreo para negociaciones del TukiBot con Gemini/OpenAI/OpenRouter.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('observability')}
          className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
            activeTab === 'observability'
              ? 'bg-[#F5C518] text-[#1d2327] border-[#F5C518]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          Observabilidad
        </button>
        <button
          onClick={() => setActiveTab('operational')}
          className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
            activeTab === 'operational'
              ? 'bg-[#F5C518] text-[#1d2327] border-[#F5C518]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          Control operativo
        </button>
        <button
          onClick={() => setActiveTab('tukibot')}
          className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
            activeTab === 'tukibot'
              ? 'bg-[#F5C518] text-[#1d2327] border-[#F5C518]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          TukiBot mensajes
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-sm text-gray-500">Cargando panel de AI...</div>
      ) : activeTab === 'observability' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <CardMetric label="Negociaciones 24h" value={String(stats.total24h)} />
            <CardMetric label="Aceptadas 24h" value={String(stats.accepted24h)} />
            <CardMetric label="Contraofertas 24h" value={String(stats.countered24h)} />
            <CardMetric label="Tasa aceptación" value={`${stats.acceptanceRate}%`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <CardMetric label="Uso de IA" value={`${stats.aiUsageRate}%`} />
            <CardMetric label="Éxito IA" value={`${stats.aiSuccessRate}%`} />
            <CardMetric label="Fallback 24h" value={`${stats.fallbackRate}%`} />
            <CardMetric label="Latencia p95" value={`${stats.p95LatencyMs} ms`} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Alertas automáticas</h2>
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.label} className={`rounded-lg border px-3 py-2 text-sm ${
                  a.level === 'danger'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : a.level === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  <strong>{a.label}:</strong> {a.detail}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Estado del motor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Proveedor activo" value={aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'} />
              <InfoRow label="Modelo activo" value={aiModel || 'No definido'} />
              <InfoRow label="Gemini API Key" value={hasGeminiKey ? 'Configurada' : 'No configurada'} />
              <InfoRow label="OpenAI API Key" value={hasOpenAiKey ? 'Configurada' : 'No configurada'} />
              <InfoRow label="OpenRouter API Key" value={hasOpenRouterKey ? 'Configurada' : 'No configurada'} />
              <InfoRow label="Negociación AI" value={aiNegotiationEnabled ? 'Habilitada' : 'Deshabilitada'} />
              <InfoRow label="Gemini habilitado" value={aiGeminiEnabled ? 'Sí' : 'No'} />
              <InfoRow label="OpenAI habilitado" value={aiOpenAiEnabled ? 'Sí' : 'No'} />
              <InfoRow label="OpenRouter habilitado" value={aiOpenRouterEnabled ? 'Sí' : 'No'} />
              <InfoRow label="Auto-degradación" value={aiAutoDegradeEnabled ? 'Activa' : 'Inactiva'} />
              <InfoRow label="Latencia promedio" value={`${stats.avgLatencyMs} ms`} />
              <InfoRow label="Fallos últimos 15m" value={String(stats.failures15m)} />
              <InfoRow label="Eventos Gemini 24h" value={String(providerCounts.gemini)} />
              <InfoRow label="Eventos OpenAI 24h" value={String(providerCounts.openai)} />
              <InfoRow label="Eventos OpenRouter 24h" value={String(providerCounts.openrouter)} />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={testConnection}
                disabled={testing}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-60"
              >
                {testing ? 'Probando conexión...' : 'Probar conexión AI'}
              </button>
              {testMsg && <span className="text-sm text-gray-600">{testMsg}</span>}
            </div>

            {!telemetryAvailable && (
              <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Telemetría AI no disponible: ejecutá la migración 088 para habilitar métricas de latencia/fallback y alertas reales.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Incidentes recientes</h2>
            {recentIncidents.length === 0 ? (
              <p className="text-sm text-gray-500">Sin incidentes en las últimas 24h.</p>
            ) : (
              <div className="space-y-2">
                {recentIncidents.map((ev) => (
                  <div key={ev.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-800">{new Date(ev.created_at).toLocaleString('es-PY')}</span>
                      <span className="text-xs text-gray-500">{ev.provider} {ev.model ? `· ${ev.model}` : ''}</span>
                    </div>
                    <div className="text-gray-600 mt-1">
                      {ev.fallback_reason ? `Fallback: ${ev.fallback_reason}` : 'Fallo de IA sin fallback_reason'}
                      {typeof ev.latency_ms === 'number' ? ` · ${ev.latency_ms} ms` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'tukibot' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-800">Mensajes fallback TukiBot</h2>
              <button
                onClick={() => { setAddingNew(true); setTukiError(''); setTukiSuccess(''); }}
                className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black"
              >
                + Agregar mensaje
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Usados cuando la IA no está disponible. Variables: <code className="bg-gray-100 px-1 rounded">{'{precio}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{total}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{ahorro}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{producto}'}</code>.
            </p>

            {tukiError && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{tukiError}</div>}
            {tukiSuccess && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{tukiSuccess}</div>}

            {addingNew && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <p className="text-xs font-semibold text-gray-700 mb-2">Nuevo mensaje</p>
                <div className="flex flex-col gap-2">
                  <select
                    value={newTipo}
                    onChange={(e) => setNewTipo(e.target.value as MsgTipo)}
                    className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="accepted_single">accepted_single — Aceptado, unidad</option>
                    <option value="accepted_multi">accepted_multi — Aceptado, múltiple</option>
                    <option value="countered_single">countered_single — Contraoferta, unidad</option>
                    <option value="countered_multi">countered_multi — Contraoferta, múltiple</option>
                  </select>
                  <textarea
                    value={newTexto}
                    onChange={(e) => setNewTexto(e.target.value)}
                    rows={3}
                    placeholder="Texto del mensaje con variables {precio}, {producto}..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addMessage}
                      disabled={tukiSaving === 'new' || !newTexto.trim()}
                      className="px-4 py-2 rounded-lg bg-[#F5C518] text-[#1d2327] text-sm font-bold hover:bg-yellow-400 disabled:opacity-60"
                    >
                      {tukiSaving === 'new' ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => { setAddingNew(false); setNewTexto(''); }}
                      className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tukiLoading ? (
              <p className="text-sm text-gray-500">Cargando mensajes...</p>
            ) : (
              (['accepted_single', 'accepted_multi', 'countered_single', 'countered_multi'] as MsgTipo[]).map((tipo) => {
                const msgs = tukiMessages.filter((m) => m.tipo === tipo);
                return (
                  <div key={tipo} className="mb-5">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{tipo.replace('_', ' · ')}</h3>
                    {msgs.length === 0 && <p className="text-xs text-gray-400">Sin variantes.</p>}
                    <div className="space-y-2">
                      {msgs.map((msg) => (
                        <div key={msg.id} className={`border rounded-xl p-3 text-sm transition-colors ${
                          msg.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                        }`}>
                          {editingId === msg.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingTexto}
                                onChange={(e) => setEditingTexto(e.target.value)}
                                rows={3}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm resize-y"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveTexto(msg)}
                                  disabled={tukiSaving === msg.id}
                                  className="px-3 py-1.5 rounded-lg bg-[#F5C518] text-[#1d2327] text-xs font-bold disabled:opacity-60"
                                >
                                  {tukiSaving === msg.id ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-gray-700 leading-snug flex-1">{msg.texto}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => { setEditingId(msg.id); setEditingTexto(msg.texto); }}
                                  className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => toggleActivo(msg)}
                                  disabled={tukiSaving === msg.id}
                                  className={`px-2 py-1 text-xs rounded border ${
                                    msg.activo
                                      ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                  } disabled:opacity-60`}
                                >
                                  {msg.activo ? 'Activo' : 'Inactivo'}
                                </button>
                                <button
                                  onClick={() => deleteMessage(msg.id)}
                                  disabled={tukiSaving === msg.id}
                                  className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Frases de animación de negociación ── */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-800">Frases de animación</h2>
              <button
                onClick={() => saveAnimPhrases(animPhrases, animClimaxAccepted, animClimaxCountered)}
                disabled={animPhrasesSaving}
                className="px-3 py-1.5 rounded-lg bg-[#F5C518] text-[#1d2327] text-xs font-bold disabled:opacity-60"
              >
                {animPhrasesSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Se muestran en pantalla mientras TukiBot negocia. Orden aleatorio en cada sesión.
            </p>

            {animPhrasesError && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{animPhrasesError}</div>}
            {animPhrasesSuccess && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{animPhrasesSuccess}</div>}

            {animPhrasesLoading ? (
              <p className="text-sm text-gray-500">Cargando frases...</p>
            ) : (
              <>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Frases principales</h3>
                <div className="space-y-2 mb-4">
                  {animPhrases.map((phrase, idx) => (
                    <div key={idx} className="border border-gray-200 bg-white rounded-xl p-3 text-sm">
                      {editingAnimIdx === idx ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingAnimText}
                            onChange={(e) => setEditingAnimText(e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (editingAnimText.trim()) {
                                  const updated = [...animPhrases];
                                  updated[idx] = editingAnimText.trim();
                                  setAnimPhrases(updated);
                                }
                                setEditingAnimIdx(null);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#F5C518] text-[#1d2327] text-xs font-bold"
                            >
                              Aplicar
                            </button>
                            <button
                              onClick={() => setEditingAnimIdx(null)}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-gray-700 leading-snug flex-1">{phrase}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => { setEditingAnimIdx(idx); setEditingAnimText(phrase); }}
                              className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setAnimPhrases((prev) => prev.filter((_, i) => i !== idx))}
                              className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={newAnimPhrase}
                    onChange={(e) => setNewAnimPhrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newAnimPhrase.trim()) {
                        setAnimPhrases((prev) => [...prev, newAnimPhrase.trim()]);
                        setNewAnimPhrase('');
                      }
                    }}
                    placeholder="Nueva frase de animación..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => {
                      if (newAnimPhrase.trim()) {
                        setAnimPhrases((prev) => [...prev, newAnimPhrase.trim()]);
                        setNewAnimPhrase('');
                      }
                    }}
                    disabled={!newAnimPhrase.trim()}
                    className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black disabled:opacity-40"
                  >
                    + Agregar
                  </button>
                </div>

                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Frase clímax</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600 font-semibold mb-1 block">Cuando acepta ✅</label>
                    <input
                      type="text"
                      value={animClimaxAccepted}
                      onChange={(e) => setAnimClimaxAccepted(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 font-semibold mb-1 block">Cuando contraoferta 🤝</label>
                    <input
                      type="text"
                      value={animClimaxCountered}
                      onChange={(e) => setAnimClimaxCountered(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Política operativa</h2>
            <p className="text-xs text-gray-500 mb-4">
              Controla motor y comportamiento global sin tocar código ni desplegar.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor AI</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AiProvider)}
                  className="w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Modelo</label>
                {aiProvider === 'gemini' ? (
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (recomendado)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash (preview)</option>
                  </select>
                ) : aiProvider === 'openai' ? (
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="gpt-4o-mini">GPT-4o mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                ) : (
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="deepseek/deepseek-chat">DeepSeek Chat (barato)</option>
                    <option value="qwen/qwen3-14b">Qwen 3 14B</option>
                    <option value="meta-llama/llama-3.1-8b-instruct">Llama 3.1 8B Instruct</option>
                  </select>
                )}
              </div>

              <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Negociación AI habilitada</p>
                  <p className="text-xs text-gray-500">Si se desactiva, el sistema usa fallback server-side sin IA.</p>
                </div>
                <button
                  onClick={() => setAiNegotiationEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    aiNegotiationEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      aiNegotiationEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Gemini habilitado</p>
                    <p className="text-xs text-gray-500">Controla uso del proveedor Gemini.</p>
                  </div>
                  <button
                    onClick={() => setAiGeminiEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                      aiGeminiEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      aiGeminiEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">OpenAI habilitado</p>
                    <p className="text-xs text-gray-500">Controla uso del proveedor OpenAI.</p>
                  </div>
                  <button
                    onClick={() => setAiOpenAiEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                      aiOpenAiEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      aiOpenAiEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">OpenRouter habilitado</p>
                    <p className="text-xs text-gray-500">Controla uso del proveedor OpenRouter.</p>
                  </div>
                  <button
                    onClick={() => setAiOpenRouterEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                      aiOpenRouterEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      aiOpenRouterEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Auto-degradación</p>
                  <p className="text-xs text-gray-500">Si hay anomalías, prioriza fallback para no perder ventas.</p>
                </div>
                <button
                  onClick={() => setAiAutoDegradeEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    aiAutoDegradeEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    aiAutoDegradeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <InputNumber
                  label="Umbral fallback % (24h)"
                  value={alertFallbackPct}
                  min={1}
                  max={100}
                  step={1}
                  onChange={setAlertFallbackPct}
                />
                <InputNumber
                  label="Umbral latencia p95 (ms)"
                  value={alertLatencyP95Ms}
                  min={1000}
                  max={60000}
                  step={500}
                  onChange={setAlertLatencyP95Ms}
                />
                <InputNumber
                  label="Umbral fallos 15m"
                  value={alertFailures15m}
                  min={1}
                  max={500}
                  step={1}
                  onChange={setAlertFailures15m}
                />
              </div>
            </div>

            <div className="mt-5">
              <button
                onClick={saveOperationalControls}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg bg-[#F5C518] text-[#1d2327] text-sm font-bold hover:bg-yellow-400 disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar control operativo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function InputNumber(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const { label, value, min, max, step, onChange } = props;
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || min)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </div>
  );
}
