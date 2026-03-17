'use client';

import { useEffect, useState, useCallback } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/pricing');
      if (!res.ok) throw new Error('Error al cargar configuración');
      const data = await res.json();
      setMultipliers(data.package_multipliers || []);
      setVehicles(data.vehicle_pricing || []);
      setSettings(data.pricing_settings || []);
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
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_multipliers: multipliers,
          vehicle_pricing: vehicles,
          pricing_settings: settings,
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
          {settings.map(s => (
            <div key={s.id}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{s.label}</label>
              <p className="text-xs text-gray-400 mb-2">{s.description}</p>
              <input
                type="number"
                min="0"
                step="0.01"
                value={s.value}
                onChange={e => updateSetting(s.id, e.target.value)}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Package Multipliers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">📦 Multiplicadores por Tipo de Paquete</h2>
        <p className="text-xs text-gray-400 mb-5">
          Configura el multiplicador de precio para cada tipo de paquete. El precio base se multiplica por este valor.
          Ej: 1.0 = sin cambio, 1.5 = +50%, 2.0 = doble.
        </p>
        <div className="space-y-4">
          {multipliers.map(m => (
            <div key={m.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{m.emoji}</span>
                  <span className="font-medium text-gray-700">{m.label}</span>
                </div>
                <p className="text-xs text-gray-400">{m.description}</p>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={m.multiplier}
                onChange={e => updateMultiplier(m.id, e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      </div>

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
