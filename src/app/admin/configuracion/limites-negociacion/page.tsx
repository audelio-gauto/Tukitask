'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Limite {
  id: string;
  name: string;
  key: string;
  description: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  is_active: boolean;
}

const DEFAULT_LIMITES: Limite[] = [
  {
    id: 'max_discount_pct',
    name: 'Descuento maximo',
    key: 'max_discount_pct',
    description: 'Porcentaje maximo que un vendedor puede ofrecer de descuento en una negociacion.',
    value: 30,
    unit: '%',
    min: 1,
    max: 90,
    step: 1,
    is_active: true,
  },
  {
    id: 'max_offers_per_day',
    name: 'Ofertas maximas por dia',
    key: 'max_offers_per_day',
    description: 'Cantidad maxima de ofertas que un vendedor puede enviar por dia.',
    value: 10,
    unit: 'ofertas/dia',
    min: 1,
    max: 100,
    step: 1,
    is_active: true,
  },
  {
    id: 'min_offer_time_minutes',
    name: 'Tiempo minimo entre ofertas',
    key: 'min_offer_time_minutes',
    description: 'Minutos minimos que deben pasar entre dos ofertas del mismo vendedor al mismo cliente.',
    value: 5,
    unit: 'minutos',
    min: 1,
    max: 60,
    step: 1,
    is_active: true,
  },
  {
    id: 'min_price_gs',
    name: 'Precio minimo de venta',
    key: 'min_price_gs',
    description: 'Precio minimo en guaranies que puede tener un producto publicado.',
    value: 1000,
    unit: 'Gs',
    min: 100,
    max: 100000,
    step: 100,
    is_active: true,
  },
  {
    id: 'max_negotiation_rounds',
    name: 'Rondas maximas de negociacion',
    key: 'max_negotiation_rounds',
    description: 'Numero maximo de contra-ofertas permitidas en una misma negociacion.',
    value: 5,
    unit: 'rondas',
    min: 1,
    max: 20,
    step: 1,
    is_active: true,
  },
  {
    id: 'offer_expiry_hours',
    name: 'Expiracion de oferta',
    key: 'offer_expiry_hours',
    description: 'Horas que tiene validez una oferta antes de expirar automaticamente.',
    value: 24,
    unit: 'horas',
    min: 1,
    max: 72,
    step: 1,
    is_active: true,
  },
];

export default function LimitesNegociacionPage() {
  const [limites, setLimites] = useState<Limite[]>(DEFAULT_LIMITES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('negotiation_limits').select('*');
      if (data && data.length > 0) {
        setLimites(data as Limite[]);
      } else {
        setLimites(DEFAULT_LIMITES);
      }
      setLoading(false);
    })();
  }, []);

  const updateValue = (id: string, value: number) => {
    setLimites(prev => prev.map(l => l.id === id ? { ...l, value } : l));
  };

  const saveLimit = async (limite: Limite) => {
    setSaving(limite.id);
    await supabase.from('negotiation_limits').upsert(limite);
    setSaving(null);
    setSaved(limite.id);
    setTimeout(() => setSaved(null), 2000);
  };

  const toggleActive = async (limite: Limite) => {
    setSaving(limite.id);
    const updated = limites.map(l => l.id === limite.id ? { ...l, is_active: !l.is_active } : l);
    setLimites(updated);
    await supabase.from('negotiation_limits').upsert({ ...limite, is_active: !limite.is_active });
    setSaving(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Limites de Negociacion</h1>
        <p className="text-gray-500 text-sm mt-0.5">Reglas automaticas que controlan las negociaciones entre vendedores y clientes.</p>
      </div>

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
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{limite.description}</p>
                </div>

                {/* Right: value + unit + toggle */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={limite.value}
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
                    value={limite.value}
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
