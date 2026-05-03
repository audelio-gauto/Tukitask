'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

interface UserProfile {
  user: { id: string; email: string; role: string; created_at: string };
  client_profile: { display_name?: string; phone?: string; photo_url?: string; avg_rating?: number; total_ratings?: number } | null;
  driver_profile: { display_name?: string; phone?: string; photo_url?: string; vehicle_type?: string; avg_rating?: number; total_ratings?: number; status?: string; documents_verified?: boolean } | null;
  orders_as_client: { id: string; status: string; offer?: number; suggested_price?: number; created_at: string; accepted_by?: string }[];
  orders_as_driver: { id: string; status: string; offer?: number; suggested_price?: number; created_at: string; client_email: string }[];
  wallet: { balance: number; updated_at: string } | null;
  wallet_transactions: { amount: number; type: string; description?: string; created_at: string }[];
  ratings_received: { score: number; comment?: string; rater_email: string; created_at: string }[];
  ratings_given: { score: number; comment?: string; rated_email: string; created_at: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  accepted: 'bg-indigo-100 text-indigo-800',
  in_transit: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  failed: 'bg-rose-100 text-rose-800',
  completed: 'bg-green-100 text-green-800',
};

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} className={`w-3 h-3 ${s <= Math.round(score) ? 'text-[#F5C518]' : 'text-gray-300'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function fmtGs(n?: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function Section({ title, children, icon }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 inline-flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function UnifiedProfilePage() {
  const params = useParams();
  const router = useRouter();
  const email = decodeURIComponent(params.email as string);

  const [data, setData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/profile/${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [email]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="max-w-4xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      {error || 'No encontrado'}
    </div>
  );

  const { user, client_profile, driver_profile, orders_as_client, orders_as_driver, wallet, wallet_transactions, ratings_received, ratings_given } = data;

  const profile = driver_profile ?? client_profile;
  const displayName = profile?.display_name || user.email;
  const photoUrl = profile?.photo_url;
  const roleLabel = user.role === 'driver' ? 'Driver' : user.role === 'tecnico' ? 'Técnico' : 'Cliente';
  const roleBg = user.role === 'driver' ? 'bg-blue-100 text-blue-700' : user.role === 'tecnico' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-start gap-4">
          {photoUrl
            ? <img src={photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 flex-shrink-0" />
            : <div className="w-16 h-16 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">{displayName[0]?.toUpperCase()}</div>
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900">{displayName}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${roleBg}`}>{roleLabel}</span>
              {driver_profile?.documents_verified !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${driver_profile.documents_verified ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {driver_profile.documents_verified ? 'Verificado' : 'Sin verificar'}
                </span>
              )}
              {driver_profile?.status && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                  {driver_profile.status}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
            {profile?.phone && <p className="text-sm text-gray-400">{profile.phone}</p>}
            <p className="text-xs text-gray-400 mt-1">
              Registrado: {new Date(user.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex gap-4 flex-shrink-0">
            {profile?.avg_rating && (
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <p className="text-lg font-bold text-gray-900">{Number(profile.avg_rating).toFixed(1)}</p>
                  <Stars score={Number(profile.avg_rating)} />
                </div>
                <p className="text-xs text-gray-400">{profile.total_ratings ?? 0} reseñas</p>
              </div>
            )}
            {wallet && (
              <div className="text-center">
                <p className={`text-lg font-bold ${wallet.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtGs(wallet.balance)}
                </p>
                <p className="text-xs text-gray-400">Billetera</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Orders as client */}
        {orders_as_client.length > 0 && (
          <Section title="Pedidos como cliente" icon={<Icon name="package" size={14} />}>
            <div className="space-y-2">
              {orders_as_client.map(o => (
                <div key={o.id} className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700">{fmtGs(o.offer ?? o.suggested_price)}</span>
                      <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es-PY')}</span>
                    </div>
                  </div>
                  {o.accepted_by && <p className="text-xs text-gray-400 mt-0.5">Driver: {o.accepted_by}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Orders as driver */}
        {orders_as_driver.length > 0 && (
          <Section title="Pedidos como driver" icon={<Icon name="car" size={14} />}>
            <div className="space-y-2">
              {orders_as_driver.map(o => (
                <div key={o.id} className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700">{fmtGs(o.offer ?? o.suggested_price)}</span>
                      <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es-PY')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Cliente: {o.client_email}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Wallet */}
        {wallet_transactions.length > 0 && (
          <Section title="Movimientos de billetera" icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}>
            <div className="space-y-2">
              {wallet_transactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${tx.amount > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tx.type}
                    </span>
                    {tx.description && <p className="text-xs text-gray-500 mt-0.5">{tx.description}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount > 0 ? '+' : ''}{fmtGs(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString('es-PY')}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Ratings received */}
        {ratings_received.length > 0 && (
          <Section title="Calificaciones recibidas" icon={<Icon name="star" size={14} />}>
            <div className="space-y-2">
              {ratings_received.map((r, i) => (
                <div key={i} className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-0.5">
                    <Stars score={r.score} />
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('es-PY')}</span>
                  </div>
                  {r.comment && <p className="text-xs text-gray-600 italic">&ldquo;{r.comment}&rdquo;</p>}
                  <p className="text-[10px] text-gray-400">por: {r.rater_email}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Ratings given */}
        {ratings_given.length > 0 && (
          <Section title="Calificaciones dadas" icon={<Icon name="star" size={14} />}>
            <div className="space-y-2">
              {ratings_given.map((r, i) => (
                <div key={i} className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1">
                      <Stars score={r.score} />
                      <span className="text-xs text-gray-500">a: {r.rated_email}</span>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('es-PY')}</span>
                  </div>
                  {r.comment && <p className="text-xs text-gray-600 italic">&ldquo;{r.comment}&rdquo;</p>}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
