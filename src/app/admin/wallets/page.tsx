'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

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

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
}

interface DriverWallet {
  balance: number;
  transactions: WalletTx[];
  recharge_requests: { id: string; amount: number; status: string; created_at: string }[];
}

const TX_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  commission: { label: 'Comisión', color: '#ef4444' },
  recharge: { label: 'Recarga', color: '#10b981' },
  admin_credit: { label: 'Crédito admin', color: '#10b981' },
  admin_debit: { label: 'Débito admin', color: '#ef4444' },
  refund: { label: 'Reembolso', color: '#10b981' },
  bonus: { label: 'Bono', color: '#f59e0b' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export default function AdminWalletsPage() {
  const searchParams = useSearchParams();
  const initialTab = (['pending','approved','rejected','ajuste','movimientos'].includes(searchParams.get('tab') || '') ? searchParams.get('tab') : 'pending') as 'pending' | 'approved' | 'rejected' | 'ajuste' | 'movimientos';
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'ajuste' | 'movimientos'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Ajuste manual state
  const [adjEmail, setAdjEmail] = useState('');
  const [adjBalance, setAdjBalance] = useState<number | null>(null);
  const [adjBalanceLoading, setAdjBalanceLoading] = useState(false);
  const [adjSearch, setAdjSearch] = useState('');
  const [adjSuggestions, setAdjSuggestions] = useState<{email:string;name:string;role:string}[]>([]);
  const [adjShowDrop, setAdjShowDrop] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjType, setAdjType] = useState<'credit' | 'debit'>('credit');
  const adjDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Movimientos state
  const [movEmail, setMovEmail] = useState('');
  const [movEmailInput, setMovEmailInput] = useState('');
  const [movSearch, setMovSearch] = useState('');
  const [movSuggestions, setMovSuggestions] = useState<{email:string;name:string;role:string}[]>([]);
  const [movShowDrop, setMovShowDrop] = useState(false);
  const [movWallet, setMovWallet] = useState<DriverWallet | null>(null);
  const [movLoading, setMovLoading] = useState(false);
  const movDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  };

  async function fetchUserSuggestions(q: string, set: (v: {email:string;name:string;role:string}[]) => void) {
    if (q.length < 2) { set([]); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}&roles=driver,tecnico`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    });
    if (res.ok) set(await res.json());
  }

  async function fetchAdjBalance(email: string) {
    setAdjBalanceLoading(true);
    setAdjBalance(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/wallets?driver_email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    });
    if (res.ok) {
      const json = await res.json();
      setAdjBalance(typeof json.balance === 'number' ? json.balance : null);
    }
    setAdjBalanceLoading(false);
  }

  const fetchRequests = useCallback(async () => {
    if (tab === 'ajuste' || tab === 'movimientos') { setLoading(false); return; }
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
      showToast(`Aprobado — ${fmtGS(json.amount)} acreditados a ${json.driver}`, true);
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

  async function handleAdjust() {
    const amount = parseInt(adjAmount);
    if (!adjEmail.trim() || !amount || amount <= 0) {
      showToast('Email y monto requeridos', false); return;
    }
    setAdjSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/wallets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({
        driver_email: adjEmail.trim(),
        amount: adjType === 'credit' ? amount : -amount,
        note: adjNote.trim() || undefined,
      }),
    });
    const json = await res.json();
    setAdjSaving(false);
    if (json.success) {
      showToast(`Saldo actualizado — nuevo saldo: ${fmtGS(json.new_balance)}`, true);
      setAdjAmount(''); setAdjNote('');
      if (typeof json.new_balance === 'number') setAdjBalance(json.new_balance);
    } else {
      showToast(json.error || 'Error al ajustar', false);
    }
  }

  async function loadMovimientos(email: string) {
    if (!email.trim()) return;
    setMovLoading(true);
    setMovWallet(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/wallets?driver_email=${encodeURIComponent(email.trim())}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    });
    const json = await res.json();
    setMovLoading(false);
    if (res.ok) { setMovWallet(json); setMovEmail(email.trim()); }
    else showToast(json.error || 'Error', false);
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
      <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'ajuste', 'movimientos'] as const).map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t === 'pending' ? <Icon name="clock" size={14} /> : t === 'approved' ? <Icon name="check" size={14} /> : t === 'rejected' ? <Icon name="x" size={14} /> : t === 'ajuste' ? <Icon name="money" size={14} /> : <Icon name="clipboard" size={14} />}
              {t === 'pending' ? 'Pendientes' : t === 'approved' ? 'Aprobadas' : t === 'rejected' ? 'Rechazadas' : t === 'ajuste' ? 'Ajuste Manual' : 'Movimientos'}
            </span>
          </button>
        ))}
      </div>

      {/* ── Ajuste Manual ──────────────────────────────────────────────────── */}
      {tab === 'ajuste' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-lg">
          <h2 className="text-base font-bold text-gray-800 mb-4">Ajuste manual de saldo</h2>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Driver / Técnico</label>
              {adjEmail ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-emerald-400 bg-emerald-50 rounded-lg text-sm">
                  <span className="flex-1 text-gray-800 font-medium truncate">{adjEmail}</span>
                  <button onClick={() => { setAdjEmail(''); setAdjSearch(''); setAdjBalance(null); }} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={adjSearch}
                    onChange={e => {
                      setAdjSearch(e.target.value);
                      if (adjDebounce.current) clearTimeout(adjDebounce.current);
                      adjDebounce.current = setTimeout(() => fetchUserSuggestions(e.target.value, setAdjSuggestions), 300);
                      setAdjShowDrop(true);
                    }}
                    onFocus={() => { if (adjSuggestions.length > 0) setAdjShowDrop(true); }}
                    onBlur={() => setTimeout(() => setAdjShowDrop(false), 150)}
                    placeholder="Buscar por nombre o email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-400"
                  />
                  {adjShowDrop && adjSuggestions.length > 0 && (
                    <ul className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {adjSuggestions.map(s => (
                        <li key={s.email}
                          onMouseDown={() => { setAdjEmail(s.email); setAdjSearch(''); setAdjShowDrop(false); fetchAdjBalance(s.email); }}
                          className="px-3 py-2.5 cursor-pointer hover:bg-amber-50 flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-gray-800">{s.name || s.email}</span>
                          {s.name && <span className="text-xs text-gray-400">{s.email}</span>}
                          <span className="text-xs text-gray-400 capitalize">{s.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Balance display */}
            {adjEmail && (
              <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                adjBalance === null ? 'bg-gray-50 border-gray-200' :
                adjBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo actual</span>
                {adjBalanceLoading ? (
                  <span className="text-sm text-gray-400">Cargando...</span>
                ) : adjBalance === null ? (
                  <span className="text-sm text-gray-400">Sin billetera registrada</span>
                ) : (
                  <span className={`text-lg font-black ${adjBalance > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmtGS(adjBalance)}
                  </span>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
              <div className="flex gap-2">
                <button onClick={() => setAdjType('credit')}
                  style={{ flex: 1, padding: '0.45rem', borderRadius: 8, border: `2px solid ${adjType === 'credit' ? '#10b981' : '#e5e7eb'}`, background: adjType === 'credit' ? '#f0fdf4' : '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', color: adjType === 'credit' ? '#059669' : '#6b7280' }}>
                  + Crédito
                </button>
                <button onClick={() => setAdjType('debit')}
                  style={{ flex: 1, padding: '0.45rem', borderRadius: 8, border: `2px solid ${adjType === 'debit' ? '#ef4444' : '#e5e7eb'}`, background: adjType === 'debit' ? '#fff5f5' : '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', color: adjType === 'debit' ? '#dc2626' : '#6b7280' }}>
                  − Débito
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Monto (Gs)</label>
              <input
                type="text"
                inputMode="numeric"
                value={adjAmount ? parseInt(adjAmount.replace(/\./g, ''), 10).toLocaleString('es-PY') : ''}
                onChange={e => {
                  const raw = e.target.value.replace(/\./g, '').replace(/\D/g, '');
                  setAdjAmount(raw);
                }}
                placeholder="50.000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Nota (opcional)</label>
              <input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)}
                placeholder="Corrección de error, bono, penalidad..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-400" />
            </div>
            <button onClick={handleAdjust} disabled={adjSaving || !adjEmail.trim() || !adjAmount}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {adjSaving ? 'Procesando...' : `Aplicar ${adjType === 'credit' ? 'crédito' : 'débito'}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Movimientos por driver ──────────────────────────────────────────── */}
      {tab === 'movimientos' && (
        <div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 max-w-lg">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                {movEmailInput ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-emerald-400 bg-emerald-50 rounded-lg text-sm">
                    <span className="flex-1 text-gray-800 font-medium truncate">{movEmailInput}</span>
                    <button onClick={() => { setMovEmailInput(''); setMovSearch(''); setMovWallet(null); }} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={movSearch}
                      onChange={e => {
                        setMovSearch(e.target.value);
                        if (movDebounce.current) clearTimeout(movDebounce.current);
                        movDebounce.current = setTimeout(() => fetchUserSuggestions(e.target.value, setMovSuggestions), 300);
                        setMovShowDrop(true);
                      }}
                      onFocus={() => { if (movSuggestions.length > 0) setMovShowDrop(true); }}
                      onBlur={() => setTimeout(() => setMovShowDrop(false), 150)}
                      placeholder="Buscar por nombre o email..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] placeholder:text-gray-400"
                    />
                    {movShowDrop && movSuggestions.length > 0 && (
                      <ul className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {movSuggestions.map(s => (
                          <li key={s.email}
                            onMouseDown={() => { setMovEmailInput(s.email); setMovSearch(''); setMovShowDrop(false); }}
                            className="px-3 py-2.5 cursor-pointer hover:bg-amber-50 flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-gray-800">{s.name || s.email}</span>
                            {s.name && <span className="text-xs text-gray-400">{s.email}</span>}
                            <span className="text-xs text-gray-400 capitalize">{s.role}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <button onClick={() => loadMovimientos(movEmailInput)} disabled={movLoading || !movEmailInput}
                className="px-4 py-2 rounded-lg bg-[#F5C518] text-black text-sm font-bold disabled:opacity-50 hover:bg-[#E6A800] transition-colors flex-shrink-0">
                {movLoading ? '...' : 'Ver'}
              </button>
            </div>
          </div>
          {movWallet && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 font-semibold">SALDO ACTUAL</p>
                  <p className="text-2xl font-black text-gray-800">{fmtGS(movWallet.balance)}</p>
                </div>
                <p className="text-xs text-gray-400">{movEmail}</p>
              </div>
              {movWallet.transactions.length === 0 ? (
                <p className="text-center text-gray-400 text-sm p-8">Sin transacciones registradas</p>
              ) : (
                <div>
                  {movWallet.transactions.map((tx, i) => {
                    const cfg = TX_TYPE_LABELS[tx.type] ?? { label: tx.type, color: '#6b7280' };
                    return (
                      <div key={tx.id} style={{ padding: '0.75rem 1.25rem', borderBottom: i < movWallet.transactions.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{cfg.label}</span>
                          {tx.note && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: '0.9rem', color: tx.amount > 0 ? '#059669' : '#dc2626' }}>
                            {tx.amount > 0 ? '+' : ''}{fmtGS(tx.amount)}
                          </p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{fmtDate(tx.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(tab === 'pending' || tab === 'approved' || tab === 'rejected') && (
      <>
      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center text-gray-400">Cargando...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Icon name={tab === 'pending' ? 'trophy' : 'clipboard'} size={28} className="text-gray-400" />
          </div>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="camera" size={14} />
                      Ver comprobante
                    </span>
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
                      {actionId === req.id ? '...' : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="check" size={14} />
                          Aprobar
                        </span>
                      )}
                    </button>
                    <button
                      disabled={actionId === req.id}
                      onClick={() => { setRejectTarget(req.id); setRejectNote(''); }}
                      style={{
                        padding: '0.45rem 1rem', borderRadius: 8, border: 'none',
                        background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="x" size={14} />
                        Rechazar
                      </span>
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
      </>
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
