'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface DriverDetail {
  user: { id: string; email: string; role: string; created_at: string };
  profile: {
    first_name?: string; last_name?: string; transport_mode?: string;
    profile_photo?: string; avg_rating?: number; total_ratings?: number;
    verification_status?: string; verified?: boolean; verified_at?: string;
    subscription_active?: boolean; subscription_plan?: string; subscription_expires_at?: string;
    custom_commission_pct?: number; custom_commission_fixed?: number;
  } | null;
  recent_orders: {
    id: string; status: string; offer?: number; created_at: string;
  }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pendiente',   color: 'bg-yellow-100 text-yellow-700' },
  confirmed:          { label: 'Confirmado',  color: 'bg-blue-100 text-blue-700' },
  picked_up:          { label: 'Recogido',    color: 'bg-blue-100 text-blue-700' },
  delivered:          { label: 'Entregado',   color: 'bg-emerald-100 text-emerald-700' },
  cancelled:          { label: 'Cancelado',   color: 'bg-red-100 text-red-700' },
  client_confirmed:   { label: 'Confirmado',  color: 'bg-emerald-100 text-emerald-700' },
  commission_charged: { label: 'Cobrado',     color: 'bg-emerald-100 text-emerald-700' },
};

const TRANSPORT_LABELS: Record<string, string> = {
  moto: 'Moto', auto: 'Auto', camion: 'Camión', van: 'Van', bici: 'Bici',
};

function fmtGs(n?: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n) + ' Gs';
}

export default function DriverDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/admin/drivers/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
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

  const handleVerify = async (action: 'verify' | 'reject') => {
    if (!data) return;
    setVerifying(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/drivers/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: data.user.email, action }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setData(prev => prev ? {
        ...prev,
        profile: {
          ...prev.profile,
          verified: action === 'verify',
          verification_status: action === 'verify' ? 'verified' : 'rejected',
        },
      } : null);
    } catch (err: any) {
      alert('Error: ' + String(err?.message || err));
    } finally {
      setVerifying(false);
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
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || user.email;
  const isVerified = profile?.verified || profile?.verification_status === 'verified';
  const isRejected = profile?.verification_status === 'rejected';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver a Conductores
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex flex-col items-center text-center mb-4">
              {profile?.profile_photo
                ? <img src={profile.profile_photo} alt="" className="w-20 h-20 rounded-full object-cover mb-3 border-2 border-gray-200" />
                : <div className="w-20 h-20 rounded-full bg-amber-100 border-2 border-amber-200 flex items-center justify-center text-amber-700 font-bold text-2xl mb-3">{name[0]?.toUpperCase()}</div>
              }
              <h2 className="text-lg font-bold text-gray-900">{name}</h2>
              <p className="text-sm text-gray-500">{user.email}</p>
              {profile?.transport_mode && (
                <span className="mt-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  {TRANSPORT_LABELS[profile.transport_mode] || profile.transport_mode}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{profile?.avg_rating ? Number(profile.avg_rating).toFixed(1) : '—'}</p>
                <p className="text-xs text-gray-500">Rating ⭐</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{profile?.total_ratings ?? '—'}</p>
                <p className="text-xs text-gray-500">Calificaciones</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mt-3">Registrado {new Date(user.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* Verification Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Verificación</h3>
            <div className="mb-4">
              {isVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>Verificado
                </span>
              ) : isRejected ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>Rechazado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>Pendiente de verificación
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!isVerified && (
                <button onClick={() => handleVerify('verify')} disabled={verifying}
                  className="flex-1 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {verifying ? '...' : 'Verificar'}
                </button>
              )}
              {isVerified && (
                <button onClick={() => handleVerify('reject')} disabled={verifying}
                  className="flex-1 py-2 bg-red-100 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors">
                  {verifying ? '...' : 'Rechazar acceso'}
                </button>
              )}
              {isRejected && (
                <button onClick={() => handleVerify('verify')} disabled={verifying}
                  className="flex-1 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {verifying ? '...' : 'Aprobar'}
                </button>
              )}
            </div>
          </div>

          {/* Subscription + Commission */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Suscripción & Comisión</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Suscripción</span>
                {profile?.subscription_active
                  ? <span className="font-medium text-emerald-700">{profile.subscription_plan || 'Activa'}</span>
                  : <span className="text-gray-400">Sin suscripción</span>
                }
              </div>
              {profile?.subscription_expires_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Vence</span>
                  <span className="text-gray-700">{new Date(profile.subscription_expires_at).toLocaleDateString('es-PY')}</span>
                </div>
              )}
              {profile?.custom_commission_pct != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Comisión %</span>
                  <span className="font-medium text-gray-800">{profile.custom_commission_pct}%</span>
                </div>
              )}
              {profile?.custom_commission_fixed != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Comisión fija</span>
                  <span className="font-medium text-gray-800">{fmtGs(profile.custom_commission_fixed)}</span>
                </div>
              )}
            </div>
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
                  const price = o.offer;
                  return (
                    <div key={o.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-gray-500 font-mono">{o.id.slice(0, 8)}…</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-gray-800">{fmtGs(price)}</span>
                        <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es-PY')}</span>
                      </div>
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
