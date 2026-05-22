'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface MetodoPago {
  id: string;
  name: string;
  key: string;
  description: string;
  is_active: boolean;
  fee_fixed: number;
  fee_percentage: number;
  icon: string;
}

const DEFAULT_METHODS: MetodoPago[] = [
  {
    id: 'transfer',
    name: 'Transferencia Bancaria',
    key: 'transfer',
    description: 'Pago mediante transferencia bancaria o billetera digital (Tigo Money, Personal Pay, etc.)',
    is_active: true,
    fee_fixed: 0,
    fee_percentage: 0,
    icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  },
  {
    id: 'cash_on_delivery',
    name: 'Contra Entrega',
    key: 'cash_on_delivery',
    description: 'El cliente paga en efectivo al recibir el producto o servicio.',
    is_active: true,
    fee_fixed: 0,
    fee_percentage: 0,
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
];

export default function MetodosPagoPage() {
  const [methods, setMethods] = useState<MetodoPago[]>(DEFAULT_METHODS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('payment_methods_config').select('*');
      if (data && data.length > 0) {
        setMethods(data as MetodoPago[]);
      } else {
        setMethods(DEFAULT_METHODS);
      }
      setLoading(false);
    })();
  }, []);

  const toggleMethod = async (method: MetodoPago) => {
    setSaving(method.id);
    const updated = methods.map(m => m.id === method.id ? { ...m, is_active: !m.is_active } : m);
    setMethods(updated);
    await supabase.from('payment_methods_config').upsert({ ...method, is_active: !method.is_active });
    setSaving(null);
  };

  const updateFee = (id: string, field: 'fee_fixed' | 'fee_percentage', value: number) => {
    setMethods(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const saveFee = async (method: MetodoPago) => {
    setSaving(method.id);
    await supabase.from('payment_methods_config').upsert(method);
    setSaving(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Metodos de Pago</h1>
        <p className="text-gray-500 text-sm mt-0.5">Activar, desactivar y configurar comisiones por metodo de pago.</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : (
        <div className="space-y-4">
          {methods.map(method => (
            <div key={method.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-opacity ${method.is_active ? 'border-gray-200' : 'border-gray-100 opacity-70'}`}>
              {/* Header row */}
              <div className="flex items-center gap-4 p-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  method.is_active ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <svg className={`w-5 h-5 ${method.is_active ? 'text-blue-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method.icon} />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{method.name}</h3>
                    {method.is_active ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">Activo</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">Inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{method.description}</p>
                </div>
                <button
                  onClick={() => toggleMethod(method)}
                  disabled={saving === method.id}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    method.is_active ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    method.is_active ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Fee config */}
              {method.is_active && (
                <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Configuracion de cargos adicionales</div>
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Cargo fijo</label>
                      <input
                        type="number"
                        value={method.fee_fixed}
                        min={0}
                        step={1000}
                        onChange={e => updateFee(method.id, 'fee_fixed', parseFloat(e.target.value) || 0)}
                        onBlur={() => saveFee(method)}
                        className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                      <span className="text-xs text-gray-400">Gs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Cargo %</label>
                      <input
                        type="number"
                        value={method.fee_percentage}
                        min={0}
                        step={0.5}
                        max={100}
                        onChange={e => updateFee(method.id, 'fee_percentage', parseFloat(e.target.value) || 0)}
                        onBlur={() => saveFee(method)}
                        className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    {saving === method.id && <span className="text-xs text-gray-400">Guardando...</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-800">Metodos disponibles</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Transferencia incluye Tigo Money, Personal Pay, billeteras y transferencias bancarias.
              Contra Entrega permite pago en efectivo al momento de la entrega o prestacion del servicio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
