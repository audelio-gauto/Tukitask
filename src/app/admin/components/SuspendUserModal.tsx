'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  suspension_duration: string | null;
  suspension_label: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  banned_until: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Cliente',
  driver: 'Conductor',
  tecnico: 'Técnico',
};

const ROLE_COLORS: Record<string, string> = {
  cliente: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  driver: 'bg-amber-50 text-amber-700 border-amber-200',
  tecnico: 'bg-sky-50 text-sky-700 border-sky-200',
};

const DURATIONS = [
  { key: '1d', label: '1 Día', desc: '24 horas' },
  { key: '1m', label: '1 Mes', desc: '30 días' },
  { key: '1y', label: '1 Año', desc: '365 días' },
  { key: 'permanent', label: 'Permanente', desc: 'Sin fecha de fin' },
] as const;

interface Props {
  target: SuspendTarget;
  onClose: () => void;
  onComplete?: () => void;
}

export default function SuspendUserModal({ target, onClose, onComplete }: Props) {
  const [status, setStatus] = useState<SuspensionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [selectedDuration, setSelectedDuration] = useState<string>('1d');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'main' | 'confirm-suspend' | 'confirm-reactivate'>('main');
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
        const json = await res.json();
        setStatus(json);
      }
    } catch { /* ignore */ }
    setLoadingStatus(false);
  }, [target.user_id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSuspend = async () => {
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
          duration: selectedDuration,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: `Cuenta suspendida — ${json.label}` });
        await fetchStatus();
        setStep('main');
        onComplete?.();
      } else {
        setResult({ ok: false, msg: json.error || 'Error al suspender' });
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
        body: JSON.stringify({
          user_id: target.user_id,
          action: 'reactivate',
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ ok: true, msg: 'Cuenta reactivada exitosamente' });
        await fetchStatus();
        setStep('main');
        onComplete?.();
      } else {
        setResult({ ok: false, msg: json.error || 'Error al reactivar' });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    }
    setSaving(false);
  };

  const isSuspended = status?.is_suspended || status?.is_blocked;
  const initials = (target.display_name?.[0] || target.email[0])?.toUpperCase() || '?';
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-PY', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Gestión de Cuenta</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* User card */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            {target.profile_photo ? (
              <img src={target.profile_photo} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold text-lg ring-2 ring-white shadow">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {target.display_name && (
                <p className="text-sm font-semibold text-gray-900 truncate">{target.display_name}</p>
              )}
              <p className="text-xs text-gray-500 truncate">{target.email}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_COLORS[target.role] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {ROLE_LABELS[target.role] || target.role}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* Loading */}
          {loadingStatus && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Status banner */}
          {!loadingStatus && status && (
            <>
              {isSuspended ? (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-bold text-red-800">
                      {status.is_blocked ? 'Bloqueado Permanentemente' : 'Cuenta Suspendida'}
                    </span>
                  </div>
                  {status.suspension_label && (
                    <p className="text-xs text-red-600 ml-[18px]">Duración: {status.suspension_label}</p>
                  )}
                  {status.suspension_reason && (
                    <p className="text-xs text-red-600 ml-[18px]">Motivo: {status.suspension_reason}</p>
                  )}
                  {status.banned_until && !status.is_blocked && (
                    <p className="text-xs text-red-600 ml-[18px]">Hasta: {fmtDate(status.banned_until)}</p>
                  )}
                  {status.suspended_by && (
                    <p className="text-xs text-red-400 ml-[18px] mt-1">Por: {status.suspended_by}</p>
                  )}
                  {status.suspended_at && (
                    <p className="text-xs text-red-400 ml-[18px]">Fecha: {fmtDate(status.suspended_at)}</p>
                  )}
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-emerald-800">Cuenta Activa</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Result message */}
          {result && (
            <div className={`mb-4 p-3 rounded-xl text-sm font-semibold ${
              result.ok
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {result.msg}
            </div>
          )}

          {/* Main view */}
          {!loadingStatus && step === 'main' && (
            <div className="space-y-3">
              {/* Suspend button */}
              <button
                onClick={() => { setStep('confirm-suspend'); setResult(null); }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 group-hover:bg-red-200 transition-colors">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">Suspender Cuenta</p>
                  <p className="text-xs text-gray-500">Bloquear acceso por tiempo definido</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Reactivate button — only when suspended */}
              {isSuspended && (
                <button
                  onClick={() => { setStep('confirm-reactivate'); setResult(null); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">Reactivar Cuenta</p>
                    <p className="text-xs text-gray-500">Levantar la suspensión actual</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Confirm suspend step */}
          {step === 'confirm-suspend' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('main')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver
              </button>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                  Duración de la suspensión
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setSelectedDuration(d.key)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedDuration === d.key
                          ? d.key === 'permanent'
                            ? 'border-red-500 bg-red-50'
                            : 'border-[#F5C518] bg-yellow-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className={`text-sm font-bold ${
                        selectedDuration === d.key
                          ? d.key === 'permanent' ? 'text-red-700' : 'text-gray-900'
                          : 'text-gray-700'
                      }`}>
                        {d.label}
                      </p>
                      <p className="text-[11px] text-gray-500">{d.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Motivo (opcional)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Describe el motivo de la suspensión..."
                  maxLength={500}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] focus:outline-none text-gray-800 placeholder:text-gray-400"
                />
              </div>

              {selectedDuration === 'permanent' && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700 font-semibold">
                    ⚠️ Esta acción bloqueará permanentemente el acceso del usuario. Solo podrá revertirse manualmente.
                  </p>
                </div>
              )}

              <button
                onClick={handleSuspend}
                disabled={saving}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                  selectedDuration === 'permanent'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-[#F5C518] text-[#1d2327] hover:bg-yellow-400'
                }`}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </span>
                ) : (
                  `Confirmar Suspensión — ${DURATIONS.find(d => d.key === selectedDuration)?.label}`
                )}
              </button>
            </div>
          )}

          {/* Confirm reactivate step */}
          {step === 'confirm-reactivate' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('main')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver
              </button>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <svg className="w-12 h-12 mx-auto mb-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-semibold text-emerald-800 mb-1">¿Reactivar esta cuenta?</p>
                <p className="text-xs text-emerald-600">
                  Se levantará la suspensión y el usuario podrá acceder nuevamente.
                </p>
              </div>

              <button
                onClick={handleReactivate}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </span>
                ) : 'Confirmar Reactivación'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-600 font-medium hover:text-gray-900 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
