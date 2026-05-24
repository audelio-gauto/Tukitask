'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ApiKeysPage() {
  const [appSettings, setAppSettings] = useState<Array<{ id: string; key: string; value: string; label?: string; description?: string }>>([]);
  const [pricingSettings, setPricingSettings] = useState<Array<{ id: string; key: string; value: number; label: string; description: string }>>([]);
  const [mapboxKey, setMapboxKey] = useState<string>('');
  const [googleKey, setGoogleKey] = useState<string>('');
  // AI settings
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
  const [aiModel, setAiModel] = useState<string>('gemini-2.5-flash');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      if (providerVal === 'openai' || providerVal === 'gemini') setAiProvider(providerVal);
      const modelVal = getApp('ai_model');
      if (modelVal) setAiModel(modelVal);
      // Don't pre-fill secret keys — keep inputs blank, show placeholder if configured
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      // Always persist provider + model selection
      setApp('ai_provider', aiProvider);
      setApp('ai_model', aiModel);

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
        await fetchData();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const mapProvider = pricingSettings.find(s => s.key === 'map_provider');

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
            onChange={e => setAiProvider(e.target.value as 'gemini' | 'openai')}
            className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="gemini">Géminis</option>
            <option value="openai">OpenAI</option>
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
              <option value="gemini-2.5-flash">Géminis 2.5 Flash</option>
              <option value="gemini-2.5-pro">Géminis 2.5 Pro</option>
              <option value="gemini-1.5-flash">Géminis 1.5 Flash</option>
              <option value="gemini-1.5-pro">Géminis 1.5 Pro</option>
            </select>
          ) : (
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
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
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs text-gray-500">
              Motor activo: {aiProvider === 'gemini' ? 'Géminis' : 'OpenAI'} · {aiModel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
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
