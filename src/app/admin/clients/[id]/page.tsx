'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';
interface ClientDetail {
  user: { id: string; email: string; role: string; created_at: string };
  profile: {
    display_name?: string; phone?: string; photo_url?: string;
    avg_rating?: number; total_ratings?: number;
  } | null;
  recent_orders: {
    id: string; status: string; offer?: number;
    suggested_price?: number; pickup_address?: string; dropoff_address?: string; created_at: string;
  }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pendiente',    color: 'bg-yellow-100 text-yellow-700' },
  negotiating:        { label: 'Negociando',   color: 'bg-blue-100 text-blue-700' },
  confirmed:          { label: 'Confirmado',   color: 'bg-blue-100 text-blue-700' },
  picked_up:          { label: 'Recogido',     color: 'bg-blue-100 text-blue-700' },
  delivered:          { label: 'Entregado',    color: 'bg-emerald-100 text-emerald-700' },
  client_confirmed:   { label: 'Confirmado',   color: 'bg-emerald-100 text-emerald-700' },
  commission_charged: { label: 'Cobrado',      color: 'bg-emerald-100 text-emerald-700' },
  cancelled:          { label: 'Cancelado',    color: 'bg-red-100 text-red-700' },
  failed:             { label: 'Fallido',      color: 'bg-red-100 text-red-700' },
};

function fmtGs(n?: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n) + ' Gs';
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/clients/${id}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Error cargando datos');
        setData(json);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleEdit = () => {
    setEditForm({
      display_name: data?.profile?.display_name || '',
      phone: data?.profile?.phone || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar');
      }
      // Update local state
      setData(prev => prev ? {
        ...prev,
        profile: { ...prev.profile, display_name: editForm.display_name, phone: editForm.phone },
      } : prev);
      setEditing(false);
      setToast({ msg: 'Cliente actualizado', ok: true });
      setTimeout(() => setToast(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg, ok: false });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="max-w-3xl mx-auto">
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error || 'No encontrado'}</div>
    </div>
  );

  const { user, profile, recent_orders } = data;
  const name = profile?.display_name || user.email;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '12px 20px', borderRadius: 12, background: toast.ok ? '#065f46' : '#7f1d1d', color: '#fff', fontSize: '0.9rem', fontWeight: 600, border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={toast.ok ? 'check' : 'x'} size={14} />
            {toast.msg}
          </span>
        </div>
      )}

      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver a Clientes
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex flex-col items-center text-center mb-4">
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="" className="w-20 h-20 rounded-full object-cover mb-3 border-2 border-gray-200" />
                : <div className="w-20 h-20 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-2xl mb-3">{name[0]?.toUpperCase()}</div>
              }
              <h2 className="text-lg font-bold text-gray-900">{name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
              {profile?.phone && (
                <p className="text-sm text-gray-500 mt-1">{profile.phone}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{recent_orders.length}</p>
                <p className="text-xs text-gray-500">Pedidos recientes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{profile?.avg_rating ? Number(profile.avg_rating).toFixed(1) : '—'}</p>
                <p className="text-xs text-gray-500 inline-flex items-center justify-center gap-1">
                  <Icon name="star" size={12} />
                  Rating
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mt-3">
              Registrado {new Date(user.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            {/* Edit section */}
            {!editing ? (
              <button onClick={handleEdit}
                className="mt-4 w-full py-2 px-3 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <span className="inline-flex items-center gap-2">
                  <Icon name="pencil" size={14} />
                  Editar datos
                </span>
              </button>
            ) : (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editForm.display_name}
                    onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800"
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800"
                    placeholder="+595 9XX XXX XXX"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 py-2 rounded-lg text-sm font-bold text-[#1C1C2E] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#F5C518,#f59e0b)' }}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Últimos 10 pedidos</h3>
            {recent_orders.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">Sin pedidos registrados</p>
            ) : (
              <div className="space-y-2">
                {recent_orders.map(o => {
                  const st = STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-600' };
                  const price = o.offer ?? o.suggested_price;
                  return (
                    <div key={o.id} className="py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-gray-500 font-mono">{o.id.slice(0, 8)}…</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-800">{fmtGs(price)}</span>
                          <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es-PY')}</span>
                        </div>
                      </div>
                      {o.pickup_address && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{o.pickup_address} → {o.dropoff_address}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
