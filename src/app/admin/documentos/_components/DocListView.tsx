'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────
interface DocRecord {
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

interface DriverGroup {
  email: string;
  role: 'driver' | 'tecnico';
  docs: DocRecord[];
  profile: { name: string; photo: string | null; vehicle: string | null };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DRIVER_REQUIRED  = 7;
const TECNICO_REQUIRED = 4;

const DOC_LABELS: Record<string, string> = {
  selfie_cedula:       'Selfie con cédula',
  cedula_frente:       'Cédula frente',
  antecedentes:        'Antecedentes',
  domicilio:           'Domicilio',
  registro_frente:     'Registro frente',
  registro_dorso:      'Registro dorso',
  cedula_verde_frente: 'Céd. Verde frente',
  cedula_verde_dorso:  'Céd. Verde dorso',
};

function docLabel(key: string): string {
  // strip vehicle prefix (moto_, auto_, moto_carro_, camion_)
  const prefixes = ['moto_carro_', 'moto_', 'auto_', 'camion_'];
  for (const p of prefixes) {
    if (key.startsWith(p)) {
      const bare = key.slice(p.length);
      return DOC_LABELS[bare] || bare.replace(/_/g, ' ');
    }
  }
  return DOC_LABELS[key] || key.replace(/_/g, ' ');
}

function vehiclePrefix(key: string): string | null {
  const prefixes = ['moto_carro', 'moto', 'auto', 'camion'];
  for (const p of prefixes) {
    if (key.startsWith(p + '_')) return p;
  }
  return null;
}

// ─── Tab classification ────────────────────────────────────────────────────
type DriverTab = 'listos' | 'incompletos' | 'rechazados' | 'aprobados';

function classifyDriver(g: DriverGroup): DriverTab {
  const required = g.role === 'driver' ? DRIVER_REQUIRED : TECNICO_REQUIRED;
  const hasRejected  = g.docs.some(d => d.status === 'rejected');
  const hasPending   = g.docs.some(d => d.status === 'pending');
  const allApproved  = g.docs.length >= required && g.docs.every(d => d.status === 'approved');
  const allSubmitted = g.docs.length >= required;
  if (allApproved)            return 'aprobados';
  if (hasRejected)            return 'rechazados';
  if (allSubmitted && hasPending) return 'listos';
  return 'incompletos';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TAB_COLOR: Record<DriverTab, string> = {
  listos:      '#2563eb',
  incompletos: '#d97706',
  rechazados:  '#dc2626',
  aprobados:   '#059669',
};
const TAB_BG: Record<DriverTab, string> = {
  listos:      '#eff6ff',
  incompletos: '#fffbeb',
  rechazados:  '#fff5f5',
  aprobados:   '#f0fdf4',
};
const TAB_BORDER: Record<DriverTab, string> = {
  listos:      '#bfdbfe',
  incompletos: '#fde68a',
  rechazados:  '#fecaca',
  aprobados:   '#bbf7d0',
};

// ─── DocThumb ─────────────────────────────────────────────────────────────────
function DocThumb({
  doc,
  signedUrl,
  onUpdate,
}: {
  doc: DocRecord;
  signedUrl: string | null;
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string) => Promise<{ conflict?: boolean }>;
}) {
  const [rejReason, setRejReason] = useState(doc.rejection_reason || '');
  const [showReject, setShowReject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [localStatus, setLocalStatus] = useState(doc.status);
  const [localReason, setLocalReason] = useState(doc.rejection_reason);

  const prefix = vehiclePrefix(doc.doc_type);

  const approve = async () => {
    setSaving(true); setConflict(false);
    const r = await onUpdate(doc.id, 'approved', undefined, localStatus);
    if (r.conflict) setConflict(true);
    else { setLocalStatus('approved'); setLocalReason(null); }
    setSaving(false);
  };

  const reject = async () => {
    if (!rejReason.trim()) return;
    setSaving(true); setConflict(false);
    const r = await onUpdate(doc.id, 'rejected', rejReason, localStatus);
    if (r.conflict) setConflict(true);
    else { setLocalStatus('rejected'); setLocalReason(rejReason); setShowReject(false); }
    setSaving(false);
  };

  const borderColor = localStatus === 'approved' ? '#bbf7d0' : localStatus === 'rejected' ? '#fca5a5' : '#e5e7eb';
  const bgColor     = localStatus === 'approved' ? '#f0fdf4' : localStatus === 'rejected' ? '#fff5f5' : '#fff';

  return (
    <div style={{ borderRadius: 12, border: `2px solid ${borderColor}`, background: bgColor, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Image */}
      <div
        style={{ position: 'relative', aspectRatio: '4/3', background: '#f3f4f6', cursor: signedUrl ? 'zoom-in' : 'default', overflow: 'hidden' }}
        onClick={() => signedUrl && window.open(signedUrl, '_blank')}
      >
        {signedUrl ? (
          <img src={signedUrl} alt={doc.doc_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '1.8rem', opacity: 0.25 }}>📄</span>
            <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>cargando…</span>
          </div>
        )}
        {prefix && (
          <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, background: '#1f2937cc', color: '#fff', borderRadius: 4, padding: '2px 5px', textTransform: 'uppercase' }}>
            {prefix}
          </span>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>{docLabel(doc.doc_type)}</p>
        {doc.expires_at && (
          <p style={{ margin: 0, fontSize: '0.62rem', color: '#6b7280' }}>📅 {new Date(doc.expires_at).toLocaleDateString('es-PY')}</p>
        )}
        {conflict && <p style={{ margin: 0, fontSize: '0.62rem', color: '#d97706', fontWeight: 700 }}>⚠️ Conflicto — actualizá</p>}
        {localReason && localStatus === 'rejected' && (
          <p style={{ margin: 0, fontSize: '0.62rem', color: '#dc2626' }}>↳ {localReason}</p>
        )}

        {/* Status badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 99, padding: '2px 7px', fontSize: '0.65rem', fontWeight: 700, width: 'fit-content',
          background: localStatus === 'approved' ? '#d1fae5' : localStatus === 'rejected' ? '#fee2e2' : '#fef3c7',
          color: localStatus === 'approved' ? '#065f46' : localStatus === 'rejected' ? '#991b1b' : '#92400e',
        }}>
          {localStatus === 'approved' ? '✅ Aprobado' : localStatus === 'rejected' ? '❌ Rechazado' : '⏳ Pendiente'}
        </span>

        {/* Actions */}
        {!showReject && localStatus !== 'approved' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={approve} disabled={saving} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#10b981', color: '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : '✅ Aprobar'}
            </button>
            <button onClick={() => setShowReject(true)} disabled={saving} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
              ❌ Rechazar
            </button>
          </div>
        )}
        {!showReject && localStatus === 'approved' && (
          <button onClick={() => setShowReject(true)} style={{ padding: '4px 0', borderRadius: 7, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            ↩️ Revocar
          </button>
        )}
        {showReject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              value={rejReason}
              onChange={e => setRejReason(e.target.value.slice(0, 500))}
              placeholder="Motivo del rechazo…"
              style={{ fontSize: '0.68rem', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 6px', outline: 'none', color: '#1f2937' }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={reject} disabled={saving || !rejReason.trim()} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', opacity: (saving || !rejReason.trim()) ? 0.5 : 1 }}>
                {saving ? '…' : 'Confirmar'}
              </button>
              <button onClick={() => setShowReject(false)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: '#e5e7eb', color: '#374151', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DriverCard ───────────────────────────────────────────────────────────────
function DriverCard({
  group,
  token,
  onDocUpdate,
}: {
  group: DriverGroup;
  token: string;
  onDocUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string) => Promise<{ conflict?: boolean }>;
}) {
  const [open, setOpen]             = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [localDocs, setLocalDocs]   = useState<DocRecord[]>(group.docs);

  const required  = group.role === 'driver' ? DRIVER_REQUIRED : TECNICO_REQUIRED;
  const approved  = localDocs.filter(d => d.status === 'approved').length;
  const pending   = localDocs.filter(d => d.status === 'pending').length;
  const rejected  = localDocs.filter(d => d.status === 'rejected').length;
  const missing   = Math.max(0, required - localDocs.length);
  const tabClass  = classifyDriver({ ...group, docs: localDocs });
  const tabColor  = TAB_COLOR[tabClass];

  // Load all signed URLs when card first opens
  useEffect(() => {
    if (!open || loadingUrls || Object.keys(signedUrls).length > 0) return;
    setLoadingUrls(true);
    Promise.all(
      localDocs.map(async d => {
        try {
          const res = await fetch(`/api/admin/documents?id=${d.id}`, { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          return json.signedUrl ? { id: d.id, url: json.signedUrl as string } : null;
        } catch { return null; }
      })
    ).then(results => {
      const map: Record<string, string> = {};
      for (const r of results) if (r) map[r.id] = r.url;
      setSignedUrls(map);
      setLoadingUrls(false);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDocUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string) => {
    const result = await onDocUpdate(id, status, reason, prev);
    if (!result.conflict) {
      setLocalDocs(prev => prev.map(d => d.id === id ? { ...d, status, rejection_reason: reason ?? null } : d));
    }
    return result;
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    const pendingDocs = localDocs.filter(d => d.status === 'pending');
    await Promise.all(pendingDocs.map(d => onDocUpdate(d.id, 'approved', undefined, d.status)));
    setLocalDocs(prev => prev.map(d => d.status === 'pending' ? { ...d, status: 'approved', rejection_reason: null } : d));
    setBulkLoading(false);
  };

  return (
    <div style={{ borderRadius: 16, border: `1.5px solid ${TAB_BORDER[tabClass]}`, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      {/* ── Collapsed header ── */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: TAB_BG[tabClass], border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        {/* Avatar */}
        {group.profile.photo ? (
          <img src={group.profile.photo} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2.5px solid ${tabColor}` }} />
        ) : (
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: tabColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0, border: `2.5px solid ${tabColor}` }}>
            {group.role === 'tecnico' ? '🔧' : '🚗'}
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1f2937' }}>
              {group.profile.name !== group.email ? group.profile.name : '(sin nombre)'}
            </span>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: group.role === 'tecnico' ? '#f3e8ff' : '#e0f2fe', color: group.role === 'tecnico' ? '#7c3aed' : '#0369a1' }}>
              {group.role === 'tecnico' ? '🔧 Técnico' : '🚗 Driver'}
            </span>
          </div>
          <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.email}</p>
          {group.profile.vehicle && (
            <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>🏍️ {group.profile.vehicle}</p>
          )}
          {/* Doc count chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>
              {localDocs.length}/{required} docs
            </span>
            {approved > 0 && <span style={{ fontSize: '0.68rem', background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>✅ {approved}</span>}
            {pending  > 0 && <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>⏳ {pending}</span>}
            {rejected > 0 && <span style={{ fontSize: '0.68rem', background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>❌ {rejected}</span>}
            {missing  > 0 && <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>📭 {missing} falta{missing > 1 ? 'n' : ''}</span>}
          </div>
        </div>

        <span style={{ color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* ── Expanded panel ── */}
      {open && (
        <div style={{ padding: 16, borderTop: '1px solid #f3f4f6' }}>
          {/* Spinner while loading images */}
          {loadingUrls && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0', color: '#9ca3af', fontSize: '0.8rem' }}>
              <div style={{ width: 20, height: 20, border: '3px solid #F5C518', borderTopColor: 'transparent', borderRadius: '50%', animation: 'docSpin 0.8s linear infinite' }} />
              Cargando imágenes…
            </div>
          )}

          {/* Doc grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
            {localDocs.map(doc => (
              <DocThumb
                key={doc.id}
                doc={doc}
                signedUrl={signedUrls[doc.id] ?? null}
                onUpdate={handleDocUpdate}
              />
            ))}
          </div>

          {/* Bulk approve */}
          {pending > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              style={{
                marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: bulkLoading ? '#e5e7eb' : 'linear-gradient(135deg,#10b981,#059669)',
                color: bulkLoading ? '#9ca3af' : '#fff', fontWeight: 800, fontSize: '0.92rem',
              }}
            >
              {bulkLoading ? 'Aprobando…' : `✅ Aprobar todos los pendientes (${pending})`}
            </button>
          )}

          {/* All approved message */}
          {pending === 0 && rejected === 0 && missing === 0 && (
            <p style={{ textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: '0.85rem', margin: '12px 0 0' }}>
              🎉 Todos los documentos verificados — conductor habilitado
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface DocListViewProps {
  pageTitle: string;
  pageDescription: string;
  fixedStatus?: 'pending' | 'approved' | 'rejected';
  showTabs?: boolean;
}

export default function DocListView({ pageTitle, pageDescription }: DocListViewProps) {
  const [groups, setGroups]       = useState<DriverGroup[]>([]);
  const [loading, setLoading]     = useState(false);
  const [token, setToken]         = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'tecnico'>('all');
  const [search, setSearch]       = useState('');
  const [activeTab, setActiveTab] = useState<DriverTab | 'todos'>('listos');
  const [total, setTotal]         = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const role = roleFilter !== 'all' ? `&role=${roleFilter}` : '';
      const res  = await fetch(`/api/admin/documents?view=drivers${role}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setGroups(json.drivers || []);
      setTotal(json.total ?? 0);
    } catch {}
    setLoading(false);
  }, [token, roleFilter]);

  useEffect(() => { if (token) fetchGroups(); }, [token, fetchGroups]);

  const handleDocUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string): Promise<{ conflict?: boolean }> => {
    if (!token) return {};
    const res = await fetch('/api/admin/documents', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, rejection_reason: reason, previous_status: prev }),
    });
    if (res.status === 409) return { conflict: true };
    return {};
  };

  // Client-side filter
  const q = search.trim().toLowerCase();
  const filtered = groups.filter(g => {
    const matchSearch = !q || g.email.toLowerCase().includes(q) || g.profile.name.toLowerCase().includes(q);
    return matchSearch;
  });

  // Classify each group
  const byTab: Record<DriverTab, DriverGroup[]> = { listos: [], incompletos: [], rechazados: [], aprobados: [] };
  for (const g of filtered) byTab[classifyDriver(g)].push(g);

  const displayed = activeTab === 'todos' ? filtered : byTab[activeTab];

  const tabs: { key: DriverTab | 'todos'; label: string; count: number; color: string }[] = [
    { key: 'listos',      label: '🔵 Listos para revisar', count: byTab.listos.length,      color: '#2563eb' },
    { key: 'rechazados',  label: '🔴 Con rechazados',      count: byTab.rechazados.length,  color: '#dc2626' },
    { key: 'incompletos', label: '🟡 Incompletos',          count: byTab.incompletos.length, color: '#d97706' },
    { key: 'aprobados',   label: '🟢 Aprobados',            count: byTab.aprobados.length,   color: '#059669' },
    { key: 'todos',       label: '📋 Todos',                count: filtered.length,          color: '#6b7280' },
  ];

  if (!token) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Spin animation */}
      <style>{`@keyframes docSpin{to{transform:rotate(360deg)}}`}</style>

      {/* Title bar */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pageDescription} ·{' '}
            <span className="font-semibold">{total} conductores</span>
          </p>
        </div>
        <button
          onClick={fetchGroups}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-[#F5C518] text-[#1C1C2E] text-sm font-bold hover:bg-[#e6b800] transition-colors disabled:opacity-60"
        >
          {loading ? '⟳ Cargando…' : '🔄 Actualizar'}
        </button>
      </div>

      {/* Search + Role filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre o correo…"
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#F5C518] shadow-sm"
        />
        <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {(['all', 'driver', 'tecnico'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 text-sm font-bold transition-colors whitespace-nowrap ${roleFilter === r ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {r === 'all' ? 'Todos' : r === 'driver' ? '🚗 Driver' : '🔧 Técnico'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
              background: activeTab === t.key ? t.color : '#f3f4f6',
              color: activeTab === t.key ? '#fff' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            <span style={{
              background: activeTab === t.key ? '#ffffff33' : '#e5e7eb',
              color: activeTab === t.key ? '#fff' : '#374151',
              borderRadius: 99, padding: '0 6px', fontSize: '0.75rem', fontWeight: 800, minWidth: 20, textAlign: 'center',
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && groups.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">
            {activeTab === 'aprobados' ? '🎉' : activeTab === 'listos' ? '✨' : '🔍'}
          </div>
          <p className="font-medium text-gray-500">
            {activeTab === 'aprobados' ? 'Ningún conductor completamente aprobado aún'
              : activeTab === 'listos' ? 'No hay conductores listos para revisar'
              : q ? `Sin resultados para "${q}"` : 'Sin conductores en esta categoría'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(g => (
            <DriverCard
              key={`${g.email}__${g.role}`}
              group={g}
              token={token}
              onDocUpdate={handleDocUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
