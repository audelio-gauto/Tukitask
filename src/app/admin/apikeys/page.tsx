'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type AppSetting = { id: string; key: string; value: string; label?: string; description?: string };
type PricingSetting = { id: string; key: string; value: number; label: string; description: string };

const AI_KEY_FIELDS = [
  { key: 'gemini_api_key', label: 'Géminis', url: 'https://aistudio.google.com/app/apikey' },
  { key: 'openai_api_key', label: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  { key: 'openrouter_api_key', label: 'OpenRouter', url: 'https://openrouter.ai/keys' },
] as const;

export default function ApiKeysPage() {
  const [appSettings, setAppSettings] = useState<AppSetting[]>([]);
  const [pricingSettings, setPricingSettings] = useState<PricingSetting[]>([]);
  const [mapboxKey, setMapboxKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [aiKeys, setAiKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/pricing', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status} al cargar configuración`);
      }
      const data = await res.json();
      setAppSettings(data.app_settings || []);
      setPricingSettings(data.pricing_settings || []);
      // No precargamos secretos: el input vacío significa "conservar clave actual".
      setMapboxKey('');
      setGoogleKey('');
      setAiKeys({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const configured = (key: string) => appSettings.some(s => s.key === key && Boolean(s.value));

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

      // Las claves se reemplazan solo si el admin escribió algo nuevo.
      if (mapboxKey) setApp('mapbox_api_key', mapboxKey);
      if (googleKey) setApp('google_maps_api_key', googleKey);
      for (const field of AI_KEY_FIELDS) {
        if (aiKeys[field.key]) setApp(field.key, aiKeys[field.key]);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          package_multipliers: [],
          vehicle_pricing: [],
          pricing_settings: pricingSettings.filter(s => s.key === 'map_provider'),
          app_settings: mergedApp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.errors?.join(', ') || data.error || 'Error al guardar');
        return;
      }
      setSuccess('Claves guardadas correctamente');
      setTimeout(() => setSuccess(''), 3000);
      setMapboxKey('');
      setGoogleKey('');
      setAiKeys({});
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        <h1 className="text-2xl font-bold text-gray-800">Claves API</h1>
        <p className="text-gray-500 text-sm mt-1">
          Claves de mapas e IA. El proveedor y modelo de IA se configuran en{' '}
          <Link href="/admin/control-ai" className="text-blue-600 hover:underline">Control AI</Link>.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Mapas</h3>
        <p className="text-xs text-gray-400 mb-5">
          Elegí el proveedor activo y pegá la clave. Dejá en blanco para conservar la key existente.
        </p>

        {mapProvider && (
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor de Mapas</label>
            <select
              value={String(mapProvider.value)}
              onChange={e => {
                setPricingSettings(prev =>
                  prev.map(s => s.key === 'map_provider' ? { ...s, value: Number(e.target.value) } : s),
                );
              }}
              className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="1">Mapbox</option>
              <option value="2">Google Maps</option>
            </select>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Mapbox API Key</label>
          <input
            type="password"
            autoComplete="new-password"
            value={mapboxKey}
            onChange={e => setMapboxKey(e.target.value)}
            placeholder={configured('mapbox_api_key') ? '••••••••••••••• (configurada)' : 'Pegar nueva key...'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API Key</label>
          <input
            type="password"
            autoComplete="new-password"
            value={googleKey}
            onChange={e => setGoogleKey(e.target.value)}
            placeholder={configured('google_maps_api_key') ? '••••••••••••••• (configurada)' : 'Pegar nueva key...'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
          {['mapbox_api_key', 'google_maps_api_key'].map(key => (
            <div className="flex items-center gap-2" key={key}>
              <span className={`w-2 h-2 rounded-full ${configured(key) ? 'bg-green-400' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">
                {key === 'mapbox_api_key' ? 'Mapbox' : 'Google Maps'}: {configured(key) ? 'configurada' : 'no configurada'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">IA</h3>
        <p className="text-xs text-gray-400 mb-5">
          Cargá las claves de los proveedores que uses. El motor activo y el modelo se eligen en Control AI.
        </p>

        {AI_KEY_FIELDS.map(field => (
          <div className="mb-4" key={field.key}>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-semibold text-gray-700">{field.label}</label>
              <a href={field.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                Obtener clave ↗
              </a>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              value={aiKeys[field.key] || ''}
              onChange={e => setAiKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={configured(field.key) ? '••••••••••••••• (configurada)' : `Pegar clave de ${field.label}...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {configured(field.key) ? 'Ya hay una clave guardada. Dejá en blanco para conservarla.' : 'Sin clave configurada.'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#F5C518] text-[#1d2327] text-sm font-semibold rounded-lg hover:bg-[#E6A800] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar claves'}
        </button>
      </div>
    </div>
  );
}
