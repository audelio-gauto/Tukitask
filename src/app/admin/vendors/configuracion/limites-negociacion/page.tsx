'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Limite {
  id: string;
  name: string;
  key: string;
  description: string;
  value: number;
  effective_value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  is_active: boolean;
}

export default function LimitesNegociacionPage() {
  const [limites, setLimites] = useState<Limite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/negotiation-limits', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'No se pudieron cargar los límites.');
        if (active) setLimites((json.limits ?? []) as Limite[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar los límites.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const updateValue = (id: string, value: number) => {
    setLimites(prev => prev.map(l => l.id === id ? { ...l, value } : l));
  };

  const saveLimit = async (limite: Limite) => {
    setSaving(limite.id);
    setSaved(null);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/negotiation-limits', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ id: limite.id, value: limite.value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar el límite.');
      setSaved(limite.id);
      setTimeout(() => setSaved(current => current === limite.id ? null : current), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el límite.');
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (limite: Limite) => {
    setSaving(limite.id);
    setSaved(null);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/negotiation-limits', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ id: limite.id, is_active: !limite.is_active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo cambiar el estado del límite.');
      setLimites(prev => prev.map(l => l.id === limite.id ? json.limit as Limite : l));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado del límite.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Limites de Negociacion</h1>
        <p className="text-gray-500 text-sm mt-0.5">Reglas automaticas que controlan las negociaciones entre vendedores y clientes.</p>
      </div>

      <p className="mb-4 text-xs text-gray-500">Al desactivar un límite, Tukibot usa el valor predeterminado de esa regla.</p>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {limites.map(limite => (
            <div key={limite.id} className={`bg-white rounded-xl border shadow-sm p-4 transition-opacity ${limite.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start gap-4">
                {/* Left: name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{limite.name}</h3>
                    {!limite.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Predeterminado</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{limite.description}</p>
                </div>

                {/* Right: value + unit + toggle */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      aria-label={limite.name}
                      value={limite.is_active ? limite.value : limite.effective_value}
                      min={limite.min}
                      max={limite.max}
                      step={limite.step}
                      disabled={!limite.is_active}
                      onChange={e => updateValue(limite.id, parseFloat(e.target.value) || 0)}
                      onBlur={() => saveLimit(limite)}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">{limite.unit}</span>
                  </div>

                  {/* Save indicator */}
                  <div className="w-16 text-right">
                    {saving === limite.id && <span className="text-xs text-gray-400">Guardando</span>}
                    {saved === limite.id && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
                  </div>

                  {/* Toggle active */}
                  <button
                    type="button"
                    aria-label={`${limite.is_active ? 'Desactivar' : 'Activar'} ${limite.name}`}
                    aria-pressed={limite.is_active}
                    onClick={() => toggleActive(limite)}
                    disabled={saving === limite.id}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      limite.is_active ? 'bg-emerald-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      limite.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Range slider */}
              {limite.is_active && (
                <div className="mt-3">
                  <input
                    type="range"
                    min={limite.min}
                    max={limite.max}
                    step={limite.step}
                    value={limite.is_active ? limite.value : limite.effective_value}
                    onChange={e => updateValue(limite.id, parseFloat(e.target.value))}
                    onMouseUp={() => saveLimit(limite)}
                    onTouchEnd={() => saveLimit(limite)}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>{limite.min} {limite.unit}</span>
                    <span>{limite.max} {limite.unit}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
