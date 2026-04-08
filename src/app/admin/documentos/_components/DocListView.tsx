'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DocRecord {
  id: string;
  driver_email: string;
  role: 'driver' | 'tecnico';
  doc_type: string;
  file_path: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DOC_LABELS: Record<string, string> = {
  selfie_cedula: 'Selfie con cédula',
  cedula_frente: 'Cédula — frente',
  antecedentes:  'Antecedentes policiales',
  domicilio:     'Comprobante domicilio',
};

function docLabel(key: string): string {
  if (DOC_LABELS[key]) return DOC_LABELS[key];
  const parts = key.split('_');
  const vehicle = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const rest = parts.slice(1).join(' ');
  return `${vehicle} — ${rest.charAt(0).toUpperCase() + rest.slice(1)}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">✅ Aprobado</span>;
  if (status === 'rejected')
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">❌ Rechazado</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">⏳ Pendiente</span>;
}

// ─── Doc card ─────────────────────────────────────────────────────────────────
function DocCard({
  doc,
  token,
  onUpdate,
}: {
  doc: DocRecord;
  token: string;
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, previousStatus?: string) => Promise<{ conflict?: boolean }>;
}) {
  const [rejReason, setRejReason] = useState(doc.rejection_reason || '');
  const [showReject, setShowReject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  const fetchSignedUrl = async () => {
    if (signedUrl) { window.open(signedUrl, '_blank'); return; }
    setLoadingUrl(true);
    try {
      const res = await fetch(`/api/admin/documents?id=${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.signedUrl) {
        setSignedUrl(json.signedUrl);
        window.open(json.signedUrl, '_blank');
      }
    } catch {}
    setLoadingUrl(false);
  };

  const approve = async () => {
    setSaving(true); setConflict(false);
    const result = await onUpdate(doc.id, 'approved', undefined, doc.status);
    if (result.conflict) setConflict(true);
    setSaving(false);
  };

  const reject = async () => {
    if (!rejReason.trim()) return;
    setSaving(true); setConflict(false);
    const result = await onUpdate(doc.id, 'rejected', rejReason, doc.status);
    if (result.conflict) setConflict(true);
    else setShowReject(false);
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      {conflict && (
        <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ Otro admin modificó este documento. Actualizá la lista.
        </div>
      )}
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{docLabel(doc.doc_type)}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{doc.driver_email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              doc.role === 'tecnico' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
            }`}>
              {doc.role === 'tecnico' ? '🔧 Técnico' : '🚗 Driver'}
            </span>
            <StatusBadge status={doc.status} />
          </div>
        </div>
        <button
          onClick={fetchSignedUrl}
          disabled={loadingUrl}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition-colors disabled:opacity-50"
        >
          {loadingUrl ? '⏳' : '👁️ Ver'}
        </button>
      </div>

      {/* Meta */}
      <div className="text-[11px] text-gray-400 space-y-0.5">
        {doc.expires_at && (
          <p>📅 Vence: <span className="font-medium text-gray-600">{new Date(doc.expires_at).toLocaleDateString('es-PY')}</span></p>
        )}
        <p>Subido: {new Date(doc.created_at).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}</p>
        {doc.rejection_reason && (
          <p className="text-red-600 font-medium">Motivo: {doc.rejection_reason}</p>
        )}
      </div>

      {/* Actions */}
      {doc.status !== 'approved' && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={approve}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {saving ? '...' : '✅ Aprobar'}
          </button>
          <button
            onClick={() => setShowReject(s => !s)}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition-colors disabled:opacity-50"
          >
            ❌ Rechazar
          </button>
        </div>
      )}
      {doc.status === 'approved' && (
        <button
          onClick={() => setShowReject(s => !s)}
          disabled={saving}
          className="w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-colors disabled:opacity-50"
        >
          ↩️ Rechazar doc aprobado
        </button>
      )}
      {showReject && (
        <div className="space-y-2">
          <input
            type="text"
            value={rejReason}
            onChange={e => setRejReason(e.target.value.slice(0, 500))}
            placeholder="Motivo del rechazo (requerido)"
            maxLength={500}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-red-400"
          />
          <p className="text-[10px] text-gray-400 text-right">{rejReason.length}/500</p>
          <button
            onClick={reject}
            disabled={saving || !rejReason.trim()}
            className="w-full py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Confirmar rechazo'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── DocGrid ──────────────────────────────────────────────────────────────────
function DocGrid({
  docs,
  token,
  onUpdate,
}: {
  docs: DocRecord[];
  token: string;
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, previousStatus?: string) => Promise<{ conflict?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {docs.map(doc => <DocCard key={doc.id} doc={doc} token={token} onUpdate={onUpdate} />)}
    </div>
  );
}

// ─── Main reusable component ──────────────────────────────────────────────────
interface DocListViewProps {
  pageTitle: string;
  pageDescription: string;
  fixedStatus?: 'pending' | 'approved' | 'rejected';
  showTabs?: boolean;
}

export default function DocListView({
  pageTitle,
  pageDescription,
  fixedStatus,
  showTabs = false,
}: DocListViewProps) {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'tecnico'>('all');
  const [search, setSearch] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  const apiStatus = fixedStatus ?? (tab === 'all' ? 'all' : 'pending');

  const fetchDocs = useCallback(async (pageNum = 0, append = false) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/documents?status=${apiStatus}&page=${pageNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const incoming: DocRecord[] = json.docs || [];
      setDocs(prev => append ? [...prev, ...incoming] : incoming);
      setTotal(json.total ?? 0);
      setHasMore(json.hasMore ?? false);
      setPage(pageNum);
    } catch {}
    setLoading(false);
  }, [token, apiStatus]);

  useEffect(() => {
    if (token) { setPage(0); fetchDocs(0, false); }
  }, [token, fetchDocs]);

  const handleUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string, previousStatus?: string): Promise<{ conflict?: boolean }> => {
    if (!token) return {};
    const res = await fetch('/api/admin/documents', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, rejection_reason: reason, previous_status: previousStatus }),
    });
    if (res.status === 409) return { conflict: true };
    if (res.ok) {
      setDocs(prev =>
        prev.map(d => d.id === id ? { ...d, status, rejection_reason: reason ?? null } : d)
      );
    }
    return {};
  };

  // ── Client-side filtering ──
  const q = search.trim().toLowerCase();
  const filtered = docs.filter(d => {
    const matchRole   = roleFilter === 'all' || d.role === roleFilter;
    const matchSearch = !q || d.driver_email.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const pending  = filtered.filter(d => d.status === 'pending');
  const approved = filtered.filter(d => d.status === 'approved');
  const rejected = filtered.filter(d => d.status === 'rejected');

  const showGrouped = showTabs && tab === 'all';

  if (!token) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Title bar */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-gray-500 text-sm mt-1">{pageDescription} · <span className="font-semibold">{total} total</span></p>
        </div>
        <button
          onClick={() => fetchDocs(0, false)}
          className="px-4 py-2 rounded-xl bg-[#F5C518] text-[#1C1C2E] text-sm font-bold hover:bg-[#e6b800] transition-colors"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Search + Role filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por correo..."
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#F5C518] shadow-sm"
        />
        <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {(['all', 'driver', 'tecnico'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                roleFilter === r ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {r === 'all' ? 'Todos' : r === 'driver' ? '🚗 Driver' : '🔧 Técnico'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      {showTabs && (
        <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm mb-5 w-fit">
          {(['pending', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-bold transition-colors ${
                tab === t ? 'bg-[#F5C518] text-[#1C1C2E]' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'pending' ? '⏳ Pendientes' : '📋 Todos'}
            </button>
          ))}
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-gray-400 mb-4">
        {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}{q ? ` para "${q}"` : ''}
      </p>

      {/* Content */}
      {loading && docs.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">{q ? '🔍' : '🎉'}</div>
          <p className="font-medium">{q ? 'Sin resultados para esa búsqueda' : 'Sin documentos'}</p>
        </div>
      ) : showGrouped ? (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-3">⏳ Pendientes ({pending.length})</h2>
              <DocGrid docs={pending} token={token} onUpdate={handleUpdate} />
            </section>
          )}
          {approved.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wide mb-3">✅ Aprobados ({approved.length})</h2>
              <DocGrid docs={approved} token={token} onUpdate={handleUpdate} />
            </section>
          )}
          {rejected.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide mb-3">❌ Rechazados ({rejected.length})</h2>
              <DocGrid docs={rejected} token={token} onUpdate={handleUpdate} />
            </section>
          )}
        </div>
      ) : (
        <DocGrid docs={filtered} token={token} onUpdate={handleUpdate} />
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => fetchDocs(page + 1, true)}
            className="px-6 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
          >
            Cargar más
          </button>
        </div>
      )}
      {loading && docs.length > 0 && (
        <div className="flex justify-center mt-6">
          <div className="w-6 h-6 border-3 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
