'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Tecnico {
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  gender: string | null;
  accepted_services: string[] | null;
  custom_commission_pct: number | null;
  custom_commission_fixed: number | null;
  subscription_active: boolean;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
}

interface ServicePricing {
  id: string;
  service_type: string;
  label: string;
  emoji: string;
  suggested_price: number | null;
  commission_pct: number;
  commission_fixed: number;
  sort_order: number;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isExpired(iso: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default function ServiceCommissionPage() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [servicePricing, setServicePricing] = useState<ServicePricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Tecnico>>({});
  const [search, setSearch] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);
  const [tab, setTab] = useState<'pricing' | 'tecnicos'>('pricing');

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/services/commissions', {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTecnicos(json.tecnicos || []);
      setServicePricing(json.service_pricing || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSavePricing = async () => {
    setSavingPricing(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/services/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ service_pricing: servicePricing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess('Precios de servicios guardados correctamente');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(String(err)); }
    finally { setSavingPricing(false); }
  };

  const updatePricing = (id: string, field: keyof ServicePricing, value: string) => {
    setServicePricing(prev => prev.map(s => s.id === id
      ? { ...s, [field]: value === '' ? null : (field === 'label' || field === 'emoji' ? value : parseFloat(value) || 0) }
      : s));
  };

  const openEdit = (t: Tecnico) => {
    setEditingEmail(t.email);
    setForm({
      custom_commission_pct: t.custom_commission_pct,
      custom_commission_fixed: t.custom_commission_fixed,
      subscription_active: t.subscription_active,
      subscription_plan: t.subscription_plan || '',
      subscription_expires_at: t.subscription_expires_at ? t.subscription_expires_at.split('T')[0] : '',
    });
  };

  const handleSaveTecnico = async (email: string) => {
    setSaving(email);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/services/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({
          email,
          custom_commission_pct: form.custom_commission_pct ?? null,
          custom_commission_fixed: form.custom_commission_fixed ?? null,
          subscription_active: form.subscription_active || false,
          subscription_plan: form.subscription_plan || null,
          subscription_expires_at: form.subscription_expires_at
            ? new Date((form.subscription_expires_at as string) + 'T23:59:59').toISOString()
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess(`Guardado correctamente para ${email}`);
      setTimeout(() => setSuccess(''), 3000);
      setEditingEmail(null);
      fetchData();
    } catch (err) { setError(String(err)); }
    finally { setSaving(null); }
  };

  const filtered = tecnicos.filter(t => {
    const q = search.toLowerCase();
    return !q || t.email.toLowerCase().includes(q)
      || (t.first_name || '').toLowerCase().includes(q)
      || (t.last_name || '').toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5C518]" />
    </div>
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">🛠️ Comisión de Servicios</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configura precios sugeridos y comisiones por tipo de servicio, y gestiona la suscripción de cada técnico.
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✅ {success}</div>}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        <button
          onClick={() => setTab('pricing')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'pricing' ? 'bg-white border border-b-white border-gray-200 text-[#1C1C2E]' : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          💰 Precios por Servicio
        </button>
        <button
          onClick={() => setTab('tecnicos')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'tecnicos' ? 'bg-white border border-b-white border-gray-200 text-[#1C1C2E]' : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          👤 Comisión por Técnico ({tecnicos.length})
        </button>
      </div>

      {/* ── TAB: SERVICE PRICING ── */}
      {tab === 'pricing' && (
        <div>
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>ℹ️ Cómo funciona la comisión:</strong> Para técnicos <em>sin suscripción</em> se aplica
            el % de comisión configurado aquí por tipo de servicio. Con suscripción activa se aplica
            su comisión personalizada (más baja).
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Tipos de Servicio</h2>
              <button
                onClick={handleSavePricing}
                disabled={savingPricing}
                className="px-4 py-1.5 bg-[#F5C518] text-[#1C1C2E] text-sm font-semibold rounded-lg hover:bg-[#E6A800] disabled:opacity-50"
              >
                {savingPricing ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {servicePricing.map(s => (
                <div key={s.id} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 items-start hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{s.emoji}</span>
                    <span className="font-medium text-sm text-gray-700">{s.label}</span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Precio Sugerido (Gs)</label>
                    <input
                      type="number" min="0" step="1000"
                      value={s.suggested_price ?? ''}
                      placeholder="Opcional"
                      onChange={e => updatePricing(s.id, 'suggested_price', e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] placeholder:text-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Comisión %</label>
                    <div className="relative">
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={s.commission_pct}
                        onChange={e => updatePricing(s.id, 'commission_pct', e.target.value)}
                        className="w-full px-3 py-1.5 pr-7 border border-orange-200 bg-orange-50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Comisión Fija (Gs)</label>
                    <input
                      type="number" min="0" step="1"
                      value={s.commission_fixed}
                      onChange={e => updatePricing(s.id, 'commission_fixed', e.target.value)}
                      className="w-full px-3 py-1.5 border border-orange-200 bg-orange-50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              ))}
              {servicePricing.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Ejecuta la migración <strong>021_tecnico_commissions.sql</strong> en Supabase para crear los tipos de servicio.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: TECNICOS ── */}
      {tab === 'tecnicos' && (
        <div>
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>¿Cómo funciona?</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong>Sin suscripción / vencida:</strong> comisión global por tipo de servicio.</li>
              <li><strong>Suscripción activa:</strong> comisión personalizada configurada aquí (más baja).</li>
              <li>Se descuenta automáticamente de la billetera al completar cada trabajo.</li>
            </ul>
          </div>

          <div className="mb-4">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar técnico por nombre o email..."
              className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
            />
          </div>

          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
                No hay técnicos registrados con rol &quot;tecnico&quot; o &quot;servicio&quot;.
              </div>
            )}
            {filtered.map(t => {
              const isEditing = editingEmail === t.email;
              const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || '(Sin nombre)';
              const expired = isExpired(t.subscription_expires_at);
              const subStatus = t.subscription_active && !expired ? 'active'
                : t.subscription_active && expired ? 'expired' : 'none';

              return (
                <div key={t.email} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                      {t.profile_photo
                        ? <img src={t.profile_photo} alt="" className="w-full h-full object-cover" />
                        : name[0]?.toUpperCase()
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{name}</p>
                      <p className="text-xs text-gray-400 truncate">{t.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {subStatus === 'active' && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            ✅ Suscripción activa · vence {formatDate(t.subscription_expires_at)}
                          </span>
                        )}
                        {subStatus === 'expired' && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                            ⚠️ Suscripción vencida · {formatDate(t.subscription_expires_at)}
                          </span>
                        )}
                        {subStatus === 'none' && (
                          <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Sin suscripción</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isEditing && (
                        <div className="text-right text-xs text-gray-500 hidden sm:block">
                          {subStatus === 'active' ? (
                            <>
                              <p className="font-semibold text-orange-600">Comisión personalizada</p>
                              <p>{t.custom_commission_pct ?? 0}% + Gs {t.custom_commission_fixed ?? 0} fijo</p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-gray-500">Comisión global</p>
                              <p className="text-gray-400">Según tipo de servicio</p>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => isEditing ? setEditingEmail(null) : openEdit(t)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors border-purple-300 text-purple-700 hover:bg-purple-50"
                      >
                        {isEditing ? 'Cancelar' : 'Editar'}
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                          Comisión Personalizada (requiere suscripción activa)
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Comisión %</label>
                            <div className="relative">
                              <input
                                type="number" min="0" max="100" step="0.1"
                                value={form.custom_commission_pct ?? ''}
                                onChange={e => setForm(f => ({ ...f, custom_commission_pct: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                                placeholder="Ej. 5"
                                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Comisión Fija (Gs)</label>
                            <input
                              type="number" min="0" step="1"
                              value={form.custom_commission_fixed ?? ''}
                              onChange={e => setForm(f => ({ ...f, custom_commission_fixed: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                              placeholder="Ej. 500"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Suscripción Mensual</h4>
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            onClick={() => setForm(f => ({ ...f, subscription_active: !f.subscription_active }))}
                            className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${form.subscription_active ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow ${form.subscription_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {form.subscription_active ? 'Suscripción activa' : 'Sin suscripción'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
                            <select
                              value={form.subscription_plan || ''}
                              onChange={e => setForm(f => ({ ...f, subscription_plan: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                            >
                              <option value="">Sin plan</option>
                              <option value="mensual_basico">Mensual Básico</option>
                              <option value="mensual_pro">Mensual Pro</option>
                              <option value="mensual_premium">Mensual Premium</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de vencimiento</label>
                            <input
                              type="date"
                              value={(form.subscription_expires_at as string) || ''}
                              onChange={e => setForm(f => ({ ...f, subscription_expires_at: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleSaveTecnico(t.email)}
                          disabled={saving === t.email}
                          className="px-5 py-2 bg-[#F5C518] text-[#1C1C2E] rounded-lg text-sm font-semibold hover:bg-[#E6A800] disabled:opacity-50 transition-colors"
                        >
                          {saving === t.email ? 'Guardando...' : '💾 Guardar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
