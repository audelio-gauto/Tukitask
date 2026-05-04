'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon, type IconName } from '@/components/Icon';

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
  commission_pct: number | null;
  commission_fixed: number | null;
  image_url?: string | null;
}

interface PricingSetting {
  id: string;
  key: string;
  value: number;
  label: string;
  description: string;
}

const vehicleIconName = (type: string): IconName => {
  switch ((type || '').toLowerCase()) {
    case 'camion2t':
    case 'camion_3000':
    case 'camion_5000':
      return 'truck';
    case 'moto':
    case 'motocarro':
    case 'moto_carro':
      return 'car';
    default:
      return 'car';
  }
};

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
        { id: 'default-moto', vehicle_type: 'moto', label: 'Moto Envíos', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-auto', vehicle_type: 'auto', label: 'Auto Envíos', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-motocarro', vehicle_type: 'motocarro', label: 'Moto Carro Fletes', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-camion2t', vehicle_type: 'camion2t', label: 'Camión Fletes', emoji: 'truck', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
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
        { id: 'default-moto', vehicle_type: 'moto', label: 'Moto Envíos', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-auto', vehicle_type: 'auto', label: 'Auto Envíos', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-motocarro', vehicle_type: 'motocarro', label: 'Moto Carro Fletes', emoji: 'car', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
        { id: 'default-camion2t', vehicle_type: 'camion2t', label: 'Camión Fletes', emoji: 'truck', base_price: null, price_per_km: null, commission_pct: 10, commission_fixed: 0 },
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
      // If key field is blank, remove it from the payload so the existing DB value is preserved
      if (!mapboxKey) {
        const idx = mergedApp.findIndex(s => s.key === 'mapbox_api_key')
        if (idx >= 0) mergedApp.splice(idx, 1)
      }
      if (!googleKey) {
        const idx = mergedApp.findIndex(s => s.key === 'google_maps_api_key')
        if (idx >= 0) mergedApp.splice(idx, 1)
      }

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
        // Reload from DB to confirm the keys were actually persisted
        await fetchData();
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

  const updateVehicle = (id: string, field: 'base_price' | 'price_per_km' | 'commission_pct' | 'commission_fixed', value: string) => {
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
  const [uploadingVehicle, setUploadingVehicle] = useState<string | null>(null)

  const handleVehicleImageUpload = async (vehicleType: string, file: File) => {
    setUploadingVehicle(vehicleType)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const token = s?.access_token || ''
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        const res = await fetch('/api/admin/upload-vehicle-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ base64, mimeType: file.type, vehicleType }),
        })
        const data = await res.json()
        if (res.ok && data.url) {
          setVehicles(prev => prev.map(v =>
            v.vehicle_type === vehicleType ? { ...v, image_url: data.url } : v
          ))
          setSuccess('Imagen del vehículo guardada')
          setTimeout(() => setSuccess(''), 3000)
        } else {
          setError(data.error || 'Error al subir imagen')
        }
        setUploadingVehicle(null)
      }
      reader.readAsDataURL(file)
    } catch {
      setError('Error al subir imagen')
      setUploadingVehicle(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5C518]" />
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
                    <option value="1">Mapbox</option>
                    <option value="2">Google Maps</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Elige qué proveedor usar para mapas y autocompletado.</p>
                </div>
              );
            }
            return null;
          })()}


          {/* Map API keys inputs - password type to avoid key exposure in devtools/screenshots */}
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Mapbox API Key</label>
            <input
              type="password"
              autoComplete="new-password"
              value={mapboxKey}
              onChange={e => setMapboxKey(e.target.value)}
              placeholder={appSettings.some((s: any) => s.key === 'mapbox_api_key' && s.value) ? '••••••••••••••• (configurada)' : 'Pegar nueva key...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Dejá en blanco para mantener la key existente</p>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API Key</label>
            <input
              type="password"
              autoComplete="new-password"
              value={googleKey}
              onChange={e => setGoogleKey(e.target.value)}
              placeholder={appSettings.some((s: any) => s.key === 'google_maps_api_key' && s.value) ? '••••••••••••••• (configurada)' : 'Pegar nueva key...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Dejá en blanco para mantener la key existente</p>
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

      {/* ...se elimina sección de multiplicadores por tipo de paquete... */}

      {/* Vehicle Pricing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Precios por Tipo de Vehículo</h2>
        <p className="text-xs text-gray-400 mb-5">
          Configura precios base y precio por kilómetro para cada tipo de vehículo. Si vacío, se usa el precio global.
        </p>
        <div className="space-y-6">
          {vehicles.map(v => (
            <div key={v.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                {/* Vehicle image preview + upload */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 bg-white flex items-center justify-center"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
                  >
                    {v.image_url ? (
                      <img
                        src={v.image_url}
                        alt={v.label}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon name={vehicleIconName(v.vehicle_type)} size={24} className="text-gray-400" />
                    )}
                  </div>
                  <label
                    htmlFor={`vehicle-img-${v.vehicle_type}`}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#F5C518] border-2 border-white flex items-center justify-center cursor-pointer hover:bg-[#E6A800] transition-colors"
                    title="Cambiar imagen"
                  >
                    {uploadingVehicle === v.vehicle_type ? (
                      <div className="w-3 h-3 border border-[#1C1C2E] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1C2E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    )}
                  </label>
                  <input
                    id={`vehicle-img-${v.vehicle_type}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleVehicleImageUpload(v.vehicle_type, file)
                      e.target.value = ''
                    }}
                  />
                </div>
                <div>
                  <span className="font-semibold text-gray-700">{v.label}</span>
                  <p className="text-[11px] text-gray-400 mt-0.5">300 × 300 px · JPG / PNG / WebP · máx 2 MB</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Configura precios, comisiones y límites para este tipo de vehículo.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Precio Base</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.base_price ?? ''}
                    placeholder="Usa el global"
                    onChange={e => updateVehicle(v.id, 'base_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-300"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Precio base del envío. Si vacío, usa el global.</p>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-300"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Precio por kilómetro. Si vacío, usa el global.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="money" size={14} />
                      Comisión %
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={v.commission_pct ?? 10}
                      onChange={e => updateVehicle(v.id, 'commission_pct', e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-orange-200 bg-orange-50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">% del monto del envío. Se descuenta de la billetera.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="money" size={14} />
                      Comisión Fija
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={v.commission_fixed ?? 0}
                      onChange={e => updateVehicle(v.id, 'commission_fixed', e.target.value)}
                      className="w-full px-3 py-2 border border-orange-200 bg-orange-50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Monto fijo (Gs) adicional al %. Se acumula.</p>
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
          className="px-6 py-2.5 bg-[#F5C518] text-[#1C1C2E] rounded-lg font-medium text-sm hover:bg-[#E6A800] 
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}
