'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface CommissionRule {
  id: string;
  name: string;
  type: 'fixed' | 'percentage';
  value: number;
  applies_to: string;
  is_active: boolean;
}

const APPLIES_LABELS: Record<string, string> = {
  vendor: 'Vendedores',
  driver: 'Conductores',
  service: 'Servicios',
  all: 'Todos',
};

export default function ConfigComisionesPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const defaultRules: CommissionRule[] = [
    { id: 'default-1', name: 'Comision fija por venta', type: 'fixed', value: 5000, applies_to: 'vendor', is_active: true },
    { id: 'default-2', name: 'Comision porcentual vendedor', type: 'percentage', value: 10, applies_to: 'vendor', is_active: true },
    { id: 'default-3', name: 'Comision conductor por entrega', type: 'percentage', value: 15, applies_to: 'driver', is_active: true },
    { id: 'default-4', name: 'Comision tecnico por servicio', type: 'percentage', value: 12, applies_to: 'service', is_active: false },
  ];

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('commission_rules').select('*').order('created_at');
      if (data && data.length > 0) {
        setRules(data as CommissionRule[]);
      } else {
        setRules(defaultRules);
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleActive = async (rule: CommissionRule) => {
    setSaving(rule.id);
    const updated = rules.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r);
    setRules(updated);
    await supabase.from('commission_rules').upsert({ ...rule, is_active: !rule.is_active });
    setSaving(null);
  };

  const updateValue = async (rule: CommissionRule, value: number) => {
    const updated = rules.map(r => r.id === rule.id ? { ...r, value } : r);
    setRules(updated);
  };

  const saveValue = async (rule: CommissionRule) => {
    setSaving(rule.id);
    await supabase.from('commission_rules').upsert(rule);
    setSaving(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Porcentajes de Comision</h1>
        <p className="text-gray-500 text-sm mt-0.5">Configuracion de comisiones fijas y porcentuales por categoria.</p>
      </div>

      {/* Type legend */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-xs font-medium text-purple-700">Monto Fijo (Gs)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs font-medium text-blue-700">Porcentaje (%)</span>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-white rounded-xl border shadow-sm p-4 transition-opacity ${rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center gap-4">
                {/* Type badge */}
                <span className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  rule.type === 'fixed' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {rule.type === 'fixed' ? 'FIJO' : '%'}
                </span>

                {/* Name + scope */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{rule.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Aplica a: <span className="font-medium text-gray-600">{APPLIES_LABELS[rule.applies_to] ?? rule.applies_to}</span>
                  </div>
                </div>

                {/* Value input */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={rule.value}
                    min={0}
                    step={rule.type === 'fixed' ? 1000 : 0.5}
                    onChange={e => updateValue(rule, parseFloat(e.target.value) || 0)}
                    onBlur={() => saveValue(rule)}
                    className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <span className="text-xs text-gray-500 w-6">{rule.type === 'fixed' ? 'Gs' : '%'}</span>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleActive(rule)}
                  disabled={saving === rule.id}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    rule.is_active ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    rule.is_active ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>

                {saving === rule.id && (
                  <span className="text-xs text-gray-400">Guardando...</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
