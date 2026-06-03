'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

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

function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function monthKey(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

const TX_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string; sign: string }> = {
  sale_commission: { label: 'Comisión venta', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '↓', sign: '' },
  recharge: { label: 'Recarga', color: '#16a34a', bg: 'rgba(34,197,94,0.15)', icon: '↑', sign: '+' },
  adjustment: { label: 'Ajuste', color: '#3b82f6', bg: 'rgba(96,165,250,0.15)', icon: '⇄', sign: '' },
  admin_credit: { label: 'Crédito admin', color: '#16a34a', bg: 'rgba(34,197,94,0.18)', icon: '✦', sign: '+' },
  admin_debit: { label: 'Débito admin', color: '#ef4444', bg: 'rgba(239,68,68,0.18)', icon: '✦', sign: '' },
  refund: { label: 'Reembolso', color: '#16a34a', bg: 'rgba(34,197,94,0.15)', icon: '↩', sign: '+' },
  bonus: { label: 'Bono', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '★', sign: '+' },
};

const RECHARGE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: '#92400e', bg: '#fef3c7' },
  approved: { label: 'Aprobada', color: '#065f46', bg: '#d1fae5' },
  rejected: { label: 'Rechazada', color: '#991b1b', bg: '#fee2e2' },
};

export default function VendedorBilleteraPage() {
  const [balance, setBalance] = useState(0);
  const [creditLimit, setCreditLimit] = useState(-500000);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'movimientos' | 'recargar'>('movimientos');

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

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    authFetch('/api/admin/bank-alias')
      .then(r => (r.ok ? r.json() : []))
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
    if (!amt || amt <= 0) {
      setMsg({ text: 'Ingresá un monto válido', ok: false });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await authFetch('/api/vendor/wallet', {
        method: 'POST',
        body: JSON.stringify({ amount: amt, receipt_base64: receiptBase64, receipt_mime: receiptMime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');

      setMsg({ text: 'Solicitud enviada. El equipo la revisará pronto.', ok: true });
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

  const isNegative = balance < 0;
  const isNearLimit = balance <= creditLimit * 0.5 && balance > creditLimit;
  const isBlocked = balance <= creditLimit;
  const balanceColor = isBlocked ? '#ef4444' : isNegative ? (isNearLimit ? '#f97316' : '#f59e0b') : '#22c55e';
  const balanceBg = isBlocked ? 'rgba(239,68,68,0.12)' : isNegative ? 'rgba(249,115,22,0.10)' : 'rgba(16,185,129,0.12)';

  const pendingRecharges = rechargeRequests.filter(r => r.status === 'pending').length;
  const currentMonth = monthKey(new Date().toISOString());
  const monthTx = transactions.filter(tx => monthKey(tx.created_at) === currentMonth);
  const monthIncome = monthTx.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const monthCommission = monthTx
    .filter(tx => tx.type === 'sale_commission')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const usagePct = creditLimit < 0 && balance < 0
    ? Math.min(100, Math.max(0, Math.round((Math.abs(balance) / Math.abs(creditLimit)) * 100)))
    : 0;

  return (
    <div className="vnd-wallet-page">
      <div className="vnd-wallet-header">
        <div>
          <p className="vnd-wallet-kicker">Centro Financiero</p>
          <h1 className="vnd-page-heading" style={{ marginBottom: 6 }}>Billetera del Vendedor</h1>
          <p className="vnd-page-sub">Controlá saldo, comisiones y recargas desde un solo panel.</p>
        </div>
        <Link href="/vendedor" className="vnd-btn vnd-btn-secondary vnd-wallet-back">
          Volver al dashboard
        </Link>
      </div>

      <section className="vnd-wallet-hero" style={{ background: balanceBg, borderColor: `${balanceColor}44` }}>
        <div className="vnd-wallet-hero-main">
          <p className="vnd-wallet-label">Saldo actual</p>
          <h2 className="vnd-wallet-balance" style={{ color: balanceColor }}>
            {loading ? '—' : `Gs ${fmtGS(balance)}`}
          </h2>
          <p className="vnd-wallet-limit">Límite negativo permitido: Gs {fmtGS(creditLimit)}</p>
          <div className="vnd-wallet-progress-wrap">
            <div className="vnd-wallet-progress-track">
              <div className="vnd-wallet-progress-fill" style={{ width: `${usagePct}%` }} />
            </div>
            <span className="vnd-wallet-progress-text">Uso de límite: {usagePct}%</span>
          </div>
        </div>

        <div className="vnd-wallet-alert">
          {isBlocked && 'Límite alcanzado. Necesitás recargar para continuar vendiendo.'}
          {isNearLimit && !isBlocked && 'Tu saldo está cerca del límite negativo. Recomendado recargar hoy.'}
          {!isNegative && 'Cuenta saludable. Tenés margen operativo disponible.'}
          {isNegative && !isNearLimit && !isBlocked && 'Saldo en negativo dentro del rango permitido.'}
        </div>
      </section>

      <section className="vnd-wallet-stats">
        <article className="vnd-wallet-stat">
          <span className="vnd-wallet-stat-label">Ingresos del mes</span>
          <strong className="vnd-wallet-stat-value pos">+Gs {fmtGS(monthIncome)}</strong>
        </article>
        <article className="vnd-wallet-stat">
          <span className="vnd-wallet-stat-label">Comisiones del mes</span>
          <strong className="vnd-wallet-stat-value neg">-Gs {fmtGS(monthCommission)}</strong>
        </article>
        <article className="vnd-wallet-stat">
          <span className="vnd-wallet-stat-label">Recargas pendientes</span>
          <strong className="vnd-wallet-stat-value">{pendingRecharges}</strong>
        </article>
        <article className="vnd-wallet-stat">
          <span className="vnd-wallet-stat-label">Movimientos totales</span>
          <strong className="vnd-wallet-stat-value">{transactions.length}</strong>
        </article>
      </section>

      <div className="vnd-wallet-tabs">
        <button className={`vnd-wallet-tab ${tab === 'movimientos' ? 'active' : ''}`} onClick={() => setTab('movimientos')}>
          Movimientos
        </button>
        <button className={`vnd-wallet-tab ${tab === 'recargar' ? 'active' : ''}`} onClick={() => setTab('recargar')}>
          Recargar saldo
        </button>
      </div>

      {tab === 'movimientos' && (
        <section className="vnd-wallet-panel">
          <div className="vnd-wallet-panel-head">
            <h3>Historial financiero</h3>
            <span>{transactions.length} registros</span>
          </div>

          {loading ? (
            <div className="vnd-wallet-empty">Cargando movimientos...</div>
          ) : transactions.length === 0 ? (
            <div className="vnd-wallet-empty">Todavía no hay movimientos en tu billetera.</div>
          ) : (
            <div className="vnd-wallet-list">
              {transactions.map(tx => {
                const cfg = TX_CONFIG[tx.type] ?? { label: tx.type, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', icon: '•', sign: '' };
                const positive = tx.amount >= 0;
                return (
                  <article key={tx.id} className="vnd-wallet-row">
                    <div className="vnd-wallet-row-icon" style={{ background: cfg.bg, color: cfg.color }}>{cfg.icon}</div>
                    <div className="vnd-wallet-row-meta">
                      <p className="vnd-wallet-row-title">{cfg.label}</p>
                      {tx.note && <p className="vnd-wallet-row-note">{tx.note}</p>}
                      <p className="vnd-wallet-row-date">{fmtDate(tx.created_at)}</p>
                    </div>
                    <div className={`vnd-wallet-row-amount ${positive ? 'pos' : 'neg'}`}>
                      {cfg.sign}Gs {fmtGS(Math.abs(tx.amount))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {rechargeRequests.length > 0 && (
            <div className="vnd-wallet-subpanel">
              <div className="vnd-wallet-subpanel-head">
                <h4>Solicitudes de recarga</h4>
              </div>
              <div className="vnd-wallet-requests">
                {rechargeRequests.map(r => {
                  const sc = RECHARGE_STATUS[r.status];
                  return (
                    <div key={r.id} className="vnd-wallet-request">
                      <div>
                        <p className="vnd-wallet-request-amount">+Gs {fmtGS(r.amount)}</p>
                        <p className="vnd-wallet-row-date">{fmtDate(r.created_at)}</p>
                        {r.rejection_note && <p className="vnd-wallet-request-reject">{r.rejection_note}</p>}
                      </div>
                      <span className="vnd-wallet-status" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'recargar' && (
        <section className="vnd-wallet-panel vnd-wallet-recharge-grid">
          <aside className="vnd-wallet-transfer-card">
            <div className="vnd-wallet-panel-head">
              <h3>Datos para transferencia</h3>
            </div>
            {bankAliases.length === 0 ? (
              <div className="vnd-wallet-empty small">No hay alias bancarios cargados.</div>
            ) : (
              <div className="vnd-wallet-banks">
                {bankAliases.map(a => (
                  <div key={a.id} className="vnd-wallet-bank-row">
                    <p className="vnd-wallet-bank-name">{a.bank_name}</p>
                    <p className="vnd-wallet-bank-alias">{a.alias}</p>
                    {a.extra_info && <p className="vnd-wallet-bank-extra">{a.extra_info}</p>}
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div className="vnd-wallet-form-card">
            <div className="vnd-wallet-panel-head">
              <h3>Nueva solicitud de recarga</h3>
            </div>

            <form onSubmit={e => void handleRecharge(e)} className="vnd-wallet-form">
              <label className="vnd-wallet-field">
                <span>Monto a recargar (Gs)</span>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Ej: 200000"
                  required
                />
              </label>

              <label className="vnd-wallet-field">
                <span>Comprobante de pago (opcional)</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <button type="button" className="vnd-wallet-upload" onClick={() => fileRef.current?.click()}>
                  {receiptPreview ? 'Comprobante cargado. Tocar para cambiar' : 'Subir comprobante'}
                </button>
              </label>

              {receiptPreview && (
                <img src={receiptPreview} alt="Comprobante" className="vnd-wallet-proof" />
              )}

              {msg && (
                <div className={`vnd-wallet-message ${msg.ok ? 'ok' : 'err'}`}>
                  {msg.text}
                </div>
              )}

              <button type="submit" disabled={submitting} className="vnd-btn vnd-btn-primary" style={{ width: '100%', padding: '14px' }}>
                {submitting ? 'Enviando solicitud...' : 'Solicitar recarga'}
              </button>
            </form>

            <p className="vnd-wallet-footnote">
              Las solicitudes son revisadas por administración. El saldo se acredita automáticamente al aprobarse.
            </p>
          </div>
        </section>
      )}

      <style jsx>{`
        .vnd-wallet-page {
          max-width: 1020px;
          margin: 0 auto;
          padding: 24px 16px 84px;
        }
        .vnd-wallet-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .vnd-wallet-kicker {
          margin: 0 0 6px;
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--vnd-accent-hover);
        }
        .vnd-wallet-back {
          font-size: 0.82rem;
          padding: 8px 12px;
          white-space: nowrap;
        }
        .vnd-wallet-hero {
          border-radius: 22px;
          border: 1.5px solid;
          padding: 24px;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 18px;
          align-items: end;
        }
        .vnd-wallet-label {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--vnd-text-muted);
        }
        .vnd-wallet-balance {
          margin: 8px 0 10px;
          font-size: clamp(2rem, 4vw, 2.9rem);
          line-height: 1.05;
          letter-spacing: -0.03em;
          font-weight: 900;
        }
        .vnd-wallet-limit {
          margin: 0;
          font-size: 0.84rem;
          color: var(--vnd-text-secondary);
          font-weight: 600;
        }
        .vnd-wallet-alert {
          padding: 14px 16px;
          border-radius: 14px;
          background: rgba(11, 18, 32, 0.06);
          color: var(--vnd-text-primary);
          font-size: 0.84rem;
          font-weight: 650;
          line-height: 1.4;
        }
        .vnd-wallet-progress-wrap {
          margin-top: 14px;
        }
        .vnd-wallet-progress-track {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.2);
          overflow: hidden;
        }
        .vnd-wallet-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #f5c518 0%, #f58a07 100%);
          transition: width 260ms ease;
        }
        .vnd-wallet-progress-text {
          display: inline-block;
          margin-top: 8px;
          font-size: 0.74rem;
          color: var(--vnd-text-muted);
          font-weight: 700;
        }
        .vnd-wallet-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .vnd-wallet-stat {
          background: var(--vnd-surface);
          border: 1px solid var(--vnd-border);
          border-radius: 14px;
          padding: 12px 14px;
        }
        .vnd-wallet-stat-label {
          display: block;
          margin-bottom: 6px;
          font-size: 0.73rem;
          color: var(--vnd-text-muted);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .vnd-wallet-stat-value {
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--vnd-text-primary);
        }
        .vnd-wallet-stat-value.pos { color: #059669; }
        .vnd-wallet-stat-value.neg { color: #dc2626; }
        .vnd-wallet-tabs {
          margin: 18px 0 12px;
          padding: 4px;
          border-radius: 12px;
          width: fit-content;
          background: var(--vnd-surface-2);
          border: 1px solid var(--vnd-border);
          display: flex;
          gap: 4px;
        }
        .vnd-wallet-tab {
          border: none;
          background: transparent;
          color: var(--vnd-text-secondary);
          padding: 9px 14px;
          border-radius: 10px;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
        }
        .vnd-wallet-tab.active {
          background: var(--vnd-surface);
          color: var(--vnd-text-primary);
          box-shadow: 0 1px 8px rgba(15, 23, 42, 0.08);
        }
        .vnd-wallet-panel {
          background: var(--vnd-surface);
          border: 1px solid var(--vnd-border);
          border-radius: 18px;
          padding: 16px;
        }
        .vnd-wallet-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          gap: 10px;
        }
        .vnd-wallet-panel-head h3,
        .vnd-wallet-panel-head h4 {
          margin: 0;
          font-size: 0.98rem;
          color: var(--vnd-text-primary);
          font-weight: 800;
        }
        .vnd-wallet-panel-head span {
          font-size: 0.75rem;
          color: var(--vnd-text-muted);
          font-weight: 700;
        }
        .vnd-wallet-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vnd-wallet-row {
          border: 1px solid var(--vnd-border);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--vnd-surface);
        }
        .vnd-wallet-row-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          flex-shrink: 0;
          font-weight: 700;
        }
        .vnd-wallet-row-meta {
          min-width: 0;
          flex: 1;
        }
        .vnd-wallet-row-title {
          margin: 0;
          font-size: 0.86rem;
          color: var(--vnd-text-primary);
          font-weight: 700;
        }
        .vnd-wallet-row-note {
          margin: 2px 0 0;
          font-size: 0.75rem;
          color: var(--vnd-text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vnd-wallet-row-date {
          margin: 4px 0 0;
          font-size: 0.72rem;
          color: var(--vnd-text-muted);
          font-weight: 600;
        }
        .vnd-wallet-row-amount {
          font-size: 0.9rem;
          font-weight: 900;
          white-space: nowrap;
        }
        .vnd-wallet-row-amount.pos { color: #059669; }
        .vnd-wallet-row-amount.neg { color: #dc2626; }
        .vnd-wallet-subpanel {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px dashed var(--vnd-border);
        }
        .vnd-wallet-requests {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vnd-wallet-request {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border: 1px solid var(--vnd-border);
          border-radius: 12px;
          padding: 10px 12px;
        }
        .vnd-wallet-request-amount {
          margin: 0;
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--vnd-text-primary);
        }
        .vnd-wallet-request-reject {
          margin: 6px 0 0;
          color: #dc2626;
          font-size: 0.74rem;
          font-weight: 600;
        }
        .vnd-wallet-status {
          font-size: 0.72rem;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .vnd-wallet-recharge-grid {
          display: grid;
          grid-template-columns: minmax(260px, 0.9fr) minmax(0, 1.1fr);
          gap: 14px;
          align-items: start;
        }
        .vnd-wallet-transfer-card,
        .vnd-wallet-form-card {
          border: 1px solid var(--vnd-border);
          border-radius: 14px;
          padding: 12px;
          background: var(--vnd-surface);
        }
        .vnd-wallet-banks {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vnd-wallet-bank-row {
          border-radius: 10px;
          border: 1px dashed var(--vnd-border);
          padding: 9px 10px;
          background: var(--vnd-surface-2);
        }
        .vnd-wallet-bank-name {
          margin: 0;
          font-size: 0.83rem;
          font-weight: 800;
          color: var(--vnd-text-primary);
        }
        .vnd-wallet-bank-alias {
          margin: 2px 0 0;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--vnd-text-secondary);
        }
        .vnd-wallet-bank-extra {
          margin: 4px 0 0;
          font-size: 0.72rem;
          color: var(--vnd-text-muted);
        }
        .vnd-wallet-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .vnd-wallet-field span {
          display: block;
          margin-bottom: 6px;
          font-size: 0.79rem;
          color: var(--vnd-text-muted);
          font-weight: 700;
        }
        .vnd-wallet-field input {
          width: 100%;
          border: 1.5px solid var(--vnd-border);
          border-radius: 10px;
          padding: 11px 12px;
          font-size: 0.9rem;
          color: var(--vnd-text-primary);
          background: var(--vnd-surface);
          box-sizing: border-box;
        }
        .vnd-wallet-upload {
          width: 100%;
          border: 1.5px dashed var(--vnd-border);
          border-radius: 10px;
          padding: 11px 12px;
          background: var(--vnd-surface-2);
          color: var(--vnd-text-secondary);
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
        }
        .vnd-wallet-proof {
          max-width: 100%;
          max-height: 220px;
          object-fit: contain;
          border-radius: 12px;
          border: 1px solid var(--vnd-border);
        }
        .vnd-wallet-message {
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.83rem;
          font-weight: 700;
        }
        .vnd-wallet-message.ok {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }
        .vnd-wallet-message.err {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }
        .vnd-wallet-footnote {
          margin: 12px 2px 0;
          font-size: 0.74rem;
          color: var(--vnd-text-muted);
          line-height: 1.45;
        }
        .vnd-wallet-empty {
          text-align: center;
          color: var(--vnd-text-muted);
          padding: 24px 14px;
          border: 1px dashed var(--vnd-border);
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.86rem;
        }
        .vnd-wallet-empty.small {
          padding: 16px 10px;
          font-size: 0.8rem;
        }

        @media (max-width: 980px) {
          .vnd-wallet-hero {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .vnd-wallet-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .vnd-wallet-recharge-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .vnd-wallet-page {
            padding: 16px 12px 76px;
          }
          .vnd-wallet-header {
            flex-direction: column;
            align-items: stretch;
          }
          .vnd-wallet-back {
            width: 100%;
            text-align: center;
          }
          .vnd-wallet-stats {
            grid-template-columns: 1fr;
          }
          .vnd-wallet-tabs {
            width: 100%;
          }
          .vnd-wallet-tab {
            flex: 1;
          }
          .vnd-wallet-row {
            align-items: flex-start;
          }
          .vnd-wallet-row-amount {
            font-size: 0.82rem;
          }
        }
      `}</style>
    </div>
  );
}
