'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Report {
  id: string;
  reporter_email: string;
  reporter_role: string;
  reported_email: string;
  reported_role: string;
  reference_type: string;
  reference_id: string;
  reason: string;
  comment: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const REASON_LABELS: Record<string, string> = {
  no_llego:           '🚫 No llegó / No apareció',
  cobro_indebido:     '💸 Cobro indebido',
  mal_comportamiento: '😡 Mal comportamiento',
  fraude:             '⚠️ Fraude / Estafa',
  pago_no_realizado:  '💳 Pago no realizado',
  maltrato:           '🆘 Maltrato / Agresión',
  otro:               '📝 Otro motivo',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pendiente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  reviewing:  { label: 'Revisando', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  resolved:   { label: 'Resuelto',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  dismissed:  { label: 'Descartado',color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
};

const ROLE_LABELS: Record<string, string> = {
  cliente: '👤 Cliente',
  driver:  '🚗 Driver',
  tecnico: '🔧 Técnico',
};

type StatusFilter = 'all' | 'pending' | 'reviewing' | 'resolved' | 'dismissed';

export default function AdminReportsPage() {
  const [reports, setReports]     = useState<Report[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatus] = useState<StatusFilter>('pending');
  const [page, setPage]           = useState(0);
  const LIMIT = 20;

  // Selected report for detail panel
  const [selected, setSelected]   = useState<Report | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(page * LIMIT),
    });
    if (statusFilter !== 'all') params.set('status', statusFilter);

    const res = await fetch(`/api/reports?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setReports(Array.isArray(json.reports) ? json.reports : []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const updateStatus = async (id: string, status: string) => {
    setSaving(true);
    setSaveMsg('');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch('/api/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status, admin_note: adminNote }),
    });
    if (res.ok) {
      setSaveMsg('✅ Guardado');
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: status as Report['status'], admin_note: adminNote || r.admin_note } : r));
      setSelected(prev => prev?.id === id ? { ...prev, status: status as Report['status'], admin_note: adminNote || prev.admin_note } : prev);
    } else {
      setSaveMsg('❌ Error al guardar');
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'pending',   label: 'Pendientes' },
    { key: 'reviewing', label: 'Revisando' },
    { key: 'resolved',  label: 'Resueltos' },
    { key: 'dismissed', label: 'Descartados' },
    { key: 'all',       label: 'Todos' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🚨 Reportes y Reclamos</h1>
        <p className="text-sm text-gray-500 mt-1">Gestión de reportes enviados por clientes, drivers y técnicos.</p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(0); }}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
              statusFilter === t.key
                ? 'bg-[#F5C518] text-[#1C1C2E] border-[#F5C518] shadow'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
        {/* Reports list */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Cargando reportes…</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16 text-gray-400">Sin reportes en esta categoría.</div>
          ) : reports.map(r => {
            const sc = STATUS_CONFIG[r.status];
            return (
              <div
                key={r.id}
                onClick={() => { setSelected(r); setAdminNote(r.admin_note || ''); setSaveMsg(''); }}
                className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer hover:border-[#F5C518] hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">{REASON_LABELS[r.reason]}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: sc.color, background: sc.bg }}
                      >
                        {sc.label}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>
                        <span className="font-medium">Reportó:</span> {ROLE_LABELS[r.reporter_role]} — {r.reporter_email}
                      </div>
                      <div>
                        <span className="font-medium">Reportado:</span> {ROLE_LABELS[r.reported_role]} — {r.reported_email}
                      </div>
                      <div>
                        <span className="font-medium">Ref:</span>{' '}
                        <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
                          {r.reference_type.toUpperCase()} {r.reference_id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>

                    {r.comment && (
                      <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(r.created_at)}</span>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-500">{total} reportes</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50"
                >← Anterior</button>
                <button
                  disabled={(page + 1) * LIMIT >= total}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40 hover:bg-gray-50"
                >Siguiente →</button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 h-fit sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Detalle del reporte</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
              >✕</button>
            </div>

            <div className="space-y-2 text-sm text-gray-700 mb-4">
              <div><span className="font-semibold">Motivo:</span> {REASON_LABELS[selected.reason]}</div>
              <div><span className="font-semibold">Estado:</span>{' '}
                <span style={{ color: STATUS_CONFIG[selected.status].color }}>
                  {STATUS_CONFIG[selected.status].label}
                </span>
              </div>
              <div><span className="font-semibold">Reportó:</span> {ROLE_LABELS[selected.reporter_role]} — {selected.reporter_email}</div>
              <div><span className="font-semibold">Reportado:</span> {ROLE_LABELS[selected.reported_role]} — {selected.reported_email}</div>
              <div>
                <span className="font-semibold">Referencia:</span>{' '}
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{selected.reference_type.toUpperCase()}</span>{' '}
                <span className="font-mono text-xs">{selected.reference_id}</span>
              </div>
              <div><span className="font-semibold">Fecha:</span> {fmtDate(selected.created_at)}</div>
              {selected.resolved_at && (
                <div><span className="font-semibold">Resuelto:</span> {fmtDate(selected.resolved_at)}</div>
              )}
            </div>

            {selected.comment && (
              <div className="mb-4 text-sm bg-gray-50 rounded-lg p-3 text-gray-600">
                <p className="font-semibold text-gray-700 mb-1">Comentario del usuario:</p>
                &ldquo;{selected.comment}&rdquo;
              </div>
            )}

            {/* Admin note */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Nota interna
              </label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Añadir nota interna sobre la resolución…"
                rows={3}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none focus:ring-2 focus:ring-[#F5C518] focus:outline-none"
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {selected.status !== 'reviewing' && (
                <button
                  disabled={saving}
                  onClick={() => updateStatus(selected.id, 'reviewing')}
                  className="w-full py-2 rounded-lg text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                >
                  🔍 Marcar como Revisando
                </button>
              )}
              {selected.status !== 'resolved' && (
                <button
                  disabled={saving}
                  onClick={() => updateStatus(selected.id, 'resolved')}
                  className="w-full py-2 rounded-lg text-sm font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50"
                >
                  ✅ Marcar como Resuelto
                </button>
              )}
              {selected.status !== 'dismissed' && (
                <button
                  disabled={saving}
                  onClick={() => updateStatus(selected.id, 'dismissed')}
                  className="w-full py-2 rounded-lg text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                >
                  🗑️ Descartar
                </button>
              )}
              {saveMsg && (
                <p className="text-center text-sm font-semibold" style={{ color: saveMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>
                  {saveMsg}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
