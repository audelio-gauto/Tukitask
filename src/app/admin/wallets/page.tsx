'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface RechargeRequest {
  id: string;
  driver_email: string;
  amount: number;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
  created_at: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export default function AdminWalletsPage() {
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch(`/api/admin/wallets?status=${tab}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setRequests(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function handleApprove(id: string) {
    setActionId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch('/api/admin/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'approve', request_id: id }),
    });
    const json = await res.json();
    setActionId(null);
    if (json.success) {
      showToast(`✓ Aprobado — ${fmtGS(json.amount)} acreditados a ${json.driver}`, true);
      fetchRequests();
    } else {
      showToast(json.error || 'Error al aprobar', false);
    }
  }

  async function handleReject(id: string) {
    if (!rejectNote.trim()) {
      showToast('Escribe un motivo de rechazo', false);
      return;
    }
    setActionId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch('/api/admin/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'reject', request_id: id, rejection_note: rejectNote }),
    });
    const json = await res.json();
    setActionId(null);
    setRejectTarget(null);
    setRejectNote('');
    if (json.success) {
      showToast('Solicitud rechazada', true);
      fetchRequests();
    } else {
      showToast(json.error || 'Error al rechazar', false);
    }
  }

  const tabStyle = (active: boolean) => ({
    padding: '0.45rem 1rem',
    borderRadius: 8,
    fontSize: '0.82rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: active ? '#F5C518' : 'transparent',
    color: active ? '#000' : '#6b7280',
  });

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.ok ? '#065f46' : '#991b1b', color: '#fff',
          padding: '0.75rem 1.25rem', borderRadius: 10, fontSize: '0.85rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 360,
        }}>
          {toast.text}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Billeteras Tukitask</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de recargas y comisiones de drivers y técnicos</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: '1.5rem', width: 'fit-content' }}>
        {(['pending', 'approved', 'rejected'] as const).map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === 'pending' ? '⏳ Pendientes' : t === 'approved' ? '✓ Aprobadas' : '✗ Rechazadas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center text-gray-400">Cargando...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>{tab === 'pending' ? '🎉' : '📋'}</div>
          <p className="text-gray-400 text-sm">
            {tab === 'pending' ? 'No hay solicitudes pendientes' : 'Sin registros en esta categoría'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {requests.map((req, i) => (
            <div key={req.id} style={{
              padding: '1rem 1.25rem',
              borderBottom: i < requests.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#111827' }}>
                    {fmtGS(req.amount)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>{req.driver_email}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{fmtDate(req.created_at)}</div>
                  {req.status === 'rejected' && req.rejection_note && (
                    <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#dc2626', background: '#fee2e2', borderRadius: 6, padding: '0.2rem 0.4rem' }}>
                      Motivo: {req.rejection_note}
                    </div>
                  )}
                  {req.status === 'approved' && (
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#059669' }}>
                      Aprobado por {req.reviewed_by} · {req.reviewed_at ? fmtDate(req.reviewed_at) : ''}
                    </div>
                  )}
                </div>

                {/* Comprobante */}
                {req.receipt_url && (
                  <button
                    onClick={() => setPreviewUrl(req.receipt_url)}
                    style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '0.78rem', cursor: 'pointer', color: '#374151' }}
                  >
                    📷 Ver comprobante
                  </button>
                )}

                {/* Acciones — solo en pending */}
                {tab === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      disabled={actionId === req.id}
                      onClick={() => handleApprove(req.id)}
                      style={{
                        padding: '0.45rem 1rem', borderRadius: 8, border: 'none',
                        background: '#059669', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                      }}
                    >
                      {actionId === req.id ? '...' : '✓ Aprobar'}
                    </button>
                    <button
                      disabled={actionId === req.id}
                      onClick={() => { setRejectTarget(req.id); setRejectNote(''); }}
                      style={{
                        padding: '0.45rem 1rem', borderRadius: 8, border: 'none',
                        background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                      }}
                    >
                      ✗ Rechazar
                    </button>
                  </div>
                )}
              </div>

              {/* Inline reject form */}
              {rejectTarget === req.id && (
                <div style={{ marginTop: '0.75rem', background: '#fef9e7', borderRadius: 8, padding: '0.75rem', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: 6, fontWeight: 600 }}>Motivo de rechazo:</div>
                  <input
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Ej: Comprobante ilegible, monto incorrecto..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.82rem', marginBottom: 6, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={actionId === req.id}
                      style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      Confirmar rechazo
                    </button>
                    <button
                      onClick={() => { setRejectTarget(null); setRejectNote(''); }}
                      style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal vista comprobante */}
      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="comprobante" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }} />
        </div>
      )}
    </div>
  );
}
