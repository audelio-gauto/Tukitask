'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon, type IconName } from '@/components/Icon';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DocRecord {
  id: string;
  driver_email: string;
  role: 'driver' | 'tecnico' | 'client';
  doc_type: string;
  file_path: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  expires_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  action: 'approved' | 'rejected' | 'pending';
  admin_email: string;
  rejection_reason: string | null;
  created_at: string;
}

interface DriverGroup {
  email: string;
  role: 'driver' | 'tecnico' | 'client';
  docs: DocRecord[];
  profile: { name: string; photo: string | null; vehicle: string | null };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DRIVER_REQUIRED  = 7;
const TECNICO_REQUIRED = 4;
const CLIENT_REQUIRED  = 2;
const EXPIRY_WARN_DAYS = 30;

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
  for (const p of prefixes) if (key.startsWith(p + '_')) return p;
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function expiryStatus(expiresAt: string | null): { expired: boolean; daysLeft: number | null } {
  if (!expiresAt) return { expired: false, daysLeft: null };
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  return { expired: days <= 0, daysLeft: days <= EXPIRY_WARN_DAYS ? days : null };
}

function oldestPendingDate(docs: DocRecord[]): Date | null {
  const pending = docs.filter(d => d.status === 'pending');
  if (!pending.length) return null;
  return new Date(Math.min(...pending.map(d => new Date(d.created_at).getTime())));
}

function exportCSV(groups: DriverGroup[]): void {
  const headers = ['Email', 'Nombre', 'Rol', 'Vehículo', 'Total docs', 'Aprobados', 'Pendientes', 'Rechazados', 'Faltantes', 'Estado'];
  const rows = groups.map(g => {
    const req      = g.role === 'driver' ? DRIVER_REQUIRED : g.role === 'client' ? CLIENT_REQUIRED : TECNICO_REQUIRED;
    const approved = g.docs.filter(d => d.status === 'approved').length;
    const pending  = g.docs.filter(d => d.status === 'pending').length;
    const rejected = g.docs.filter(d => d.status === 'rejected').length;
    const missing  = Math.max(0, req - g.docs.length);
    return [
      `"${g.email}"`, `"${g.profile.name.replace(/"/g, '""')}"`, g.role,
      `"${(g.profile.vehicle || '').replace(/"/g, '""')}"`,
      g.docs.length, approved, pending, rejected, missing, classifyDriver(g),
    ].join(',');
  });
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `documentos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tab classification ───────────────────────────────────────────────────────
type DriverTab = 'listos' | 'incompletos' | 'rechazados' | 'aprobados';

function classifyDriver(g: DriverGroup): DriverTab {
  const required    = g.role === 'driver' ? DRIVER_REQUIRED : g.role === 'client' ? CLIENT_REQUIRED : TECNICO_REQUIRED;
  const hasRejected = g.docs.some(d => d.status === 'rejected');
  const hasPending  = g.docs.some(d => d.status === 'pending');
  const allApproved = g.docs.length >= required && g.docs.every(d => d.status === 'approved');
  if (allApproved)                              return 'aprobados';
  if (hasRejected)                              return 'rechazados';
  if (g.docs.length >= required && hasPending)  return 'listos';
  return 'incompletos';
}

const TAB_COLOR: Record<DriverTab, string>  = { listos: '#2563eb', incompletos: '#d97706', rechazados: '#dc2626', aprobados: '#059669' };
const TAB_BG:    Record<DriverTab, string>  = { listos: '#eff6ff', incompletos: '#fffbeb', rechazados: '#fff5f5', aprobados: '#f0fdf4' };
const TAB_BORDER:Record<DriverTab, string>  = { listos: '#bfdbfe', incompletos: '#fde68a', rechazados: '#fecaca', aprobados: '#bbf7d0' };

// ─── StatChip ─────────────────────────────────────────────────────────────────
function StatChip({ label, value, color, icon }: { label: string; value: number; color: string; icon?: IconName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, background: '#fff', border: `1.5px solid ${color}33`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ fontWeight: 900, fontSize: '1.15rem', color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.71rem', color: '#6b7280', lineHeight: 1.3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {icon ? <Icon name={icon} size={12} /> : null}
        {label}
      </span>
    </div>
  );
}

// ─── DocThumb ─────────────────────────────────────────────────────────────────
function DocThumb({
  doc,
  signedUrl,
  token,
  onUpdate,
}: {
  doc: DocRecord;
  signedUrl: string | null;
  token: string;
  onUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string, expiresAt?: string) => Promise<{ conflict?: boolean }>;
}) {
  const [rejReason,   setRejReason]   = useState(doc.rejection_reason || '');
  const [showReject,  setShowReject]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [conflict,    setConflict]    = useState(false);
  const [localStatus, setLocalStatus] = useState(doc.status);
  const [localReason, setLocalReason] = useState(doc.rejection_reason);
  const [showHistory, setShowHistory] = useState(false);
  const [history,     setHistory]     = useState<AuditEntry[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [expiryInput, setExpiryInput] = useState(() => doc.expires_at ? doc.expires_at.substring(0, 10) : '');

  const prefix = vehiclePrefix(doc.doc_type);
  const expiry = expiryStatus(doc.expires_at);

  const approve = async () => {
    setSaving(true); setConflict(false);
    const r = await onUpdate(doc.id, 'approved', undefined, localStatus, expiryInput || undefined);
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

  const toggleHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    if (history.length > 0) { setShowHistory(true); return; }
    setLoadingHist(true);
    try {
      const res  = await fetch(`/api/admin/documents?audit=${encodeURIComponent(doc.id)}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setHistory(json.history || []);
    } catch { /* non-fatal */ }
    setLoadingHist(false);
    setShowHistory(true);
  };

  const borderColor = expiry.expired && localStatus !== 'approved' ? '#fca5a5' : localStatus === 'approved' ? '#bbf7d0' : localStatus === 'rejected' ? '#fca5a5' : '#e5e7eb';
  const bgColor     = expiry.expired && localStatus !== 'approved' ? '#fff5f5' : localStatus === 'approved' ? '#f0fdf4' : localStatus === 'rejected' ? '#fff5f5' : '#fff';

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
            <Icon name="document" size={22} className="text-gray-300" />
            <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>cargando…</span>
          </div>
        )}
        {prefix && (
          <span style={{ position: 'absolute', top: 4, left: 4, fontSize: '0.55rem', fontWeight: 800, background: '#1f2937cc', color: '#fff', borderRadius: 4, padding: '2px 5px', textTransform: 'uppercase' }}>
            {prefix}
          </span>
        )}
        {/* Expiry overlay badge on image */}
        {expiry.expired && (
          <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.6rem', fontWeight: 800, background: '#ef4444ee', color: '#fff', borderRadius: 5, padding: '2px 6px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="x" size={10} />
              VENCIDO
            </span>
          </span>
        )}
        {!expiry.expired && expiry.daysLeft !== null && (
          <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.6rem', fontWeight: 800, background: '#f59e0bee', color: '#fff', borderRadius: 5, padding: '2px 6px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="exclamation" size={10} />
              {expiry.daysLeft}d
            </span>
          </span>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>{docLabel(doc.doc_type)}</p>

        {/* Expiry badge */}
        {doc.expires_at && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', borderRadius: 6, padding: '2px 6px', fontSize: '0.62rem', fontWeight: 700, width: 'fit-content',
            background: expiry.expired ? '#fee2e2' : expiry.daysLeft !== null ? '#fef3c7' : '#f3f4f6',
            color:      expiry.expired ? '#dc2626' : expiry.daysLeft !== null ? '#d97706' : '#6b7280',
          }}>
            {expiry.expired ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="x" size={10} />
                Vencido {new Date(doc.expires_at).toLocaleDateString('es-PY')}
              </span>
            ) : expiry.daysLeft !== null ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="exclamation" size={10} />
                Vence en {expiry.daysLeft}d · {new Date(doc.expires_at).toLocaleDateString('es-PY')}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="calendar" size={10} />
                {new Date(doc.expires_at).toLocaleDateString('es-PY')}
              </span>
            )}
          </span>
        )}

        {conflict && (
          <p style={{ margin: 0, fontSize: '0.62rem', color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="exclamation" size={10} />
            Conflicto — actualiza
          </p>
        )}
        {localReason && localStatus === 'rejected' && (
          <p style={{ margin: 0, fontSize: '0.62rem', color: '#dc2626' }}>↳ {localReason}</p>
        )}

        {/* Status badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 99, padding: '2px 7px', fontSize: '0.65rem', fontWeight: 700, width: 'fit-content',
          background: localStatus === 'approved' ? '#d1fae5' : localStatus === 'rejected' ? '#fee2e2' : '#fef3c7',
          color:      localStatus === 'approved' ? '#065f46' : localStatus === 'rejected' ? '#991b1b' : '#92400e',
        }}>
          <Icon name={localStatus === 'approved' ? 'check' : localStatus === 'rejected' ? 'x' : 'clock'} size={10} />
          {localStatus === 'approved' ? 'Aprobado' : localStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}
        </span>

        {/* Re-subida indicator */}
        {localStatus === 'rejected' && (
          <p style={{ margin: 0, fontSize: '0.6rem', color: '#9ca3af', fontStyle: 'italic' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="arrow-up" size={10} />
              Esperando re-envio del conductor
            </span>
          </p>
        )}

        {/* Actions */}
        {!showReject && localStatus !== 'approved' && (
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
            <label style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 600 }}>📅 Fecha venc. (opcional)</label>
            <input
              type="date"
              value={expiryInput}
              onChange={e => setExpiryInput(e.target.value)}
              style={{ fontSize: '0.68rem', padding: '3px 6px', borderRadius: 6, border: '1px solid #e5e7eb', color: '#1f2937', background: '#fff', width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={approve} disabled={saving} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#10b981', color: '#fff', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" size={10} />
                  Aprobar
                </span>
              )}
            </button>
            <button onClick={() => setShowReject(true)} disabled={saving} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="x" size={10} />
                Rechazar
              </span>
            </button>
          </div>
          </>
        )}
        {!showReject && localStatus === 'approved' && (
          <button onClick={() => setShowReject(true)} style={{ padding: '4px 0', borderRadius: 7, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            Revocar
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

        {/* Audit history */}
        <button
          onClick={toggleHistory}
          style={{ padding: '3px 0', border: 'none', background: 'transparent', color: '#9ca3af', fontSize: '0.6rem', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline' }}
        >
          {loadingHist ? 'Cargando historial…' : showHistory ? '▲ Ocultar historial' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={10} />
              Ver historial
            </span>
          )}
        </button>
        {showHistory && (
          <div style={{ fontSize: '0.6rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: 5 }}>
            {history.length === 0 ? (
              <span>Sin historial registrado.</span>
            ) : history.map(h => (
              <div key={h.id} style={{ borderLeft: `2px solid ${h.action === 'approved' ? '#10b981' : h.action === 'rejected' ? '#ef4444' : '#f59e0b'}`, paddingLeft: 5, paddingBottom: 2 }}>
                <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={h.action === 'approved' ? 'check' : h.action === 'rejected' ? 'x' : 'clock'} size={10} />
                  {h.action}
                </span>
                {' · '}{h.admin_email}{' · '}{new Date(h.created_at).toLocaleString('es-PY')}
                {h.rejection_reason && <span style={{ color: '#dc2626' }}> — {h.rejection_reason}</span>}
              </div>
            ))}
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
  onDocUpdate: (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string, expiresAt?: string) => Promise<{ conflict?: boolean }>;
}) {
  const [open,        setOpen]       = useState(false);
  const [signedUrls,  setSignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [localDocs,   setLocalDocs]  = useState<DocRecord[]>(group.docs);

  const required     = group.role === 'driver' ? DRIVER_REQUIRED : group.role === 'client' ? CLIENT_REQUIRED : TECNICO_REQUIRED;
  const approved     = localDocs.filter(d => d.status === 'approved').length;
  const pending      = localDocs.filter(d => d.status === 'pending').length;
  const rejected     = localDocs.filter(d => d.status === 'rejected').length;
  const missing      = Math.max(0, required - localDocs.length);
  const expiredCount = localDocs.filter(d => expiryStatus(d.expires_at).expired).length;
  const soonCount    = localDocs.filter(d => { const e = expiryStatus(d.expires_at); return !e.expired && e.daysLeft !== null; }).length;
  const oldest       = oldestPendingDate(localDocs);
  const tabClass     = classifyDriver({ ...group, docs: localDocs });
  const tabColor     = TAB_COLOR[tabClass];

  // Batch-load signed URLs when card first opens
  useEffect(() => {
    if (!open || loadingUrls || Object.keys(signedUrls).length > 0) return;
    setLoadingUrls(true);
    Promise.all(
      localDocs.map(async d => {
        try {
          const res  = await fetch(`/api/admin/documents?id=${encodeURIComponent(d.id)}`, { headers: { Authorization: `Bearer ${token}` } });
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

  const handleDocUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string, expiresAt?: string) => {
    const result = await onDocUpdate(id, status, reason, prev, expiresAt);
    if (!result.conflict) {
      setLocalDocs(p => p.map(d => d.id === id ? { ...d, status, rejection_reason: reason ?? null, ...(expiresAt !== undefined ? { expires_at: expiresAt || null } : {}) } : d));
    }
    return result;
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    const pendingDocs = localDocs.filter(d => d.status === 'pending');
    await Promise.all(pendingDocs.map(d => onDocUpdate(d.id, 'approved', undefined, d.status)));
    setLocalDocs(p => p.map(d => d.status === 'pending' ? { ...d, status: 'approved', rejection_reason: null } : d));
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
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: tabColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2.5px solid ${tabColor}` }}>
            <Icon name={group.role === 'tecnico' ? 'tool' : group.role === 'client' ? 'user' : 'car'} size={20} color={tabColor} />
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1f2937' }}>
              {group.profile.name !== group.email ? group.profile.name : '(sin nombre)'}
            </span>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: group.role === 'tecnico' ? '#f3e8ff' : group.role === 'client' ? '#fef9c3' : '#e0f2fe', color: group.role === 'tecnico' ? '#7c3aed' : group.role === 'client' ? '#854d0e' : '#0369a1' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name={group.role === 'tecnico' ? 'tool' : group.role === 'client' ? 'user' : 'car'} size={10} />
                {group.role === 'tecnico' ? 'Tecnico' : group.role === 'client' ? 'Cliente' : 'Driver'}
              </span>
            </span>
          </div>
          <p style={{ margin: '1px 0 0', fontSize: '0.74rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.email}</p>
          {group.profile.vehicle && (
            <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="car" size={12} />
              {group.profile.vehicle}
            </p>
          )}
          {/* Oldest pending indicator */}
          {oldest && (
            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={10} />
              Esperando revision hace {Math.floor((Date.now() - oldest.getTime()) / 86400000)}d
            </p>
          )}
          {/* Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>
              {localDocs.length}/{required}
            </span>
            {approved > 0 && (
              <span style={{ fontSize: '0.68rem', background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '2px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="check" size={10} />
                {approved}
              </span>
            )}
            {pending > 0 && (
              <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="clock" size={10} />
                {pending}
              </span>
            )}
            {rejected > 0 && (
              <span style={{ fontSize: '0.68rem', background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="arrow-up" size={10} />
                {rejected} re-envio
              </span>
            )}
            {missing > 0 && (
              <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '2px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="mail" size={10} />
                {missing} falt{missing > 1 ? 'an' : 'a'}
              </span>
            )}
            {expiredCount > 0 && (
              <span style={{ fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '2px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="x" size={10} />
                {expiredCount} vencido{expiredCount > 1 ? 's' : ''}
              </span>
            )}
            {soonCount > 0 && expiredCount === 0 && (
              <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#d97706', borderRadius: 6, padding: '2px 6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="exclamation" size={10} />
                {soonCount} vence pronto
              </span>
            )}
          </div>
        </div>
        <span style={{ color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* ── Expanded panel ── */}
      {open && (
        <div style={{ padding: 16, borderTop: '1px solid #f3f4f6' }}>
          {loadingUrls && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0', color: '#9ca3af', fontSize: '0.8rem' }}>
              <div style={{ width: 20, height: 20, border: '3px solid #F5C518', borderTopColor: 'transparent', borderRadius: '50%', animation: 'docSpin 0.8s linear infinite' }} />
              Cargando imágenes…
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12 }}>
            {localDocs.map(doc => (
              <DocThumb
                key={doc.id}
                doc={doc}
                signedUrl={signedUrls[doc.id] ?? null}
                token={token}
                onUpdate={handleDocUpdate}
              />
            ))}
          </div>
          {pending > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              style={{ marginTop: 14, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: bulkLoading ? '#e5e7eb' : 'linear-gradient(135deg,#10b981,#059669)', color: bulkLoading ? '#9ca3af' : '#fff', fontWeight: 800, fontSize: '0.92rem' }}
            >
              {bulkLoading ? 'Aprobando…' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="check" size={12} />
                  Aprobar todos los pendientes ({pending})
                </span>
              )}
            </button>
          )}
          {pending === 0 && rejected === 0 && missing === 0 && expiredCount === 0 && (
            <p style={{ textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: '0.85rem', margin: '12px 0 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="trophy" size={14} />
              Todos los documentos verificados — conductor habilitado
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
  const [groups,      setGroups]      = useState<DriverGroup[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [token,       setToken]       = useState<string | null>(null);
  const [roleFilter,  setRoleFilter]  = useState<'all' | 'driver' | 'tecnico' | 'client'>('all');
  const [search,      setSearch]      = useState('');
  const [activeTab,   setActiveTab]   = useState<DriverTab | 'todos'>('listos');
  const [total,       setTotal]       = useState(0);
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [nextCursor,  setNextCursor]  = useState<{ email: string; role: string } | null>(null);
  const [hasMore,     setHasMore]     = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const fetchGroups = useCallback(async (append = false, cur?: { email: string; role: string } | null) => {
    if (!token) return;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const role        = roleFilter !== 'all' ? `&role=${roleFilter}` : '';
      const cursorParam = cur
        ? `&cursor=${encodeURIComponent(cur.email)}&cursorRole=${encodeURIComponent(cur.role)}`
        : '';
      const res  = await fetch(`/api/admin/documents?view=drivers${role}${cursorParam}&limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (append) {
        setGroups(prev => [...prev, ...(json.drivers || [])]);
        setTotal(prev  => prev + (json.total ?? 0));
      } else {
        setGroups(json.drivers || []);
        setTotal(json.total ?? 0);
      }
      setNextCursor(json.nextCursor ?? null);
      setHasMore(json.hasMore ?? false);
    } catch { /* non-fatal */ }
    if (append) setLoadingMore(false); else setLoading(false);
  }, [token, roleFilter]);

  // Reset and reload from scratch whenever role filter changes
  useEffect(() => {
    if (!token) return;
    setGroups([]);
    setNextCursor(null);
    setHasMore(false);
    fetchGroups(false, null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roleFilter]);

  const handleDocUpdate = async (id: string, status: 'approved' | 'rejected', reason?: string, prev?: string, expiresAt?: string): Promise<{ conflict?: boolean }> => {
    if (!token) return {};
    const res = await fetch('/api/admin/documents', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, rejection_reason: reason, previous_status: prev, ...(expiresAt !== undefined ? { expires_at: expiresAt || null } : {}) }),
    });
    if (res.status === 409) return { conflict: true };
    return {};
  };

  // ── Client-side filtering ──
  const q = search.trim().toLowerCase();
  const filtered = groups.filter(g => {
    if (q && !g.email.toLowerCase().includes(q) && !g.profile.name.toLowerCase().includes(q)) return false;
    if (dateFrom || dateTo) {
      const oldest = [...g.docs].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.created_at ?? '';
      if (dateFrom && oldest < dateFrom)               return false;
      if (dateTo   && oldest > dateTo + 'T23:59:59')   return false;
    }
    return true;
  });

  // Classify
  const byTab: Record<DriverTab, DriverGroup[]> = { listos: [], incompletos: [], rechazados: [], aprobados: [] };
  for (const g of filtered) byTab[classifyDriver(g)].push(g);

  // Sort by oldest pending doc first
  const sortByOldest = (arr: DriverGroup[]) =>
    [...arr].sort((a, b) => {
      const aOld = oldestPendingDate(a.docs);
      const bOld = oldestPendingDate(b.docs);
      if (aOld && bOld) return aOld.getTime() - bOld.getTime();
      if (aOld) return -1;
      if (bOld) return  1;
      return a.email.localeCompare(b.email);
    });

  const displayed = sortByOldest(activeTab === 'todos' ? filtered : byTab[activeTab]);

  // ── Stats (computed from ALL groups, no filter) ──
  const byTabAll: Record<DriverTab, DriverGroup[]> = { listos: [], incompletos: [], rechazados: [], aprobados: [] };
  for (const g of groups) byTabAll[classifyDriver(g)].push(g);
  const statsExpired = groups.filter(g => g.docs.some(d => expiryStatus(d.expires_at).expired)).length;
  const statsSoon    = groups.filter(g => !g.docs.some(d => expiryStatus(d.expires_at).expired) && g.docs.some(d => expiryStatus(d.expires_at).daysLeft !== null)).length;

  const tabs: { key: DriverTab | 'todos'; label: string; count: number; color: string; icon: IconName }[] = [
    { key: 'listos',      label: 'Listos para revisar', count: byTab.listos.length,      color: '#2563eb', icon: 'clock' },
    { key: 'rechazados',  label: 'Con rechazados',      count: byTab.rechazados.length,  color: '#dc2626', icon: 'x' },
    { key: 'incompletos', label: 'Incompletos',          count: byTab.incompletos.length, color: '#d97706', icon: 'exclamation' },
    { key: 'aprobados',   label: 'Aprobados',            count: byTab.aprobados.length,   color: '#059669', icon: 'check' },
    { key: 'todos',       label: 'Todos',                count: filtered.length,          color: '#6b7280', icon: 'clipboard' },
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
      <style>{`@keyframes docSpin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Title bar ── */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {pageDescription} · <span className="font-semibold">{total} conductores cargados{hasMore ? ' · hay más' : ''}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => exportCSV(filtered)}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <span className="inline-flex items-center gap-2">
              <Icon name="arrow-up" size={14} />
              Exportar CSV
            </span>
          </button>
          <button
            onClick={() => { setGroups([]); setNextCursor(null); setHasMore(false); fetchGroups(false, null); }}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#F5C518] text-[#1C1C2E] text-sm font-bold hover:bg-[#e6b800] transition-colors disabled:opacity-60"
          >
            {loading ? 'Cargando…' : (
              <span className="inline-flex items-center gap-2">
                <Icon name="refresh" size={14} />
                Actualizar
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats banner ── */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16 }}>
          <StatChip value={byTabAll.listos.length}      label="listos para revisar" color="#2563eb" />
          <StatChip value={byTabAll.rechazados.length}  label="con rechazados"       color="#dc2626" />
          <StatChip value={byTabAll.incompletos.length} label="incompletos"           color="#d97706" />
          <StatChip value={byTabAll.aprobados.length}   label="aprobados"             color="#059669" />
          {statsExpired > 0 && <StatChip value={statsExpired} label="con docs vencidos"    color="#ef4444" icon="x" />}
          {statsSoon    > 0 && <StatChip value={statsSoon}    label="con docs por vencer"  color="#f59e0b" icon="exclamation" />}
        </div>
      )}

      {/* ── Search + Role filter ── */}
      <div className="flex flex-wrap gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#F5C518] shadow-sm"
        />
        <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {(['all', 'driver', 'tecnico', 'client'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 text-sm font-bold transition-colors whitespace-nowrap ${roleFilter === r ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <span className="inline-flex items-center gap-1">
                {r === 'all' ? null : (
                  <Icon name={r === 'driver' ? 'car' : r === 'tecnico' ? 'tool' : 'user'} size={12} />
                )}
                {r === 'all' ? 'Todos' : r === 'driver' ? 'Driver' : r === 'tecnico' ? 'Tecnico' : 'Cliente'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Date range filter ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="calendar" size={12} />
          Filtrar por fecha de envio:
        </span>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.8rem', background: '#fff', color: '#1f2937', outline: 'none' }}
        />
        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>hasta</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.8rem', background: '#fff', color: '#1f2937', outline: 'none' }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="x" size={10} />
              Limpiar
            </span>
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700,
              fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
              background: activeTab === t.key ? t.color : '#f3f4f6',
              color:      activeTab === t.key ? '#fff'  : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            <Icon name={t.icon} size={12} />
            {t.label}
            <span style={{ background: activeTab === t.key ? '#ffffff33' : '#e5e7eb', color: activeTab === t.key ? '#fff' : '#374151', borderRadius: 99, padding: '0 6px', fontSize: '0.75rem', fontWeight: 800, minWidth: 20, textAlign: 'center' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading && groups.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">
            <Icon name={activeTab === 'aprobados' ? 'trophy' : activeTab === 'listos' ? 'star' : 'eye'} size={28} className="text-gray-300" />
          </div>
          <p className="font-medium text-gray-500">
            {activeTab === 'aprobados' ? 'Ningún conductor completamente aprobado aún'
              : activeTab === 'listos' ? 'No hay conductores listos para revisar'
              : (q || dateFrom || dateTo) ? 'Sin resultados para los filtros aplicados'
              : 'Sin conductores en esta categoría'}
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

      {/* ── Cargar más ── */}
      {hasMore && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button
            onClick={() => fetchGroups(true, nextCursor)}
            disabled={loadingMore}
            style={{
              padding: '10px 28px', borderRadius: 12, border: 'none', cursor: loadingMore ? 'default' : 'pointer',
              background: '#F5C518', color: '#1C1C2E', fontWeight: 700, fontSize: '0.9rem',
              opacity: loadingMore ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loadingMore ? 'Cargando…' : 'Cargar más conductores'}
          </button>
        </div>
      )}
    </div>
  );
}
