'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon, type IconName } from '@/components/Icon';

interface Driver {
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  transport_mode: string | null;
  custom_commission_pct: number | null;
  custom_commission_fixed: number | null;
  subscription_active: boolean;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
}

const VEHICLE_LABELS: Record<string, { label: string; icon: IconName }> = {
  moto: { label: 'Moto', icon: 'car' },
  auto: { label: 'Auto', icon: 'car' },
  moto_carro: { label: 'Moto carro', icon: 'car' },
  motocarro: { label: 'Moto carro', icon: 'car' },
  camion: { label: 'Camion', icon: 'truck' },
  camion2t: { label: 'Camion', icon: 'truck' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isExpired(iso: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default function DriverCommissionPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Driver>>({});
  const [search, setSearch] = useState('');

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/drivers/commissions', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDrivers(json.drivers || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const openEdit = (driver: Driver) => {
    setEditingEmail(driver.email);
    setForm({
      custom_commission_pct: driver.custom_commission_pct,
      custom_commission_fixed: driver.custom_commission_fixed,
      subscription_active: driver.subscription_active,
      subscription_plan: driver.subscription_plan || '',
      subscription_expires_at: driver.subscription_expires_at
        ? driver.subscription_expires_at.split('T')[0]
        : '',
    });
  };

  const handleSave = async (email: string) => {
    setSaving(email);
    setError('');
    setSuccess('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        email,
        custom_commission_pct: form.custom_commission_pct === undefined ? null : form.custom_commission_pct,
        custom_commission_fixed: form.custom_commission_fixed === undefined ? null : form.custom_commission_fixed,
        subscription_active: form.subscription_active || false,
        subscription_plan: form.subscription_plan || null,
        subscription_expires_at: form.subscription_expires_at
          ? new Date(form.subscription_expires_at + 'T23:59:59').toISOString()
          : null,
      };
      const res = await fetch('/api/admin/drivers/commissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess(`Guardado correctamente para ${email}`);
      setTimeout(() => setSuccess(''), 3000);
      setEditingEmail(null);
      fetchDrivers();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(null);
    }
  };

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    return !q || d.email.toLowerCase().includes(q)
      || (d.first_name || '').toLowerCase().includes(q)
      || (d.last_name || '').toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5C518]" />
    </div>
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Icon name="money" size={20} />
          Comision por Conductor
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Configura comisión personalizada y suscripción mensual por conductor.
          Los drivers con suscripción activa pagan su comisión personalizada (más baja).
          Al vencer sin renovar, se aplica automáticamente la comisión global del tipo de vehículo.
        </p>
      </div>

      {/* Info box */}
      <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>¿Cómo funciona?</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li><strong>Sin suscripción / Suscripción vencida:</strong> Se cobra la comisión global configurada en "Configuración de Precios" según el tipo de vehículo.</li>
          <li><strong>Suscripción activa:</strong> Se cobra la comisión personalizada (% y/o fija) que configures aquí — ideal para tarifas más bajas.</li>
          <li>La comisión se descuenta automáticamente de la billetera del conductor al completar cada envío.</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <span className="inline-flex items-center gap-1">
            <Icon name="check" size={14} />
            {success}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar conductor por nombre o email..."
          className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
        />
      </div>

      {/* Driver cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
            No hay conductores registrados aún.
          </div>
        )}
        {filtered.map(driver => {
          const isEditing = editingEmail === driver.email;
          const name = [driver.first_name, driver.last_name].filter(Boolean).join(' ') || '(Sin nombre)';
          const expired = isExpired(driver.subscription_expires_at);
          const subStatus = driver.subscription_active && !expired ? 'active'
            : driver.subscription_active && expired ? 'expired' : 'none';

          return (
            <div key={driver.email} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F5C518] to-orange-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                  {driver.profile_photo
                    ? <img src={driver.profile_photo} alt="" className="w-full h-full object-cover" />
                    : name[0]?.toUpperCase()
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{name}</p>
                  <p className="text-xs text-gray-400 truncate">{driver.email}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {driver.transport_mode && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Icon
                          name={(VEHICLE_LABELS[driver.transport_mode]?.icon) || 'car'}
                          size={12}
                        />
                        {VEHICLE_LABELS[driver.transport_mode]?.label || driver.transport_mode}
                      </span>
                    )}
                    {subStatus === 'active' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Icon name="check" size={12} />
                          Suscripcion activa · vence {formatDate(driver.subscription_expires_at)}
                        </span>
                      </span>
                    )}
                    {subStatus === 'expired' && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Icon name="exclamation" size={12} />
                          Suscripcion vencida · {formatDate(driver.subscription_expires_at)}
                        </span>
                      </span>
                    )}
                    {subStatus === 'none' && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Sin suscripción</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Current commission badge */}
                  {!isEditing && (
                    <div className="text-right text-xs text-gray-500 hidden sm:block">
                      {subStatus === 'active' ? (
                        <>
                          <p className="font-semibold text-orange-600">Comisión personalizada</p>
                          <p>{driver.custom_commission_pct ?? 0}% + Gs {driver.custom_commission_fixed ?? 0} fijo</p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-gray-500">Comisión global</p>
                          <p className="text-gray-400">Según tipo de vehículo</p>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => isEditing ? setEditingEmail(null) : openEdit(driver)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      border-[#F5C518] text-[#1C1C2E] hover:bg-[#F5C518]"
                  >
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
                </div>
              </div>

              {/* Edit form */}
              {isEditing && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                  {/* Commission fields */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                      Comisión Personalizada (al tener suscripción activa)
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Comisión %</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={form.custom_commission_pct ?? ''}
                            onChange={e => setForm(f => ({
                              ...f,
                              custom_commission_pct: e.target.value === '' ? null : parseFloat(e.target.value),
                            }))}
                            placeholder="Ej. 5"
                            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">% del monto del envío</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Comisión Fija (Gs)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={form.custom_commission_fixed ?? ''}
                          onChange={e => setForm(f => ({
                            ...f,
                            custom_commission_fixed: e.target.value === '' ? null : parseFloat(e.target.value),
                          }))}
                          placeholder="Ej. 500"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Monto fijo adicional</p>
                      </div>
                    </div>
                  </div>

                  {/* Subscription */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Suscripción Mensual</h4>
                    <div className="flex items-center gap-3 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setForm(f => ({ ...f, subscription_active: !f.subscription_active }))}
                          className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${
                            form.subscription_active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow ${
                            form.subscription_active ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {form.subscription_active ? 'Suscripción activa' : 'Sin suscripción'}
                        </span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Plan</label>
                        <select
                          value={form.subscription_plan || ''}
                          onChange={e => setForm(f => ({ ...f, subscription_plan: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSave(driver.email)}
                      disabled={saving === driver.email}
                      className="px-5 py-2 bg-[#F5C518] text-[#1C1C2E] rounded-lg text-sm font-semibold
                        hover:bg-[#E6A800] disabled:opacity-50 transition-colors"
                    >
                      {saving === driver.email ? 'Guardando...' : (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="document" size={14} />
                          Guardar
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
