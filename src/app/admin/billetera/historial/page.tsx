'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RechargeRecord {
  id: string;
  driver_email: string;
  amount: number;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
  created_at: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  total_amount_approved: number;
  total_amount_pending: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency', currency: 'PYG', maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-PY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fullName(r: RechargeRecord) {
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ');
  return name || '—';
}

const STATUS_CFG = {
  pending:  { label: 'Pendiente', bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  approved: { label: 'Aprobado',  bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
  rejected: { label: 'Rechazado', bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
};

const ROLE_CFG: Record<string, { label: string; bg: string; color: string }> = {
  driver:  { label: 'Driver',   bg: '#eff6ff', color: '#1d4ed8' },
  tecnico: { label: 'Técnico',  bg: '#f5f3ff', color: '#6d28d9' },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function RechargeHistoryPage() {
  const [records, setRecords]     = useState<RechargeRecord[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const LIMIT = 50;

  // Filters
  const [role, setRole]         = useState('all');
  const [status, setStatus]     = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Receipt modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Fetch ──
  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      role, status, page: String(p), limit: String(LIMIT),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo   && { date_to: dateTo }),
      ...(search   && { search }),
    });
    const res = await authFetch(`/api/admin/recharge-history?${params}`);
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setRecords(json.data ?? []);
    setTotal(json.total ?? 0);
    setStats(json.stats ?? null);
    setPage(p);
    setLoading(false);
  }, [role, status, dateFrom, dateTo, search]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  // Debounced search
  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 400);
  }

  // ── CSV Export ──
  function exportCSV() {
    const header = ['#', 'Nombre', 'Apellido', 'Correo', 'Rol', 'Monto (Gs)', 'Estado', 'Fecha/Hora', 'Revisado por'];
    const rows = records.map((r, i) => [
      String(i + 1 + (page - 1) * LIMIT),
      r.first_name ?? '',
      r.last_name ?? '',
      r.driver_email,
      r.role,
      String(r.amount),
      r.status,
      fmtDate(r.created_at),
      r.reviewed_by ?? '',
    ]);
    const csv = [header, ...rows].map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `recargas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / LIMIT);

  // ── Styles ──
  const S: Record<string, React.CSSProperties> = {
    card: { background: '#fff', borderRadius: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.07)', padding: '1.25rem' },
    th: { padding: '10px 12px', textAlign: 'left', fontSize: '0.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
    td: { padding: '12px 12px', fontSize: '0.875rem', color: '#334155', verticalAlign: 'middle', borderBottom: '1px solid #f8fafc' },
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Historial de Recargas
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
            Recargas de billetera solicitadas por drivers y técnicos
          </p>
        </div>
        <button
          onClick={exportCSV}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1.1rem',
            borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff',
            color: '#334155', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* ── Stats cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total solicitudes', value: stats?.total ?? '—', sub: null, accent: '#6366f1' },
          { label: 'Pendientes', value: stats?.pending ?? '—', sub: stats ? fmtGS(stats.total_amount_pending) : null, accent: '#f59e0b' },
          { label: 'Aprobadas', value: stats?.approved ?? '—', sub: stats ? fmtGS(stats.total_amount_approved) : null, accent: '#10b981' },
          { label: 'Rechazadas', value: stats?.rejected ?? '—', sub: null, accent: '#ef4444' },
        ].map(card => (
          <div key={card.label} style={{ ...S.card, borderTop: `4px solid ${card.accent}`, padding: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase' }}>{card.label}</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1 }}>{card.value}</p>
            {card.sub && <p style={{ fontSize: '0.78rem', color: card.accent, fontWeight: 600, marginTop: 4 }}>{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ ...S.card, marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        {/* Search */}
        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Buscar correo</label>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="ej: juan@email.com"
              style={{ width: '100%', paddingLeft: 28, padding: '0.5rem 0.75rem 0.5rem 28px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
        </div>

        {/* Role */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Rol</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'Todos'], ['driver', 'Driver'], ['tecnico', 'Técnico']].map(([v, lbl]) => (
              <button key={v} onClick={() => setRole(v)}
                style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, transition: 'all .15s',
                  background: role === v ? '#6366f1' : '#f1f5f9', color: role === v ? '#fff' : '#475569' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Estado</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'Todos'], ['pending', 'Pendiente'], ['approved', 'Aprobado'], ['rejected', 'Rechazado']].map(([v, lbl]) => (
              <button key={v} onClick={() => setStatus(v)}
                style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, transition: 'all .15s',
                  background: status === v ? '#0f172a' : '#f1f5f9', color: status === v ? '#fff' : '#475569' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Date from */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#334155', outline: 'none' }} />
        </div>

        {/* Date to */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#334155', outline: 'none' }} />
        </div>

        {/* Clear */}
        {(role !== 'all' || status !== 'all' || dateFrom || dateTo || search) && (
          <button onClick={() => { setRole('all'); setStatus('all'); setDateFrom(''); setDateTo(''); setSearch(''); setSearchInput(''); }}
            style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fff7f7', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {/* Table header info */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
            {loading ? 'Cargando…' : `${total} resultado${total !== 1 ? 's' : ''}`}
          </span>
          {totalPages > 1 && (
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              Página {page} de {totalPages}
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={S.th}>#</th>
                <th style={S.th}>Nombre y Apellido</th>
                <th style={S.th}>Correo</th>
                <th style={S.th}>Rol</th>
                <th style={{ ...S.th, textAlign: 'right' as const }}>Monto</th>
                <th style={S.th}>Estado</th>
                <th style={S.th}>Fecha / Hora</th>
                <th style={S.th}>Comprobante</th>
                <th style={S.th}>Revisado por</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ ...S.td, textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 18, height: 18, border: '2px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                      Cargando…
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...S.td, textAlign: 'center', padding: '3.5rem', color: '#94a3b8' }}>
                    <div>
                      <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔍</div>
                      <div style={{ fontWeight: 600, color: '#64748b' }}>Sin resultados</div>
                      <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Intentá ajustar los filtros</div>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r, i) => {
                  const stCfg  = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
                  const rolCfg = ROLE_CFG[r.role] ?? ROLE_CFG.driver;
                  const rowNum = (page - 1) * LIMIT + i + 1;
                  return (
                    <tr key={r.id} style={{ transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...S.td, color: '#94a3b8', fontWeight: 600, width: 40 }}>{rowNum}</td>

                      {/* Nombre */}
                      <td style={S.td}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{fullName(r)}</div>
                        {r.phone && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{r.phone}</div>}
                      </td>

                      {/* Correo */}
                      <td style={S.td}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#475569' }}>{r.driver_email}</span>
                      </td>

                      {/* Rol */}
                      <td style={S.td}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: rolCfg.bg, color: rolCfg.color }}>
                          {rolCfg.label}
                        </span>
                      </td>

                      {/* Monto */}
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {fmtGS(r.amount)}
                      </td>

                      {/* Estado */}
                      <td style={S.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: stCfg.bg, color: stCfg.color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: stCfg.dot, display: 'inline-block', flexShrink: 0 }} />
                          {stCfg.label}
                        </span>
                        {r.status === 'rejected' && r.rejection_note && (
                          <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.rejection_note}>
                            {r.rejection_note}
                          </div>
                        )}
                      </td>

                      {/* Fecha */}
                      <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748b' }}>
                        {fmtDate(r.created_at)}
                      </td>

                      {/* Comprobante */}
                      <td style={S.td}>
                        {r.receipt_url ? (
                          <button onClick={() => setPreviewUrl(r.receipt_url)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Ver
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>—</span>
                        )}
                      </td>

                      {/* Revisado por */}
                      <td style={{ ...S.td, fontSize: '0.78rem', color: '#94a3b8' }}>
                        {r.reviewed_by ? (
                          <div>
                            <div style={{ color: '#475569', fontWeight: 600 }}>{r.reviewed_by}</div>
                            {r.reviewed_at && <div style={{ fontSize: '0.72rem', marginTop: 2 }}>{fmtDate(r.reviewed_at)}</div>}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={page === 1}
                onClick={() => fetchData(page - 1)}
                style={{ padding: '0.4rem 0.85rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, color: '#334155' }}>
                ← Anterior
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button key={p} onClick={() => fetchData(p)}
                    style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid ' + (p === page ? '#6366f1' : '#e2e8f0'), background: p === page ? '#6366f1' : '#fff', color: p === page ? '#fff' : '#334155', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => fetchData(page + 1)}
                style={{ padding: '0.4rem 0.85rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, color: '#334155' }}>
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Receipt modal ── */}
      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <div style={{ background: '#fff', borderRadius: 16, padding: '1rem', maxWidth: '90vw', maxHeight: '90vh', boxShadow: '0 25px 60px rgba(0,0,0,0.4)', position: 'relative' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)}
              style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b', marginBottom: 8, marginRight: 36 }}>Comprobante de pago</p>
            <img src={previewUrl} alt="comprobante" style={{ maxWidth: '80vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
            <a href={previewUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 10, textAlign: 'center', fontSize: '0.8rem', color: '#6366f1', fontWeight: 600 }}>
              Abrir en nueva pestaña ↗
            </a>
          </div>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
