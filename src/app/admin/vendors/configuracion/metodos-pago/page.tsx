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
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bankDraft, setBankDraft] = useState<BankData>({ ...EMPTY_BANK });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const getAccessToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  };

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setSaveMsg({ ok: false, text: 'Sesion expirada. Volve a iniciar sesion.' });
        setLoading(false);
        return;
      }
      const res = await fetch('/api/admin/payment-methods', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as MethodConfig[];
        const map: Record<string, MethodConfig> = {};
        for (const m of data) map[m.key] = m;
        setCfg(map);
        if (map['transfer']?.bank_data) {
          setBankDraft({ ...EMPTY_BANK, ...map['transfer'].bank_data });
        }
      } else {
        const body = await res.json().catch(() => ({ error: 'Error al cargar metodos de pago.' })) as { error?: string };
        setSaveMsg({ ok: false, text: body.error || 'Error al cargar metodos de pago.' });
      }
      setLoading(false);
    })();
  }, []);

  const patch = async (key: string, field: string, value: boolean | number | null | BankData) => {
    const id = cfg[key]?.id;
    if (!id) return { ok: false, error: 'Metodo no encontrado para guardar.' };
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'Sesion expirada. Volve a iniciar sesion.' };
    const res = await fetch('/api/admin/payment-methods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, [field]: value }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({ error: 'No se pudo guardar el cambio.' })) as { error?: string };
    return { ok: false, error: body.error || 'No se pudo guardar el cambio.' };
  };

  const toggle = async (key: string, field: 'is_active' | 'vendor_allowed') => {
    const saveKey = `${key}.${field}`;
    setSaveMsg(null);
    setSaving(saveKey);
    const prev = !!cfg[key]?.[field];
    const next = !cfg[key]?.[field];
    setCfg(prev => ({ ...prev, [key]: { ...prev[key], [field]: next } }));
    const result = await patch(key, field, next);
    if (!result.ok) {
      setCfg(prevCfg => ({ ...prevCfg, [key]: { ...prevCfg[key], [field]: prev } }));
      setSaveMsg({ ok: false, text: result.error || 'No se pudo guardar el cambio. Intenta de nuevo.' });
    } else {
      setSaveMsg({ ok: true, text: 'Cambio guardado.' });
    }
    setSaving(null);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const saveBankData = async () => {
    setBankSaving(true);
    setBankMsg(null);
    const token = await getAccessToken();
    if (!token) {
      setBankMsg({ ok: false, text: 'Sesion expirada. Volve a iniciar sesion.' });
      setBankSaving(false);
      return;
    }
    const id = cfg['transfer']?.id;
    if (!id) { setBankSaving(false); return; }
    const res = await fetch('/api/admin/payment-methods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, bank_data: bankDraft }),
    });
    if (res.ok) {
      setBankMsg({ ok: true, text: 'Datos bancarios guardados.' });
    } else {
      const body = await res.json().catch(() => ({ error: 'Error al guardar.' })) as { error?: string };
      setBankMsg({ ok: false, text: body.error || 'Error al guardar.' });
    }
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
            {saveMsg && (
              <p className={`text-xs font-medium ${saveMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {saveMsg.text}
              </p>
            )}
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
