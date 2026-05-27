'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20'];
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
const OPENROUTER_MODELS = ['deepseek/deepseek-chat', 'qwen/qwen3-14b', 'meta-llama/llama-3.1-8b-instruct'];

export default function ApiKeysPage() {
  const [appSettings, setAppSettings] = useState<Array<{ id: string; key: string; value: string; label?: string; description?: string }>>([]);
  const [pricingSettings, setPricingSettings] = useState<Array<{ id: string; key: string; value: number; label: string; description: string }>>([]);
  const [mapboxKey, setMapboxKey] = useState<string>('');
  const [googleKey, setGoogleKey] = useState<string>('');
  // AI settings
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'openrouter'>('gemini');
  const [aiModel, setAiModel] = useState<string>('gemini-2.5-flash');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openrouterKey, setOpenrouterKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/pricing', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Error ${res.status} al cargar configuración`);
      }
      const data = await res.json();
      setAppSettings(data.app_settings || []);
      setPricingSettings(data.pricing_settings || []);

      const getApp = (k: string) => {
        const a = (data.app_settings || []).find((x: { key: string; value: string }) => x.key === k);
        return a ? String(a.value || '') : '';
      };
      setMapboxKey(getApp('mapbox_api_key'));
      setGoogleKey(getApp('google_maps_api_key'));
      const providerVal = getApp('ai_provider');
      if (providerVal === 'openai' || providerVal === 'gemini' || providerVal === 'openrouter') setAiProvider(providerVal);
      const modelVal = providerVal === 'openrouter' ? (getApp('openrouter_model') || getApp('ai_model')) : getApp('ai_model');
      if (modelVal) setAiModel(modelVal);
      // Don't pre-fill secret keys — keep inputs blank, show placeholder if configured
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const allowedModels = aiProvider === 'gemini'
      ? GEMINI_MODELS
      : aiProvider === 'openai'
        ? OPENAI_MODELS
        : OPENROUTER_MODELS;

    if (!allowedModels.includes(aiModel)) {
      setAiModel(allowedModels[0]);
    }
  }, [aiProvider, aiModel, GEMINI_MODELS, OPENAI_MODELS, OPENROUTER_MODELS]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const mergedApp = [...appSettings];
      const setApp = (key: string, value: string) => {
        const idx = mergedApp.findIndex(s => s.key === key);
        if (idx >= 0) mergedApp[idx] = { ...mergedApp[idx], value };
        else mergedApp.push({ id: key, key, value, label: key, description: '' });
      };

      // Only update secret keys if the user typed something — blank = preserve existing DB value
      if (mapboxKey) setApp('mapbox_api_key', mapboxKey);
      if (googleKey) setApp('google_maps_api_key', googleKey);
      if (geminiKey) setApp('gemini_api_key', geminiKey);
      if (openaiKey) setApp('openai_api_key', openaiKey);
      if (openrouterKey) setApp('openrouter_api_key', openrouterKey);
      // Always persist provider + model selection
      setApp('ai_provider', aiProvider);
      if (aiProvider === 'openrouter') {
        setApp('openrouter_model', aiModel);
      } else {
        setApp('ai_model', aiModel);
      }

      // Build pricing_settings payload (only map_provider if it exists)
      const mergedPricing = pricingSettings.filter(s => s.key === 'map_provider');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          package_multipliers: [],
          vehicle_pricing: [],
          pricing_settings: mergedPricing,
          app_settings: mergedApp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.errors?.join(', ') || data.error || 'Error al guardar');
      } else {
        setSuccess('API Keys guardadas correctamente');
        setTimeout(() => setSuccess(''), 3000);
        // Clear secret key inputs after save (values are now persisted)
        setMapboxKey('');
        setGoogleKey('');
        setGeminiKey('');
        setOpenaiKey('');
        setOpenrouterKey('');
        await fetchData();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const mapProvider = pricingSettings.find(s => s.key === 'map_provider');

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/test-aikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: aiProvider }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, msg: `✅ Conexión exitosa. Modelo: ${data.model}. Respuesta: “${data.reply}”` });
      } else {
        setTestResult({ ok: false, msg: `❌ ${data.error || 'Error desconocido'}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `❌ ${String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5C518]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Los API Keys</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gestiona las claves de acceso para mapas externos e IA de contenido.
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Mapas y APIs</h3>
        <p className="text-xs text-gray-400 mb-5">
          Configurá el proveedor de mapas activo y pegá las claves secretas. Dejá en blanco para conservar la key existente.
        </p>

        {/* Map provider selector */}
        {mapProvider && (
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor de Mapas</label>
            <select
              value={String(mapProvider.value)}
              onChange={e => {
                setPricingSettings(prev =>
                  prev.map(s => s.key === 'map_provider' ? { ...s, value: Number(e.target.value) } : s)
                );
              }}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="1">Mapbox</option>
              <option value="2">Google Maps</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Elige qué proveedor usar para mapas y autocompletado.</p>
          </div>
        )}

        {/* Mapbox API Key */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Mapbox API Key</label>
          <input
            type="password"
            autoComplete="new-password"
            value={mapboxKey}
            onChange={e => setMapboxKey(e.target.value)}
            placeholder={
              appSettings.some(s => s.key === 'mapbox_api_key' && s.value)
                ? '••••••••••••••• (configurada)'
                : 'Pegar nueva key...'
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            {appSettings.some(s => s.key === 'mapbox_api_key' && s.value)
              ? 'Ya hay una key guardada. Pegá aquí para reemplazarla, o dejá en blanco para mantenerla.'
              : 'Dejá en blanco para mantener la key existente.'}
          </p>
        </div>

        {/* Google Maps API Key */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API Key</label>
          <input
            type="password"
            autoComplete="new-password"
            value={googleKey}
            onChange={e => setGoogleKey(e.target.value)}
            placeholder={
              appSettings.some(s => s.key === 'google_maps_api_key' && s.value)
                ? '••••••••••••••• (configurada)'
                : 'Pegar nueva key...'
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            {appSettings.some(s => s.key === 'google_maps_api_key' && s.value)
              ? 'Ya hay una key guardada. Pegá aquí para reemplazarla, o dejá en blanco para mantenerla.'
              : 'Dejá en blanco para mantener la key existente.'}
          </p>
        </div>

        {/* Status indicators */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appSettings.some(s => s.key === 'mapbox_api_key' && s.value) ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              Mapbox: {appSettings.some(s => s.key === 'mapbox_api_key' && s.value) ? 'configurada' : 'no configurada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appSettings.some(s => s.key === 'google_maps_api_key' && s.value) ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              Google Maps: {appSettings.some(s => s.key === 'google_maps_api_key' && s.value) ? 'configurada' : 'no configurada'}
            </span>
          </div>
        </div>
      </div>

      {/* ── IA para Contenido ─────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">IA para Contenido</h3>
        <p className="text-xs text-gray-400 mb-5">
          Usada por el TukiBot para generar descripciones de productos, responder consultas y humanizar el tono del negocio.
        </p>

        {/* Motor */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-0.5">Motor</label>
          <p className="text-xs text-gray-400 mb-2">Seleccione qué proveedor de IA utilizar para generar contenido.</p>
          <select
            value={aiProvider}
            onChange={e => setAiProvider(e.target.value as 'gemini' | 'openai' | 'openrouter')}
            className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="gemini">Géminis</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        {/* Gemini key (shown when gemini selected) */}
        {aiProvider === 'gemini' && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <label className="block text-sm font-semibold text-gray-700">Clave API de Géminis</label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                Cuenta Géminis ↗
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-2">Puedes obtener tus claves API en tu Cuenta Géminis.</p>
            <input
              type="password"
              autoComplete="new-password"
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              placeholder={
                appSettings.some(s => s.key === 'gemini_api_key' && s.value)
                  ? '••••••••••••••• (configurada)'
                  : 'Pegar clave API de Gemini...'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {appSettings.some(s => s.key === 'gemini_api_key' && s.value)
                ? 'Ya hay una key guardada. Pegá aquí para reemplazarla, o dejá en blanco para mantenerla.'
                : 'Dejá en blanco para mantener la key existente.'}
            </p>
          </div>
        )}

        {/* OpenAI key (shown when openai selected) */}
        {aiProvider === 'openai' && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <label className="block text-sm font-semibold text-gray-700">Clave API de OpenAI</label>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                Cuenta OpenAI ↗
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-2">Puedes obtener tus claves API en tu Cuenta OpenAI.</p>
            <input
              type="password"
              autoComplete="new-password"
              value={openaiKey}
              onChange={e => setOpenaiKey(e.target.value)}
              placeholder={
                appSettings.some(s => s.key === 'openai_api_key' && s.value)
                  ? '••••••••••••••• (configurada)'
                  : 'Pegar clave API de OpenAI...'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {appSettings.some(s => s.key === 'openai_api_key' && s.value)
                ? 'Ya hay una key guardada. Pegá aquí para reemplazarla, o dejá en blanco para mantenerla.'
                : 'Dejá en blanco para mantener la key existente.'}
            </p>
          </div>
        )}

        {/* OpenRouter key (shown when openrouter selected) */}
        {aiProvider === 'openrouter' && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <label className="block text-sm font-semibold text-gray-700">Clave API de OpenRouter</label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                Cuenta OpenRouter ↗
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-2">Puedes obtener tus claves API en OpenRouter.</p>
            <div className="mb-2 rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800">
              <p className="font-semibold">Para usarlo ya:</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Ir a API Keys y seleccionar OpenRouter.</li>
                <li>Cargar openrouter_api_key.</li>
                <li>Elegir modelo (recomendado: deepseek/deepseek-chat).</li>
                <li>Probar conexión desde el panel.</li>
              </ol>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              value={openrouterKey}
              onChange={e => setOpenrouterKey(e.target.value)}
              placeholder={
                appSettings.some(s => s.key === 'openrouter_api_key' && s.value)
                  ? '••••••••••••••• (configurada)'
                  : 'Pegar clave API de OpenRouter...'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {appSettings.some(s => s.key === 'openrouter_api_key' && s.value)
                ? 'Ya hay una key guardada. Pegá aquí para reemplazarla, o dejá en blanco para mantenerla.'
                : 'Dejá en blanco para mantener la key existente.'}
            </p>
          </div>
        )}

        {/* Modelo */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-0.5">Modelo</label>
          <p className="text-xs text-gray-400 mb-2">
            Los modelos más avanzados ofrecen una mayor calidad de salida, pero pueden costar más por generación.
          </p>
          {aiProvider === 'gemini' ? (
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (recomendado)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash (preview)</option>
            </select>
          ) : aiProvider === 'openai' ? (
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          ) : (
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="deepseek/deepseek-chat">DeepSeek Chat (barato)</option>
              <option value="qwen/qwen3-14b">Qwen 3 14B</option>
              <option value="meta-llama/llama-3.1-8b-instruct">Llama 3.1 8B Instruct</option>
            </select>
          )}
        </div>

        {/* AI status indicators */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appSettings.some(s => s.key === 'gemini_api_key' && s.value) ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              Gemini: {appSettings.some(s => s.key === 'gemini_api_key' && s.value) ? 'configurada' : 'no configurada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appSettings.some(s => s.key === 'openai_api_key' && s.value) ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              OpenAI: {appSettings.some(s => s.key === 'openai_api_key' && s.value) ? 'configurada' : 'no configurada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appSettings.some(s => s.key === 'openrouter_api_key' && s.value) ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              OpenRouter: {appSettings.some(s => s.key === 'openrouter_api_key' && s.value) ? 'configurada' : 'no configurada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs text-gray-500">
              Motor activo: {aiProvider === 'gemini' ? 'Géminis' : aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'} · {aiModel}
            </span>
          </div>
        </div>

        {/* Test result banner */}
        {testResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            testResult.ok
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {testResult.msg}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={handleTest}
          disabled={testing || saving}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {testing ? (
            <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Probando...</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Probar conexión {aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'}
            </>
          )}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#F5C518] text-[#1d2327] text-sm font-semibold rounded-lg hover:bg-[#E6A800] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar API Keys'}
        </button>
      </div>
    </div>
  );
}
