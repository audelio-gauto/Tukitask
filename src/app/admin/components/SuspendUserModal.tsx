'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

export interface SuspendTarget {
  user_id: string;
  email: string;
  role: string;
  display_name?: string | null;
  profile_photo?: string | null;
}

interface SuspensionStatus {
  is_suspended: boolean;
  is_blocked: boolean;
  is_active: boolean;
  suspension_reason: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  banned_until: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Cliente', driver: 'Conductor', tecnico: 'Técnico',
};
const ROLE_COLORS: Record<string, string> = {
  cliente: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  driver: 'bg-amber-50 text-amber-700 border-amber-200',
  tecnico: 'bg-sky-50 text-sky-700 border-sky-200',
};

interface Props {
  target: SuspendTarget;
  onClose: () => void;
  onComplete?: () => void;
}

export default function SuspendUserModal({ target, onClose, onComplete }: Props) {
  const [status, setStatus] = useState<SuspensionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [days, setDays] = useState('');
  const [permanent, setPermanent] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/suspend?user_id=${target.user_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[SuspendModal] status:', data);
        setStatus(data);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[SuspendModal] status error:', res.status, err);
        setResult({ ok: false, msg: err.error || `Error ${res.status}` });
      }
    } catch (e) {
      console.error('[SuspendModal] fetch error:', e);
    }
    setLoadingStatus(false);
  }, [target.user_id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSuspend = async () => {
    const numDays = permanent ? 0 : parseInt(days);
    if (!permanent && (!numDays || numDays < 1)) return;
    setSaving(true);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: target.user_id,
          action: 'suspend',
          days: numDays,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      console.log('[SuspendModal] suspend result:', res.status, json);
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: `Cuenta suspendida — ${json.label}` });
        await fetchStatus();
        onComplete?.();
      } else {
        setResult({ ok: false, msg: json.error || `Error ${res.status}` });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    }
    setSaving(false);
  };

  const handleReactivate = async () => {
    setSaving(true);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: target.user_id, action: 'reactivate' }),
      });
      const json = await res.json();
      console.log('[SuspendModal] reactivate result:', res.status, json);
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: 'Cuenta reactivada' });
        await fetchStatus();
        onComplete?.();
      } else {
        setResult({ ok: false, msg: json.error || `Error ${res.status}` });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    }
    setSaving(false);
  };

  const isSuspended = status?.is_suspended || status?.is_blocked || (status && !status.is_active);
  const initials = (target.display_name?.[0] || target.email[0])?.toUpperCase() || '?';
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-PY', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : null;
  const canSuspend = permanent || (parseInt(days) > 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Gestión de Cuenta</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm">
              <Icon name="x" size={12} />
            </button>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
            {target.profile_photo ? (
              <img src={target.profile_photo} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold">{initials}</div>
            )}
            <div className="flex-1 min-w-0">
              {target.display_name && <p className="text-sm font-semibold text-gray-900 truncate">{target.display_name}</p>}
              <p className="text-xs text-gray-500 truncate">{target.email}</p>
              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_COLORS[target.role] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {ROLE_LABELS[target.role] || target.role}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {loadingStatus && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Current status */}
          {!loadingStatus && status && (
            isSuspended ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-bold text-red-800">
                    {status.is_blocked ? 'Bloqueado Permanente' : 'Suspendido'}
                  </span>
                </div>
                {status.suspension_reason && <p className="text-xs text-red-600 ml-4">Motivo: {status.suspension_reason}</p>}
                {status.banned_until && !status.is_blocked && <p className="text-xs text-red-600 ml-4">Hasta: {fmtDate(status.banned_until)}</p>}
                {status.suspended_by && <p className="text-xs text-red-400 ml-4 mt-0.5">Por: {status.suspended_by}</p>}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-bold text-emerald-800">Cuenta Activa</span>
              </div>
            )
          )}

          {/* Result */}
          {result && (
            <div className={`p-2.5 rounded-xl text-sm font-semibold ${result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {result.msg}
            </div>
          )}

          {/* Suspend controls */}
          {!loadingStatus && (
            <>
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Suspender</label>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={days}
                      onChange={e => { setDays(e.target.value); setPermanent(false); }}
                      placeholder="Ej: 180"
                      disabled={permanent}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
                  </div>
                  <button
                    onClick={() => { setPermanent(!permanent); if (!permanent) setDays(''); }}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition-all whitespace-nowrap ${
                      permanent ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Permanente
                  </button>
                </div>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  maxLength={200}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] focus:outline-none mb-2"
                />
                <button
                  onClick={handleSuspend}
                  disabled={saving || !canSuspend}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40 ${
                    permanent ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#F5C518] text-[#1d2327] hover:bg-yellow-400'
                  }`}
                >
                  {saving ? 'Procesando...' : permanent ? 'Suspender Permanente' : `Suspender ${days ? days + ' días' : ''}`}
                </button>
              </div>

              {/* Reactivate */}
              {isSuspended && (
                <div className="border-t border-gray-100 pt-3">
                  <button
                    onClick={handleReactivate}
                    disabled={saving}
                    className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-40"
                  >
                    {saving ? 'Procesando...' : 'Revertir Suspensión'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
