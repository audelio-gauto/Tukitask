'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type TabKey = 'observability' | 'operational';
type AiProvider = 'gemini' | 'openai';

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
}

export default function ControlAiPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('observability');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash');
  const [aiNegotiationEnabled, setAiNegotiationEnabled] = useState(true);
  const [stats, setStats] = useState<ObservabilityStats>({
    total24h: 0,
    accepted24h: 0,
    countered24h: 0,
    acceptanceRate: 0,
  });

  const hasGeminiKey = useMemo(
    () => appSettings.some((s) => s.key === 'gemini_api_key' && Boolean(s.value)),
    [appSettings],
  );
  const hasOpenAiKey = useMemo(
    () => appSettings.some((s) => s.key === 'openai_api_key' && Boolean(s.value)),
    [appSettings],
  );

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
      if (provider === 'gemini' || provider === 'openai') {
        setAiProvider(provider);
      }
      const model = getApp('ai_model');
      if (model) setAiModel(model);

      const enabledRaw = getApp('ai_negotiation_enabled');
      setAiNegotiationEnabled(enabledRaw === '' ? true : enabledRaw === 'true');

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: total24h }, { count: accepted24h }, { count: countered24h }] = await Promise.all([
        supabase
          .from('tukibot_negotiations')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since),
        supabase
          .from('tukibot_negotiations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .gte('created_at', since),
        supabase
          .from('tukibot_negotiations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'countered')
          .gte('created_at', since),
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
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        throw new Error(data.error || 'La prueba de conexión falló');
      }

      setTestMsg(`Conexión exitosa (${data.model}).`);
    } catch (err) {
      setTestMsg(`Error: ${String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Control AI</h1>
        <p className="text-gray-500 text-sm mt-1">
          Centro de operación y monitoreo para negociaciones del TukiBot con Gemini/OpenAI.
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

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Estado del motor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Proveedor activo" value={aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} />
              <InfoRow label="Modelo activo" value={aiModel || 'No definido'} />
              <InfoRow label="Gemini API Key" value={hasGeminiKey ? 'Configurada' : 'No configurada'} />
              <InfoRow label="OpenAI API Key" value={hasOpenAiKey ? 'Configurada' : 'No configurada'} />
              <InfoRow label="Negociación AI" value={aiNegotiationEnabled ? 'Habilitada' : 'Deshabilitada'} />
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
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                ) : (
                  <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="gpt-4o-mini">GPT-4o mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
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
