'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type QueueMode = 'disputas' | 'reembolsos';
type SlaFilter = 'all' | 'today' | 'overdue' | 'high_risk';
type NoteSeverity = 'critical' | 'high' | 'medium' | 'low';

type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

interface ReportRow {
  id: string;
  reporter_email: string;
  reported_email: string;
  reference_type: string;
  reference_id: string;
  reason: string;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
}

interface RefundRow {
  id: string;
  user_id: string | null;
  driver_email: string | null;
  amount: number;
  status: string;
  description: string | null;
  note: string | null;
  created_at: string;
}

const HIGH_RISK_REASONS = new Set(['fraude', 'maltrato', 'cobro_indebido', 'pago_no_realizado']);
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtGs = (n: number) => `Gs ${Math.abs(n).toLocaleString('es-PY')}`;

const SEVERITY_UI: Record<NoteSeverity, { label: string; tone: string }> = {
  critical: { label: 'CRITICO', tone: 'bg-red-200 text-red-900' },
  high: { label: 'ALTO', tone: 'bg-orange-100 text-orange-800' },
  medium: { label: 'MEDIO', tone: 'bg-amber-100 text-amber-800' },
  low: { label: 'BAJO', tone: 'bg-gray-100 text-gray-600' },
};

const SEVERITY_RANK: Record<NoteSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function detectNoteSeverity(note: string | null): NoteSeverity {
  if (!note) return 'low';
  const n = note.toLowerCase();

  if (
    n.includes('fraude')
    || n.includes('estafa')
    || n.includes('robo')
    || n.includes('violencia')
    || n.includes('agresion')
    || n.includes('amenaza')
  ) return 'critical';

  if (
    n.includes('maltrato')
    || n.includes('acoso')
    || n.includes('cobro indebido')
    || n.includes('pago no realizado')
    || n.includes('riesgo')
  ) return 'high';

  if (
    n.includes('incumpl')
    || n.includes('demora')
    || n.includes('retras')
    || n.includes('error')
  ) return 'medium';

  return 'low';
}

function extractRefundAuditNote(note: string | null): string | null {
  if (!note) return null;
  const m = note.match(/^admin:(approved|rejected):(.*)$/i);
  if (!m) return null;
  return m[2]?.trim() || null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isOverdue(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 24 * 60 * 60 * 1000;
}

export default function QueueBoard({ mode }: { mode: QueueMode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [dismissTarget, setDismissTarget] = useState<ReportRow | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [rejectRefundTarget, setRejectRefundTarget] = useState<RefundRow | null>(null);
  const [rejectRefundReason, setRejectRefundReason] = useState('');
  const [sla, setSla] = useState<SlaFilter>('all');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);

  useEffect(() => {
    let alive = true;
    let timerId: number | null = null;

    const load = async () => {
      setLoading(true);
      setError('');

      if (mode === 'disputas') {
        const { data, error: reportsError } = await supabase
          .from('reports')
          .select('id, reporter_email, reported_email, reference_type, reference_id, reason, status, admin_note, created_at')
          .eq('reference_type', 'order')
          .in('status', ['pending', 'reviewing'])
          .order('created_at', { ascending: false })
          .limit(200);

        if (!alive) return;
        if (reportsError) {
          setError(reportsError.message);
          setReports([]);
        } else {
          setReports((data ?? []) as ReportRow[]);
        }
      } else {
        const { data, error: refundsError } = await supabase
          .from('wallet_transactions')
          .select('id, user_id, driver_email, amount, status, description, note, created_at')
          .eq('type', 'refund')
          .in('status', ['pending', 'approved', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(200);

        if (!alive) return;
        if (refundsError) {
          setError(refundsError.message);
          setRefunds([]);
        } else {
          setRefunds((data ?? []) as RefundRow[]);
        }
      }

      if (alive) setLoading(false);
    };

    load().catch((err: unknown) => {
      if (!alive) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });

    timerId = window.setInterval(() => {
      load().catch(() => undefined);
    }, 60000);

    return () => {
      alive = false;
      if (timerId) window.clearInterval(timerId);
    };
  }, [mode]);

  const patchReportStatus = async (
    id: string,
    status: Extract<ReportStatus, 'reviewing' | 'resolved' | 'dismissed'>,
    adminNote?: string,
  ) => {
    setActingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status, admin_note: adminNote ?? '' }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'No se pudo actualizar la disputa');
      }

      setReports(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
      setNotice({ ok: true, text: `Disputa actualizada a ${status}` });
    } catch (err: unknown) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setActingId(null);
    }
  };

  const patchRefundStatus = async (id: string, status: 'approved' | 'rejected', auditNote?: string) => {
    setActingId(id);
    try {
      const { error: updateError } = await supabase
        .from('wallet_transactions')
        .update({
          status,
          note: auditNote && auditNote.trim() ? `admin:${status}:${auditNote.trim()}` : undefined,
        })
        .eq('id', id)
        .eq('type', 'refund');

      if (updateError) throw updateError;

      setRefunds(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
      setNotice({ ok: true, text: `Reembolso ${status === 'approved' ? 'aprobado' : 'rechazado'}` });
    } catch (err: unknown) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setActingId(null);
    }
  };

  const confirmDismissReport = async () => {
    if (!dismissTarget) return;
    const reason = dismissReason.trim();
    if (!reason) {
      setNotice({ ok: false, text: 'El motivo para descartar es obligatorio.' });
      return;
    }
    await patchReportStatus(dismissTarget.id, 'dismissed', reason);
    setDismissTarget(null);
    setDismissReason('');
  };

  const confirmRejectRefund = async () => {
    if (!rejectRefundTarget) return;
    const reason = rejectRefundReason.trim();
    if (!reason) {
      setNotice({ ok: false, text: 'El motivo de rechazo es obligatorio.' });
      return;
    }
    await patchRefundStatus(rejectRefundTarget.id, 'rejected', reason);
    setRejectRefundTarget(null);
    setRejectRefundReason('');
  };

  const filteredReports = useMemo(() => {
    const base = reports.filter(r => {
      if (sla === 'today') return isToday(r.created_at);
      if (sla === 'overdue') return isOverdue(r.created_at);
      if (sla === 'high_risk') return HIGH_RISK_REASONS.has(r.reason);
      return true;
    });

    return [...base].sort((a, b) => {
      const sa = SEVERITY_RANK[detectNoteSeverity(a.admin_note)];
      const sb = SEVERITY_RANK[detectNoteSeverity(b.admin_note)];
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [reports, sla]);

  const filteredRefunds = useMemo(() => {
    const base = refunds.filter(r => {
      if (sla === 'today') return isToday(r.created_at);
      if (sla === 'overdue') return r.status === 'pending' && isOverdue(r.created_at);
      if (sla === 'high_risk') return r.status === 'pending' && Math.abs(r.amount ?? 0) >= 200000;
      return true;
    });

    return [...base].sort((a, b) => {
      const sa = SEVERITY_RANK[detectNoteSeverity(extractRefundAuditNote(a.note))];
      const sb = SEVERITY_RANK[detectNoteSeverity(extractRefundAuditNote(b.note))];
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [refunds, sla]);

  const stats = useMemo(() => {
    if (mode === 'disputas') {
      return {
        total: reports.length,
        pending: reports.filter(r => r.status === 'pending').length,
        overdue: reports.filter(r => isOverdue(r.created_at)).length,
        highRisk: reports.filter(r => HIGH_RISK_REASONS.has(r.reason)).length,
      };
    }

    return {
      total: refunds.length,
      pending: refunds.filter(r => r.status === 'pending').length,
      overdue: refunds.filter(r => r.status === 'pending' && isOverdue(r.created_at)).length,
      highRisk: refunds.filter(r => r.status === 'pending' && Math.abs(r.amount ?? 0) >= 200000).length,
    };
  }, [mode, reports, refunds]);

  const rows = mode === 'disputas' ? filteredReports : filteredRefunds;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/pedidos" className="hover:text-gray-600 transition-colors">Pedidos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">{mode === 'disputas' ? 'Disputas' : 'Reembolsos'}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{mode === 'disputas' ? 'Bandeja de Disputas' : 'Bandeja de Reembolsos'}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {mode === 'disputas'
            ? 'Cola operativa real de reclamos abiertos para revisión y resolución.'
            : 'Cola operativa real de solicitudes de reembolso para aprobación o rechazo.'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Abiertos pendientes</p>
          <p className="text-xl font-bold text-amber-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Vencidos (+24h)</p>
          <p className="text-xl font-bold text-red-600">{stats.overdue}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[11px] text-gray-500">Alto riesgo</p>
          <p className="text-xl font-bold text-fuchsia-600">{stats.highRisk}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'today', label: 'Hoy' },
          { key: 'overdue', label: 'Vencidos' },
          { key: 'high_risk', label: 'Alto riesgo' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setSla(f.key as SlaFilter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              sla === f.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando bandeja...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <p className="text-sm font-medium text-gray-400">No hay casos para este filtro</p>
            <p className="text-xs text-gray-300 mt-1">Probá otro filtro de SLA</p>
          </div>
        ) : mode === 'disputas' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reportante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reportado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredReports.map(r => {
                const highRisk = HIGH_RISK_REASONS.has(r.reason);
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${highRisk ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {highRisk ? 'ALTO' : 'NORMAL'}
                        </span>
                        <span className="text-gray-700 text-xs">{r.reason}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.reporter_email}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.reported_email}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {r.status}
                        </span>
                        {r.admin_note && (
                          <div className="flex items-center gap-1.5 max-w-[240px]">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${SEVERITY_UI[detectNoteSeverity(r.admin_note)].tone}`}>
                              {SEVERITY_UI[detectNoteSeverity(r.admin_note)].label}
                            </span>
                            <p className="text-[11px] text-gray-500 truncate" title={r.admin_note}>
                              Nota: {r.admin_note}
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'pending' && (
                          <button
                            onClick={() => patchReportStatus(r.id, 'reviewing')}
                            disabled={actingId === r.id}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Revisar
                          </button>
                        )}
                        {(r.status === 'pending' || r.status === 'reviewing') && (
                          <>
                            <button
                              onClick={() => patchReportStatus(r.id, 'resolved')}
                              disabled={actingId === r.id}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Resolver
                            </button>
                            <button
                              onClick={() => {
                                setDismissTarget(r);
                                setDismissReason('');
                              }}
                              disabled={actingId === r.id}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
                            >
                              Descartar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Solicitud</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRefunds.map(r => {
                const highRisk = r.status === 'pending' && Math.abs(r.amount ?? 0) >= 200000;
                const auditNote = extractRefundAuditNote(r.note);
                const noteSeverity = detectNoteSeverity(auditNote);
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${highRisk ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {highRisk ? 'ALTO' : 'NORMAL'}
                        </span>
                        <span className="font-mono">{(r.user_id ?? r.driver_email ?? '—').slice(0, 16)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900">{fmtGs(r.amount ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        r.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : r.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[320px]">
                      <p className="truncate" title={r.description || r.note || '—'}>{r.description || r.note || '—'}</p>
                      {auditNote && (
                        <div className="mt-1 flex items-center gap-1.5 max-w-[300px]">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${SEVERITY_UI[noteSeverity].tone}`}>
                            {SEVERITY_UI[noteSeverity].label}
                          </span>
                          <p className="text-[11px] text-gray-600 truncate" title={auditNote}>Nota auditoría: {auditNote}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => patchRefundStatus(r.id, 'approved')}
                              disabled={actingId === r.id}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => {
                                setRejectRefundTarget(r);
                                setRejectRefundReason('');
                              }}
                              disabled={actingId === r.id}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-gray-400">Sin acción</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dismissTarget && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-xl p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Descartar disputa</h3>
            <p className="text-xs text-gray-500 mb-3">Debes registrar un motivo para auditoría.</p>
            <textarea
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              rows={4}
              placeholder="Escribe el motivo de descarte..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setDismissTarget(null);
                  setDismissReason('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDismissReport}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-black"
              >
                Confirmar descarte
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectRefundTarget && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-xl p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Rechazar reembolso</h3>
            <p className="text-xs text-gray-500 mb-3">Debes registrar un motivo para auditoría.</p>
            <textarea
              value={rejectRefundReason}
              onChange={e => setRejectRefundReason(e.target.value)}
              rows={4}
              placeholder="Escribe el motivo del rechazo..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setRejectRefundTarget(null);
                  setRejectRefundReason('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRejectRefund}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
