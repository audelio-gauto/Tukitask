'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface BankData {
  banco: string;
  cuenta: string;
  alias: string;
  titular: string;
  tipo_cuenta: string;
}

interface MethodConfig {
  id: string;
  key: string;
  is_active: boolean;
  vendor_allowed: boolean;
  fee_fixed: number;
  fee_percentage: number;
  bank_data?: BankData | null;
}

const EMPTY_BANK: BankData = { banco: '', cuenta: '', alias: '', titular: '', tipo_cuenta: '' };

function Toggle({ active, disabled, onToggle }: { active: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        active ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        active ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function MetodosPagoPage() {
  const [cfg, setCfg] = useState<Record<string, MethodConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState<BankData>({ ...EMPTY_BANK });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const res = await fetch('/api/admin/payment-methods', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json() as MethodConfig[];
        const map: Record<string, MethodConfig> = {};
        for (const m of data) map[m.key] = m;
        setCfg(map);
        if (map['transfer']?.bank_data) {
          setBankDraft({ ...EMPTY_BANK, ...map['transfer'].bank_data });
        }
      }
      setLoading(false);
    })();
  }, []);

  const patch = async (key: string, field: string, value: boolean | number | null | BankData) => {
    const id = cfg[key]?.id;
    if (!id) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/admin/payment-methods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, [field]: value }),
    });
  };

  const toggle = async (key: string, field: 'is_active' | 'vendor_allowed') => {
    const saveKey = `${key}.${field}`;
    setSaving(saveKey);
    const next = !cfg[key]?.[field];
    setCfg(prev => ({ ...prev, [key]: { ...prev[key], [field]: next } }));
    await patch(key, field, next);
    setSaving(null);
  };

  const saveBankData = async () => {
    setBankSaving(true);
    setBankMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBankSaving(false); return; }
    const id = cfg['transfer']?.id;
    if (!id) { setBankSaving(false); return; }
    const res = await fetch('/api/admin/payment-methods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, bank_data: bankDraft }),
    });
    setBankMsg(res.ok
      ? { ok: true, text: 'Datos bancarios guardados.' }
      : { ok: false, text: 'Error al guardar.' });
    setBankSaving(false);
    setTimeout(() => setBankMsg(null), 3000);
  };

  const transfer = cfg['transfer'];
  const cash     = cfg['cash_on_delivery'];

  // ── 3 toggles config ──────────────────────────────────────
  const TOGGLES = [
    {
      key:         'transfer_global',
      label:       'Transferencia Bancaria Global',
      badge:       transfer?.is_active ? 'Activo' : 'Inactivo',
      badgeColor:  transfer?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
      description: 'Los clientes pagan al marketplace. Se muestran los datos bancarios del marketplace en el checkout.',
      active:      !!transfer?.is_active,
      saving:      saving === 'transfer.is_active',
      onToggle:    () => toggle('transfer', 'is_active'),
      icon:        'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
      iconBg:      transfer?.is_active ? 'bg-blue-100' : 'bg-gray-100',
      iconColor:   transfer?.is_active ? 'text-blue-600' : 'text-gray-400',
    },
    {
      key:         'transfer_vendor',
      label:       'Transferencia Bancaria Vendedor',
      badge:       transfer?.vendor_allowed ? 'Habilitado' : 'Deshabilitado',
      badgeColor:  transfer?.vendor_allowed ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500',
      description: 'Los vendedores pueden cargar sus datos bancarios y recibir pagos directos en su cuenta. Aplica cuando la transferencia global está inactiva.',
      active:      !!transfer?.vendor_allowed,
      saving:      saving === 'transfer.vendor_allowed',
      onToggle:    () => toggle('transfer', 'vendor_allowed'),
      icon:        'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      iconBg:      transfer?.vendor_allowed ? 'bg-violet-100' : 'bg-gray-100',
      iconColor:   transfer?.vendor_allowed ? 'text-violet-600' : 'text-gray-400',
    },
    {
      key:         'cash',
      label:       'Contra Entrega',
      badge:       cash?.is_active ? 'Activo' : 'Inactivo',
      badgeColor:  cash?.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
      description: 'El cliente paga en efectivo al recibir el producto o servicio. Disponible para todos los vendedores.',
      active:      !!cash?.is_active,
      saving:      saving === 'cash_on_delivery.is_active',
      onToggle:    () => toggle('cash_on_delivery', 'is_active'),
      icon:        'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
      iconBg:      cash?.is_active ? 'bg-blue-100' : 'bg-gray-100',
      iconColor:   cash?.is_active ? 'text-blue-600' : 'text-gray-400',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Métodos de Pago</h1>
        <p className="text-gray-500 text-sm mt-0.5">Activar, desactivar y configurar comisiones por método de pago.</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Cargando...</div>
      ) : (
        <>
          {/* ── 3 Toggles ── */}
          <div className="space-y-3 mb-8">
            {TOGGLES.map(t => (
              <div key={t.key} className={`bg-white rounded-xl border shadow-sm flex items-center gap-4 px-4 py-4 transition-opacity ${t.active ? 'border-gray-200' : 'border-gray-100 opacity-75'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.iconBg}`}>
                  <svg className={`w-5 h-5 ${t.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${t.badgeColor}`}>{t.badge}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{t.description}</p>
                </div>
                <Toggle active={t.active} disabled={t.saving} onToggle={t.onToggle} />
              </div>
            ))}
          </div>

          {/* ── Datos bancarios del marketplace ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
              </svg>
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Datos bancarios del marketplace</span>
            </div>
            <div className="px-4 py-4">
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                Estos datos aparecen en el checkout cuando <strong>Transferencia Bancaria Global</strong> está activa.
                Si está inactiva, cada vendedor recibe el pago en su propia cuenta.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { field: 'banco',       label: 'Banco',             placeholder: 'Ej: Banco Itaú, Tigo Money' },
                  { field: 'titular',     label: 'Titular',           placeholder: 'Ej: TukiMarket S.A.' },
                  { field: 'cuenta',      label: 'Número de cuenta',  placeholder: 'Ej: 0123456789' },
                  { field: 'alias',       label: 'Alias / CBU',       placeholder: 'Ej: tukimarket.py' },
                  { field: 'tipo_cuenta', label: 'Tipo de cuenta',    placeholder: 'Ej: Cuenta corriente' },
                ] as { field: keyof BankData; label: string; placeholder: string }[]).map(({ field, label, placeholder }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type="text"
                      value={bankDraft[field]}
                      onChange={e => setBankDraft(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={saveBankData}
                  disabled={bankSaving}
                  className="px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {bankSaving ? 'Guardando...' : 'Guardar datos bancarios'}
                </button>
                {bankMsg && (
                  <span className={`text-xs font-medium ${bankMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                    {bankMsg.text}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Info box ── */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-amber-800">Lógica de funcionamiento</p>
                <ul className="text-xs text-amber-700 mt-1 space-y-1 list-disc list-inside leading-relaxed">
                  <li><strong>Global activa</strong>: todos los pagos van al marketplace. El cliente ve los datos bancarios del marketplace.</li>
                  <li><strong>Global inactiva + Vendedor habilitado</strong>: cada vendedor recibe el pago en su propia cuenta bancaria.</li>
                  <li><strong>Contra Entrega activa</strong>: los clientes pueden pagar en efectivo al recibir el pedido.</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


interface BankData {
  banco: string;
  cuenta: string;
  alias: string;
  titular: string;
  tipo_cuenta: string;
}

interface MetodoPago {
  id: string;
  name: string;
  key: string;
  description: string;
  is_active: boolean;
  vendor_allowed: boolean;
  fee_fixed: number;
  fee_percentage: number;
  icon: string;
  bank_data?: BankData | null;
}

const EMPTY_BANK: BankData = { banco: '', cuenta: '', alias: '', titular: '', tipo_cuenta: '' };

const DEFAULT_METHODS: MetodoPago[] = [
  {
    id: 'transfer',
    name: 'Transferencia Bancaria',
    key: 'transfer',
    description: 'Pago mediante transferencia bancaria o billetera digital (Tigo Money, Personal Pay, etc.)',
    is_active: true,
    vendor_allowed: true,
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
    vendor_allowed: true,
    fee_fixed: 0,
    fee_percentage: 0,
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
];

export default function MetodosPagoPage() {
  const [methods, setMethods] = useState<MetodoPago[]>(DEFAULT_METHODS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState<Record<string, BankData>>({});
  const [bankSaving, setBankSaving] = useState<string | null>(null);
  const [bankMsg, setBankMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [vendorToggleSaving, setVendorToggleSaving] = useState<string | null>(null);;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/payment-methods', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setMethods(data as MetodoPago[]);
          // Inicializar drafts de bank_data
          const drafts: Record<string, BankData> = {};
          for (const m of data as MetodoPago[]) {
            drafts[m.id] = m.bank_data ? { ...EMPTY_BANK, ...m.bank_data } : { ...EMPTY_BANK };
          }
          setBankDraft(drafts);
        } else {
          setMethods(DEFAULT_METHODS);
          setBankDraft({ transfer: { ...EMPTY_BANK }, cash_on_delivery: { ...EMPTY_BANK } });
        }
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

  const updateBankDraft = (id: string, field: keyof BankData, value: string) => {
    setBankDraft(prev => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_BANK), [field]: value } }));
  };

  const saveBankData = async (methodId: string) => {
    setBankSaving(methodId);
    setBankMsg(prev => ({ ...prev, [methodId]: { ok: false, text: '' } }));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/payment-methods', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: methodId, bank_data: bankDraft[methodId] ?? null }),
    });
    setBankMsg(prev => ({
      ...prev,
      [methodId]: res.ok
        ? { ok: true, text: 'Datos guardados correctamente.' }
        : { ok: false, text: 'Error al guardar.' },
    }));
    setBankSaving(null);
    setTimeout(() => setBankMsg(prev => ({ ...prev, [methodId]: { ok: false, text: '' } })), 3000);
  };

  const toggleVendorAllowed = async (method: MetodoPago) => {
    setVendorToggleSaving(method.id);
    const next = !method.vendor_allowed;
    setMethods(prev => prev.map(m => m.id === method.id ? { ...m, vendor_allowed: next } : m));
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await fetch('/api/admin/payment-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: method.id, vendor_allowed: next }),
      });
    }
    setVendorToggleSaving(null);
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

                  {/* Datos bancarios — solo para Transferencia */}
                  {method.key === 'transfer' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Datos bancarios del marketplace
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        Cuando Transferencia Bancaria está activa, el cliente verá estos datos para realizar el pago al marketplace.
                        Si está inactiva, cada vendedor recibe el pago en su propia cuenta.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          { field: 'banco',       label: 'Banco',          placeholder: 'Ej: Banco Itaú, Tigo Money' },
                          { field: 'titular',     label: 'Titular',        placeholder: 'Ej: TukiMarket S.A.' },
                          { field: 'cuenta',      label: 'Número de cuenta', placeholder: 'Ej: 0123456789' },
                          { field: 'alias',       label: 'Alias / CBU',    placeholder: 'Ej: tukimarket.py' },
                          { field: 'tipo_cuenta', label: 'Tipo de cuenta', placeholder: 'Ej: Cuenta corriente' },
                        ] as { field: keyof BankData; label: string; placeholder: string }[]).map(({ field, label, placeholder }) => (
                          <div key={field} className={field === 'banco' || field === 'titular' ? 'sm:col-span-1' : ''}>
                            <label className="block text-xs text-gray-600 mb-1">{label}</label>
                            <input
                              type="text"
                              value={bankDraft[method.id]?.[field] ?? ''}
                              onChange={e => updateBankDraft(method.id, field, e.target.value)}
                              placeholder={placeholder}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => saveBankData(method.id)}
                          disabled={bankSaving === method.id}
                          className="px-4 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                        >
                          {bankSaving === method.id ? 'Guardando...' : 'Guardar datos bancarios'}
                        </button>
                        {bankMsg[method.id]?.text && (
                          <span className={`text-xs font-medium ${bankMsg[method.id].ok ? 'text-emerald-600' : 'text-red-500'}`}>
                            {bankMsg[method.id].text}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 mb-4">
        <h2 className="text-base font-bold text-gray-900">Métodos disponibles para Vendedores</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          Controlá qué métodos de pago pueden ofrecer los vendedores en sus tiendas.
          Cuando se desactiva <strong>Transferencia Bancaria Global</strong>, los vendedores habilitados
          cobran directamente en su cuenta bancaria.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {methods.map(method => (
          <div key={`vendor-${method.id}`} className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 transition-opacity ${method.vendor_allowed ? 'border-gray-200' : 'border-gray-100 opacity-70'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${method.vendor_allowed ? 'bg-violet-100' : 'bg-gray-100'}`}>
              <svg className={`w-5 h-5 ${method.vendor_allowed ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{method.name}</span>
                {method.vendor_allowed ? (
                  <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">Habilitado para vendedores</span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">Deshabilitado para vendedores</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {method.key === 'transfer'
                  ? 'Los vendedores pueden configurar sus datos bancarios y recibir transferencias directas.'
                  : 'Los vendedores pueden aceptar pago en efectivo al momento de la entrega.'}
              </p>
            </div>
            <button
              onClick={() => toggleVendorAllowed(method)}
              disabled={vendorToggleSaving === method.id}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                method.vendor_allowed ? 'bg-violet-500' : 'bg-gray-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                method.vendor_allowed ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        ))}
      </div>

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
