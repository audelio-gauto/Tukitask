'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../context';

export default function DriverAceptacionPage() {
  const router = useRouter();
  const { email } = useDriverContext();
  const [history, setHistory] = useState<{ status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    fetch(`/api/orders?driver_email=${encodeURIComponent(email)}&history=true`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setHistory(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const delivered = history.filter(o =>
    ['delivered', 'commission_charged', 'client_confirmed'].includes(o.status)
  ).length;
  const cancelled = history.filter(o =>
    ['failed', 'cancelled', 'returned', 'return_rejected'].includes(o.status)
  ).length;
  const total = delivered + cancelled;
  const tasa  = total > 0 ? Math.round((delivered / total) * 100) : null;

  const ring = tasa ?? 0;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (ring / 100) * circumference;

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#F5C518', color: '#111', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#111', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🏆 Tasa de Aceptación</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.75 }}>Tu rendimiento histórico</p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <svg style={{ width: 32, height: 32, marginBottom: 8, display: 'inline-block', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
            <p>Cargando estadísticas...</p>
          </div>
        ) : (
          <>
            {/* Donut chart */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', marginBottom: 16 }}>
              <svg width="140" height="140" style={{ display: 'block', margin: '0 auto 12px' }}>
                <circle cx="70" cy="70" r="52" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                <circle
                  cx="70" cy="70" r="52" fill="none"
                  stroke={ring >= 70 ? '#059669' : ring >= 40 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="14"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="70" y="66" textAnchor="middle" fontSize="28" fontWeight="800" fill="#1e293b">
                  {tasa !== null ? `${tasa}%` : '—'}
                </text>
                <text x="70" y="84" textAnchor="middle" fontSize="11" fill="#9ca3af">aceptación</text>
              </svg>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                Basado en {total} {total === 1 ? 'envío' : 'envíos'}
              </p>
            </div>

            {/* Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#d1fae5', borderRadius: 14, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#059669' }}>{delivered}</div>
                <div style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>✅ Completados</div>
              </div>
              <div style={{ background: '#fee2e2', borderRadius: 14, padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#dc2626' }}>{cancelled}</div>
                <div style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 600 }}>✕ Cancelados</div>
              </div>
            </div>

            {total === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 32, color: '#9ca3af' }}>
                <p style={{ fontSize: '0.85rem' }}>Completá tu primer envío para ver tu tasa acá.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
