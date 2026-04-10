'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/authFetch';

export type ReporterRole = 'cliente' | 'driver' | 'tecnico';
export type ReportedRole = 'cliente' | 'driver' | 'tecnico';
export type ReferenceType = 'order' | 'job';

interface ReportModalProps {
  reporterEmail: string;
  reporterRole: ReporterRole;
  reportedEmail: string;
  reportedRole: ReportedRole;
  reportedName?: string;
  referenceType: ReferenceType;
  referenceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const REASONS: { key: string; label: string; icon: string }[] = [
  { key: 'no_llego',          label: 'No llegó / No apareció',    icon: '🚫' },
  { key: 'cobro_indebido',    label: 'Cobro indebido',            icon: '💸' },
  { key: 'mal_comportamiento',label: 'Mal comportamiento',        icon: '😡' },
  { key: 'fraude',            label: 'Fraude / Estafa',           icon: '⚠️' },
  { key: 'pago_no_realizado', label: 'Pago no realizado',         icon: '💳' },
  { key: 'maltrato',          label: 'Maltrato / Agresión',       icon: '🆘' },
  { key: 'otro',              label: 'Otro motivo',               icon: '📝' },
];

export default function ReportModal({
  reporterEmail,
  reporterRole,
  reportedEmail,
  reportedRole,
  reportedName,
  referenceType,
  referenceId,
  onClose,
  onSuccess,
}: ReportModalProps) {
  const [reason, setReason]   = useState<string>('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const handleSubmit = async () => {
    if (!reason) { setError('Selecciona un motivo'); return; }
    setSending(true);
    setError('');
    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_email: reporterEmail,
          reporter_role:  reporterRole,
          reported_email: reportedEmail,
          reported_role:  reportedRole,
          reference_type: referenceType,
          reference_id:   referenceId,
          reason,
          comment: comment.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Error al enviar reporte');
      } else {
        setDone(true);
        onSuccess?.();
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSending(false);
    }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      {/* Sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, margin: '0 auto',
          background: '#1C1C2E',
          borderRadius: '24px 24px 0 0',
          padding: '0 0 max(24px, env(safe-area-inset-bottom))',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>
                🚨 Reportar
              </h2>
              {reportedName && (
                <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                  {reportedName}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        {done ? (
          /* Success state */
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>✅</div>
            <h3 style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.1rem', margin: '0 0 8px' }}>
              Reporte enviado
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.88rem', margin: '0 0 24px' }}>
              Nuestro equipo revisará tu caso en las próximas 24 h.
            </p>
            <button
              onClick={onClose}
              style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}
            >
              Entendido
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px 20px 8px' }}>
            {/* Reason grid */}
            <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Motivo del reporte
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {REASONS.map(r => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                    border: reason === r.key ? '1.5px solid #F5C518' : '1px solid rgba(255,255,255,0.1)',
                    background: reason === r.key ? 'rgba(245,197,24,0.12)' : 'rgba(255,255,255,0.04)',
                    color: reason === r.key ? '#F5C518' : 'rgba(255,255,255,0.75)',
                    fontWeight: reason === r.key ? 700 : 400,
                    fontSize: '0.88rem',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{r.icon}</span>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Comment */}
            <p style={{ margin: '0 0 6px', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Comentario adicional (opcional)
            </p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Describe lo que ocurrió…"
              maxLength={500}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12, color: '#fff', padding: '10px 12px',
                fontSize: '0.88rem', resize: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
              {comment.length}/500
            </div>

            {error && (
              <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: 10, textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={sending || !reason}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: sending || !reason ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
                color: sending || !reason ? 'rgba(255,255,255,0.35)' : '#fff',
                fontWeight: 800, fontSize: '1rem', cursor: sending || !reason ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {sending ? 'Enviando…' : '🚨 Enviar reporte'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
