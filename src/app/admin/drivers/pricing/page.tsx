'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface PackageMultiplier {
  id: string;
  package_type: string;
  label: string;
  emoji: string;
  multiplier: number;
  description: string;
}

interface VehiclePricing {
  id: string;
  vehicle_type: string;
  label: string;
  emoji: string;
  base_price: number | null;
  price_per_km: number | null;
}

interface PricingSetting {
  id: string;
  key: string;
  value: number;
  label: string;
  description: string;
}

export default function PricingConfigPage() {
  const [multipliers, setMultipliers] = useState<PackageMultiplier[]>([]);
  const [vehicles, setVehicles] = useState<VehiclePricing[]>([]);
  const [settings, setSettings] = useState<PricingSetting[]>([]);
  const [appSettings, setAppSettings] = useState<Array<{ id: string; key: string; value: string; label?: string; description?: string }>>([]);
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
      setMultipliers(data.package_multipliers || []);
      // Remove legacy heavy truck types from the admin UI (Camión 3000 / 5000)
      const filteredVehicles = (data.vehicle_pricing || []).filter((v: any) => {
        const t = (v.vehicle_type || '').toLowerCase();
        return t !== 'camion_3000' && t !== 'camion_5000';
      });
      // if backend has no vehicle rows yet, initialize sensible defaults so admin can set base and per-km
      const defaultVehicles = [
        { id: 'default-moto', vehicle_type: 'moto', label: 'Moto', emoji: '🏍️', base_price: null, price_per_km: null },
        { id: 'default-auto', vehicle_type: 'auto', label: 'Auto', emoji: '🚗', base_price: null, price_per_km: null },
        { id: 'default-motocarro', vehicle_type: 'motocarro', label: 'Moto carro', emoji: '🛵', base_price: null, price_per_km: null },
        { id: 'default-camion2t', vehicle_type: 'camion2t', label: 'Camión 2T', emoji: '🚛', base_price: null, price_per_km: null },
      ];
      setVehicles(filteredVehicles.length > 0 ? filteredVehicles : defaultVehicles);
      setSettings(data.pricing_settings || []);
      setAppSettings(data.app_settings || []);
      // ensure global pricing settings exist in local state for UI
      const getSettingValue = (key: string) => {
        const s = (data.pricing_settings || []).find((p: any) => p.key === key)
        return s ? Number(s.value) : null
      }
      const gb = getSettingValue('global_base_price')
      const gp = getSettingValue('global_price_per_km')
      const mp = getSettingValue('min_shipping_price')
      setGlobalBase(gb)
      setGlobalPerKm(gp)
      setMinShipping(mp)

      // ensure appSettings mapbox/google keys local state
      const getApp = (k: string) => {
        const a = (data.app_settings || []).find((x: any) => x.key === k)
        return a ? String(a.value || '') : ''
      }
      setMapboxKey(getApp('mapbox_api_key'))
      setGoogleKey(getApp('google_maps_api_key'))
    } catch (err) {
      console.error('fetchData error:', err);
      setError(String(err));
      // Even on error, show default vehicles so admin can still see the UI
      setVehicles([
        { id: 'default-moto', vehicle_type: 'moto', label: 'Moto', emoji: '🏍️', base_price: null, price_per_km: null },
        { id: 'default-auto', vehicle_type: 'auto', label: 'Auto', emoji: '🚗', base_price: null, price_per_km: null },
        { id: 'default-motocarro', vehicle_type: 'motocarro', label: 'Moto carro', emoji: '🛵', base_price: null, price_per_km: null },
        { id: 'default-camion2t', vehicle_type: 'camion2t', label: 'Camión 2T', emoji: '🚛', base_price: null, price_per_km: null },
      ]);
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
      // ensure pricing_settings contains our global keys
      const mergedSettings = [...settings];
      const setOrPush = (key: string, value: any) => {
        const idx = mergedSettings.findIndex(s => s.key === key)
        if (idx >= 0) mergedSettings[idx] = { ...mergedSettings[idx], value }
        else mergedSettings.push({ id: key, key, value, label: key, description: '' })
      }
      setOrPush('global_base_price', globalBase ?? null)
      setOrPush('global_price_per_km', globalPerKm ?? null)
      setOrPush('min_shipping_price', minShipping ?? null)

      // ensure app_settings contains api keys
      const mergedApp = [...appSettings]
      const setApp = (key: string, value: string) => {
        const idx = mergedApp.findIndex(s => s.key === key)
        if (idx >= 0) mergedApp[idx] = { ...mergedApp[idx], value }
        else mergedApp.push({ id: key, key, value, label: key, description: '' })
      }
      setApp('mapbox_api_key', mapboxKey)
      setApp('google_maps_api_key', googleKey)

      const { data: { session: saveSession } } = await supabase.auth.getSession();
      const saveToken = saveSession?.access_token || '';
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({
          package_multipliers: multipliers,
          vehicle_pricing: vehicles,
          pricing_settings: mergedSettings,
          app_settings: mergedApp,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.errors?.join(', ') || data.error || 'Error al guardar');
      } else {
        setSuccess('Configuración guardada correctamente');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateMultiplier = (id: string, value: string) => {
    setMultipliers(prev => prev.map(m => m.id === id ? { ...m, multiplier: parseFloat(value) || 0 } : m));
  };

  const updateVehicle = (id: string, field: 'base_price' | 'price_per_km', value: string) => {
    setVehicles(prev => prev.map(v =>
      v.id === id ? { ...v, [field]: value === '' ? null : parseFloat(value) || 0 } : v
    ));
  };

  const updateSetting = (id: string, value: string) => {
    setSettings(prev => prev.map(s => s.id === id ? { ...s, value: parseFloat(value) || 0 } : s));
  };

  const updateAppSetting = (id: string, value: string) => {
    setAppSettings(prev => prev.map(s => s.id === id ? { ...s, value: String(value) } : s));
  };

  // local state for keys and global prices (shown even if not present in settings)
  const [globalBase, setGlobalBase] = useState<number | null>(null)
  const [globalPerKm, setGlobalPerKm] = useState<number | null>(null)
  const [minShipping, setMinShipping] = useState<number | null>(null)
  const [mapboxKey, setMapboxKey] = useState<string>('')
  const [googleKey, setGoogleKey] = useState<string>('')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Configuración de Precios</h1>
        <p className="text-gray-500 text-sm mt-1">
          Multiplicadores por tipo de paquete y precios por tipo de vehículo
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

      {/* Pricing Settings (min price) */}
      {settings.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Mapas y APIs</h3>
          {/* Map provider select */}
          {(() => {
            const provider = settings.find(s => s.key === 'map_provider');
            if (provider) {
              return (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor de Mapas</label>
                  <select
                    value={String(provider.value)}
                    onChange={e => updateSetting(provider.id, e.target.value)}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="0">OpenStreetMap (OSM)</option>
                    <option value="1">Mapbox</option>
                    <option value="2">Google Maps</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Elige qué proveedor usar para mapas y autocompletado.</p>
                </div>
              );
            }
            return null;
          })()}


          {/* Map API keys inputs (always shown) */}
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Mapbox API Key</label>
            <input type="text" value={mapboxKey} onChange={e => setMapboxKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API Key</label>
            <input type="text" value={googleKey} onChange={e => setGoogleKey(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {/* Generic settings list */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Precio Base Global</label>
              <input type="number" min="0" step="0.01" value={globalBase ?? ''} onChange={e => setGlobalBase(e.target.value === '' ? null : Number(e.target.value))} className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <p className="text-xs text-gray-400">Precio base por defecto</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Precio por KM Global</label>
              <input type="number" min="0" step="0.01" value={globalPerKm ?? ''} onChange={e => setGlobalPerKm(e.target.value === '' ? null : Number(e.target.value))} className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <p className="text-xs text-gray-400">Precio por kilómetro por defecto</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Precio Mínimo</label>
              <input type="number" min="0" step="0.01" value={minShipping ?? ''} onChange={e => setMinShipping(e.target.value === '' ? null : Number(e.target.value))} className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <p className="text-xs text-gray-400">Precio mínimo permitido</p>
            </div>
          </div>
        </div>
      )}

      {/* ...se elimina sección de multiplicadores por tipo de paquete... */}

      {/* Vehicle Pricing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">🚗 Precios por Tipo de Vehículo</h2>
        <p className="text-xs text-gray-400 mb-5">
          Configura precios base y precio por kilómetro para cada tipo de vehículo. Si vacío, se usa el precio global.
        </p>
        <div className="space-y-6">
          {vehicles.map(v => (
            <div key={v.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{v.emoji}</span>
                <span className="font-semibold text-gray-700">{v.label}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Configura precios, comisiones y límites para este tipo de vehículo.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Precio Base</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.base_price ?? ''}
                    placeholder="Usa el global"
                    onChange={e => updateVehicle(v.id, 'base_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-300"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Precio base del envío para {v.emoji} {v.label}. Si vacío, usa el global.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Precio por KM</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.price_per_km ?? ''}
                    placeholder="Usa el global"
                    onChange={e => updateVehicle(v.id, 'price_per_km', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-300"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Precio por kilómetro para {v.emoji} {v.label}. Si vacío, usa el global.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}
