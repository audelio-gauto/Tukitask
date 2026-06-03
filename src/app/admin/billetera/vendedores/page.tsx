'use client';
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

/* ── Types ──────────────────────────────────────────────────── */
interface VendorRequest {
  id: string;
  vendor_email: string;
  amount: number;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
  created_at: string;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CFG = {
  pending:  { label: 'Pendiente', bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  approved: { label: 'Aprobado',  bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
  rejected: { label: 'Rechazado', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
};

/* ══════════════════════════════════════════════════════════════ */
export default function AdminVendedoresWalletPage() {
  const [requests, setRequests] = useState<VendorRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Manual adjustment state
  const [adjEmail, setAdjEmail]   = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType]     = useState<'credit' | 'debit'>('credit');
  const [adjNote, setAdjNote]     = useState('');
  const [adjBusy, setAdjBusy]     = useState(false);
  const [adjMsg, setAdjMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    const res = await authFetch(`/api/admin/vendor-wallets${params}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setRequests(data.requests ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const res = await authFetch('/api/admin/vendor-wallets', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', request_id: id }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Error'); return; }
      void fetchRequests();
    } finally { setBusyId(null); }
  }

  async function handleReject() {
    if (!rejectId) return;
    setBusyId(rejectId);
    try {
      const res = await authFetch('/api/admin/vendor-wallets', {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', request_id: rejectId, rejection_note: rejectNote }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Error'); return; }
      setRejectId(null);
      setRejectNote('');
      void fetchRequests();
    } finally { setBusyId(null); }
  }

  async function handleAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjBusy(true);
    setAdjMsg(null);
    try {
      const res = await authFetch('/api/admin/vendor-wallets', {
        method: 'PATCH',
        body: JSON.stringify({ vendor_email: adjEmail, amount: Number(adjAmount), type: adjType, note: adjNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setAdjMsg({ text: `✅ Ajuste aplicado. Nuevo saldo: Gs ${new Intl.NumberFormat('es-PY').format(data.new_balance)}`, ok: true });
      setAdjEmail(''); setAdjAmount(''); setAdjNote('');
    } catch (err) {
      setAdjMsg({ text: err instanceof Error ? err.message : 'Error', ok: false });
    } finally { setAdjBusy(false); }
  }

  /* ── render ── */
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Billetera Vendedores</h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>Recargas de billetera y ajustes manuales</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s}
              onClick={() => setStatusFilter(s)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: statusFilter === s ? '#0f172a' : '#fff', color: statusFilter === s ? '#fff' : '#334155', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              {s === 'all' ? 'Todos' : STATUS_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Requests table */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 32 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Cargando...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            No hay solicitudes {statusFilter !== 'all' ? `con estado "${STATUS_CFG[statusFilter as keyof typeof STATUS_CFG]?.label}"` : ''}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['Vendedor', 'Monto', 'Estado', 'Fecha', 'Comprobante', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const sc = STATUS_CFG[r.status];
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: '#334155', fontWeight: 600 }}>{r.vendor_email}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0f172a' }}>{fmtGS(r.amount)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: sc.bg, color: sc.color, fontSize: '0.78rem', fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {r.receipt_url ? (
                        <button onClick={() => setPreviewUrl(r.receipt_url)} style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          Ver
                        </button>
                      ) : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            disabled={busyId === r.id}
                            onClick={() => void handleApprove(r.id)}
                            style={{ background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: busyId === r.id ? 0.6 : 1 }}>
                            ✓ Aprobar
                          </button>
                          <button
                            disabled={busyId === r.id}
                            onClick={() => { setRejectId(r.id); setRejectNote(''); }}
                            style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: busyId === r.id ? 0.6 : 1 }}>
                            ✕ Rechazar
                          </button>
                        </div>
                      )}
                      {r.status !== 'pending' && r.reviewed_by && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.reviewed_by}</span>
                      )}
                      {r.rejection_note && (
                        <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: 2 }}>{r.rejection_note}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual adjustment */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.07)', padding: 24 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Ajuste manual de saldo</h2>
        <form onSubmit={e => void handleAdjustment(e)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Email del vendedor</label>
            <input type="email" required value={adjEmail} onChange={e => setAdjEmail(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Monto (Gs)</label>
            <input type="number" min="1" required value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
            <select value={adjType} onChange={e => setAdjType(e.target.value as 'credit' | 'debit')}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }}>
              <option value="credit">Crédito (suma)</option>
              <option value="debit">Débito (resta)</option>
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Nota (opcional)</label>
            <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="Razón del ajuste"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', boxSizing: 'border-box' }} />
          </div>
          {adjMsg && (
            <div style={{ gridColumn: '1/-1', padding: '9px 12px', borderRadius: 8, background: adjMsg.ok ? '#d1fae5' : '#fee2e2', color: adjMsg.ok ? '#065f46' : '#991b1b', fontSize: '0.85rem', fontWeight: 600 }}>
              {adjMsg.text}
            </div>
          )}
          <div style={{ gridColumn: '1/-1' }}>
            <button type="submit" disabled={adjBusy}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#0f172a', color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 700, cursor: adjBusy ? 'wait' : 'pointer', opacity: adjBusy ? 0.7 : 1 }}>
              {adjBusy ? 'Aplicando...' : 'Aplicar ajuste'}
            </button>
          </div>
        </form>
      </div>

      {/* Receipt preview modal */}
      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}>
          <img src={previewUrl} alt="Comprobante" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 4px 32px rgba(0,0,0,0.4)', objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 800 }}>Rechazar solicitud</h3>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Motivo del rechazo</label>
            <input type="text" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Ej: Comprobante ilegible"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.875rem', marginBottom: 16, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRejectId(null); setRejectNote(''); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => void handleReject()} disabled={busyId === rejectId}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: busyId === rejectId ? 0.6 : 1 }}>
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
