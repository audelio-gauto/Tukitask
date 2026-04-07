'use client';
import { useState, useEffect, useCallback } from 'react';
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
  signedUrl: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DOC_LABELS: Record<string, string> = {
  selfie_cedula: 'Selfie con cédula',
  cedula_frente: 'Cédula — frente',
  cedula_dorso:  'Cédula — dorso',
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

// ─── Password gate ────────────────────────────────────────────────────────────
const DOCS_PASSWORD = 'AUDEga123***';
const SESSION_KEY   = 'admin_docs_unlocked';

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError]  = useState(false);
  const [show, setShow]    = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === DOCS_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setValue('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-gray-800">Sección restringida</h2>
          <p className="text-gray-500 text-sm mt-1">Ingresá la contraseña para acceder a los documentos</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Contraseña"
              autoFocus
              className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors pr-12 ${
                error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-[#F5C518] focus:bg-white'
              }`}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            >
              {show ? '🙈' : '👁️'}
            </button>
          </div>
          {error && <p className="text-red-600 text-xs text-center font-medium">Contraseña incorrecta</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#F5C518] text-[#1C1C2E] font-bold text-sm hover:bg-[#e6b800] transition-colors"
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Doc card ─────────────────────────────────────────────────────────────────
function DocCard({
  doc,
  onUpdate,
}: {
  doc: DocRecord;
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string) => Promise<void>;
}) {
  const [rejReason, setRejReason] = useState(doc.rejection_reason || '');
  const [showReject, setShowReject] = useState(false);
  const [saving, setSaving] = useState(false);

  const approve = async () => {
    setSaving(true);
    await onUpdate(doc.id, 'approved');
    setSaving(false);
  };

  const reject = async () => {
    setSaving(true);
    await onUpdate(doc.id, 'rejected', rejReason);
    setSaving(false);
    setShowReject(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
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
        {doc.signedUrl && (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition-colors"
          >
            👁️ Ver
          </a>
        )}
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
            onChange={e => setRejReason(e.target.value)}
            placeholder="Motivo del rechazo (opcional)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-red-400"
          />
          <button
            onClick={reject}
            disabled={saving}
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
  onUpdate,
}: {
  docs: DocRecord[];
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {docs.map(doc => <DocCard key={doc.id} doc={doc} onUpdate={onUpdate} />)}
    </div>
  );
}

// ─── Main reusable component ──────────────────────────────────────────────────
interface DocListViewProps {
  pageTitle: string;
  pageDescription: string;
  /** When set, only documents of this status are fetched and shown (no tabs). */
  fixedStatus?: 'pending' | 'approved' | 'rejected';
  /** Show tab bar to switch between Pendientes / Todos (main page only). */
  showTabs?: boolean;
}

export default function DocListView({
  pageTitle,
  pageDescription,
  fixedStatus,
  showTabs = false,
}: DocListViewProps) {
  const [unlocked, setUnlocked] = useState(false);

  // Persist unlock across sub-page navigation within same browser session
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') setUnlocked(true);
    } catch {}
  }, []);

  const handleUnlock = () => {
    setUnlocked(true);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
  };

  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'tecnico'>('all');
  const [search, setSearch] = useState('');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  const apiStatus = fixedStatus ?? (tab === 'all' ? 'all' : 'pending');

  const fetchDocs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/documents?status=${apiStatus}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setDocs(json.docs || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, apiStatus]);

  useEffect(() => {
    if (unlocked && token) fetchDocs();
  }, [unlocked, token, fetchDocs]);

  const handleUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string) => {
    if (!token) return;
    await fetch('/api/admin/documents', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, rejection_reason: reason }),
    });
    setDocs(prev =>
      prev.map(d => d.id === id ? { ...d, status, rejection_reason: reason ?? null } : d)
    );
  };

  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;

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

  // On fixed-status pages flat list; on tabs/all grouped
  const showGrouped = showTabs && tab === 'all';

  return (
    <div>
      {/* Title bar */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-gray-500 text-sm mt-1">{pageDescription}</p>
        </div>
        <button
          onClick={fetchDocs}
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
          placeholder="🔍 Buscar por correo o nombre..."
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

      {/* Tabs — main page only */}
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
        {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        {q ? ` para "${q}"` : ''}
      </p>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">{q ? '🔍' : '🎉'}</div>
          <p className="font-medium">{q ? 'Sin resultados para esa búsqueda' : 'Sin documentos'}</p>
        </div>
      ) : showGrouped ? (
        /* Grouped by status (tab = all) */
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-3">⏳ Pendientes ({pending.length})</h2>
              <DocGrid docs={pending} onUpdate={handleUpdate} />
            </section>
          )}
          {approved.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wide mb-3">✅ Aprobados ({approved.length})</h2>
              <DocGrid docs={approved} onUpdate={handleUpdate} />
            </section>
          )}
          {rejected.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide mb-3">❌ Rechazados ({rejected.length})</h2>
              <DocGrid docs={rejected} onUpdate={handleUpdate} />
            </section>
          )}
        </div>
      ) : (
        /* Flat list (fixedStatus page OR pending tab) */
        <DocGrid docs={filtered} onUpdate={handleUpdate} />
      )}
    </div>
  );
}
