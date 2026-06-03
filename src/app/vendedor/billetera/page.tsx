'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

/* ── Types ──────────────────────────────────────────────────── */
interface Transaction {
  id: string;
  type: string;
  amount: number;
  market_order_id: string | null;
  note: string | null;
  created_at: string;
}

interface RechargeRequest {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  receipt_url: string | null;
  created_at: string;
  rejection_note: string | null;
}

interface BankAlias {
  id: number;
  bank_name: string;
  alias: string;
  extra_info: string | null;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TX_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string; sign: string }> = {
  sale_commission: { label: 'Comisión venta', color: '#f87171', bg: 'rgba(239,68,68,0.15)',  icon: '↓', sign: '' },
  recharge:        { label: 'Recarga',         color: '#4ade80', bg: 'rgba(34,197,94,0.15)', icon: '↑', sign: '+' },
  adjustment:      { label: 'Ajuste',          color: '#60a5fa', bg: 'rgba(96,165,250,0.15)', icon: '⇄', sign: '' },
  admin_credit:    { label: 'Crédito Admin',   color: '#4ade80', bg: 'rgba(34,197,94,0.18)', icon: '✦', sign: '+' },
  admin_debit:     { label: 'Débito Admin',    color: '#f87171', bg: 'rgba(239,68,68,0.18)', icon: '✦', sign: '' },
  refund:          { label: 'Reembolso',       color: '#4ade80', bg: 'rgba(34,197,94,0.15)', icon: '↩', sign: '+' },
  bonus:           { label: 'Bono',            color: '#fbbf24', bg: 'rgba(245,158,11,0.15)', icon: '★', sign: '+' },
};

const RECHARGE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pendiente', color: '#92400e', bg: '#fef3c7' },
  approved: { label: 'Aprobada',  color: '#065f46', bg: '#d1fae5' },
  rejected: { label: 'Rechazada', color: '#991b1b', bg: '#fee2e2' },
};

/* ══════════════════════════════════════════════════════════════ */
export default function VendedorBilleteraPage() {
  const [balance, setBalance] = useState(0);
  const [creditLimit, setCreditLimit] = useState(-500000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'movimientos' | 'recargar'>('movimientos');

  // Recharge form
  const [amount, setAmount] = useState('');
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [bankAliases, setBankAliases] = useState<BankAlias[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchWallet = useCallback(async () => {
    const res = await authFetch('/api/vendor/wallet');
    if (!res.ok) return;
    const json = await res.json();
    setBalance(Number(json.balance ?? 0));
    setCreditLimit(Number(json.credit_limit ?? -500000));
    setTransactions(json.transactions ?? []);
    setRechargeRequests(json.recharge_requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchWallet(); }, [fetchWallet]);

  useEffect(() => {
    authFetch('/api/admin/bank-alias')
      .then(r => r.ok ? r.json() : [])
      .then(data => setBankAliases(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      const [header, b64] = result.split(',');
      const mime = header.replace('data:', '').replace(';base64', '');
      setReceiptBase64(b64);
      setReceiptMime(mime);
      setReceiptPreview(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleRecharge(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { setMsg({ text: 'Ingresá un monto válido', ok: false }); return; }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await authFetch('/api/vendor/wallet', {
        method: 'POST',
        body: JSON.stringify({ amount: amt, receipt_base64: receiptBase64, receipt_mime: receiptMime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setMsg({ text: '✅ Solicitud enviada. El equipo la revisará pronto.', ok: true });
      setAmount('');
      setReceiptBase64(null);
      setReceiptMime(null);
      setReceiptPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      void fetchWallet();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Error desconocido', ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  // Balance color logic
  const isNegative = balance < 0;
  const isNearLimit = balance <= creditLimit * 0.5 && balance > creditLimit;
  const isBlocked = balance <= creditLimit;
  const balanceColor = isBlocked ? '#ef4444' : isNegative ? (isNearLimit ? '#f97316' : '#fbbf24') : '#4ade80';
  const balanceBg = isBlocked ? 'rgba(239,68,68,0.12)' : isNegative ? 'rgba(249,115,22,0.1)' : 'rgba(34,197,94,0.1)';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="vnd-page-heading" style={{ marginBottom: 4 }}>Billetera</h1>
          <p className="vnd-page-sub">Gestión de comisiones y recargas</p>
        </div>
        <Link href="/vendedor" className="vnd-btn vnd-btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
          ← Dashboard
        </Link>
      </div>

      {/* Balance card */}
      <div style={{ borderRadius: 20, padding: '24px 20px', background: balanceBg, border: `1.5px solid ${balanceColor}33`, marginBottom: 20, position: 'relative' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--vnd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Saldo disponible
        </div>
        <div style={{ fontSize: '2.4rem', fontWeight: 900, color: balanceColor, letterSpacing: '-0.02em' }}>
          {loading ? '—' : `Gs ${fmtGS(balance)}`}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--vnd-text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Límite negativo permitido: <strong style={{ color: '#f87171' }}>Gs {fmtGS(creditLimit)}</strong></span>
          {isBlocked && (
            <span style={{ color: '#ef4444', fontWeight: 700 }}>
              ⛔ Límite alcanzado — recargá para seguir vendiendo
            </span>
          )}
          {isNearLimit && !isBlocked && (
            <span style={{ color: '#f97316', fontWeight: 700 }}>
              ⚠️ Saldo cerca del límite — considerá recargar pronto
            </span>
          )}
          {!isNegative && (
            <span style={{ color: '#4ade80' }}>✓ Saldo positivo</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="vnd-tabs" style={{ marginBottom: 20 }}>
        <button className={`vnd-tab${tab === 'movimientos' ? ' active' : ''}`} onClick={() => setTab('movimientos')}>
          Movimientos
        </button>
        <button className={`vnd-tab${tab === 'recargar' ? ' active' : ''}`} onClick={() => setTab('recargar')}>
          Recargar
        </button>
      </div>

      {/* Movimientos */}
      {tab === 'movimientos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--vnd-text-muted)', padding: 32 }}>Cargando...</div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--vnd-text-muted)', padding: 32, borderRadius: 14, border: '1px solid var(--vnd-border)' }}>
              Sin movimientos aún
            </div>
          ) : transactions.map(tx => {
            const cfg = TX_CONFIG[tx.type] ?? { label: tx.type, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', icon: '•', sign: '' };
            const positive = tx.amount >= 0;
            return (
              <div key={tx.id} style={{ background: 'var(--vnd-surface)', border: '1px solid var(--vnd-border)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: cfg.color, flexShrink: 0 }}>
                  {cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--vnd-text)' }}>{cfg.label}</div>
                  {tx.note && <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</div>}
                  <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>{fmtDate(tx.created_at)}</div>
                </div>
                <div style={{ fontWeight: 900, fontSize: '0.95rem', color: positive ? '#4ade80' : '#f87171', flexShrink: 0 }}>
                  {cfg.sign}Gs {fmtGS(Math.abs(tx.amount))}
                </div>
              </div>
            );
          })}

          {/* Recharge requests history */}
          {rechargeRequests.length > 0 && (
            <>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--vnd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>
                Solicitudes de recarga
              </div>
              {rechargeRequests.map(r => {
                const sc = RECHARGE_STATUS[r.status];
                return (
                  <div key={r.id} style={{ background: 'var(--vnd-surface)', border: '1px solid var(--vnd-border)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>+Gs {fmtGS(r.amount)}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      {r.rejection_note && <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 4 }}>{r.rejection_note}</div>}
                      <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>{fmtDate(r.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Recargar */}
      {tab === 'recargar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Bank aliases */}
          {bankAliases.length > 0 && (
            <div style={{ background: 'var(--vnd-surface)', border: '1px solid var(--vnd-border)', borderRadius: 16, padding: 16 }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--vnd-text)', marginBottom: 12 }}>
                💳 Datos para transferencia
              </div>
              {bankAliases.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--vnd-border)', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--vnd-text)' }}>{a.bank_name}</span>
                  <span style={{ color: 'var(--vnd-text-muted)', marginLeft: 8 }}>{a.alias}</span>
                  {a.extra_info && <div style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>{a.extra_info}</div>}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={e => void handleRecharge(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--vnd-text-muted)', display: 'block', marginBottom: 6 }}>
                Monto a recargar (Gs)
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Ej: 200000"
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid var(--vnd-border)', background: 'var(--vnd-surface)', color: 'var(--vnd-text)', fontSize: '1rem', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--vnd-text-muted)', display: 'block', marginBottom: 6 }}>
                Comprobante de pago (opcional)
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px dashed var(--vnd-border)', background: 'var(--vnd-surface)', color: 'var(--vnd-text-muted)', fontSize: '0.88rem', cursor: 'pointer' }}
              >
                {receiptPreview ? '✓ Imagen seleccionada — tocar para cambiar' : '📎 Subir comprobante'}
              </button>
              {receiptPreview && (
                <img src={receiptPreview} alt="Comprobante" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 200, borderRadius: 10, objectFit: 'contain' }} />
              )}
            </div>

            {msg && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: msg.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: msg.ok ? '#4ade80' : '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="vnd-btn vnd-btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}
            >
              {submitting ? 'Enviando...' : 'Solicitar recarga'}
            </button>
          </form>

          <p style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Las recargas son revisadas y aprobadas por el equipo.<br />
            El saldo se acredita automáticamente al aprobarla.
          </p>
        </div>
      )}
    </div>
  );
}
