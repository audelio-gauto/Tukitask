'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';

interface BankAlias {
  id: number;
  bank_name: string;
  alias: string;
  extra_info: string | null;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  order_id: string | null;
  job_id: string | null;
  note: string | null;
  created_at: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtGS(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

// Format raw "Gs 2500.00" numbers inside note strings → "Gs 2.500"
// Also strips leaked admin email from old recharge notes.
function fmtNote(note: string | null): string {
  if (!note) return '';
  // Remove " por admin@..." suffix on recharge notes
  const clean = note.replace(/^(Recarga aprobada)\s+por\s+\S+/i, '$1');
  return clean.replace(/Gs\s+([\d]+(?:\.\d+)?)/g, (_, n) =>
    'Gs\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(Math.round(parseFloat(n)))
  );
}

const TX_CONFIG: Record<string, { label: string; tone: 'in' | 'out' | 'neutral' | 'bonus'; icon: string; sign: string }> = {
  recharge:     { label: 'Recarga',        tone: 'in',      icon: '↑', sign: '+' },
  commission:   { label: 'Comisión',       tone: 'out',     icon: '↓', sign: '-' },
  adjustment:   { label: 'Ajuste',         tone: 'neutral', icon: '⇄', sign: ''  },
  admin_credit: { label: 'Crédito Admin',  tone: 'in',      icon: '✦', sign: '+' },
  admin_debit:  { label: 'Débito Admin',   tone: 'out',     icon: '✦', sign: '-' },
  refund:       { label: 'Reembolso',      tone: 'in',      icon: '↩', sign: '+' },
  bonus:        { label: 'Bono',           tone: 'bonus',   icon: '★', sign: '+' },
};

export default function DriverBilleteraPage() {
  const { email, displayName, profilePhoto } = useWorkerContext();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
    if (!email) return;
    const res = await authFetch('/api/wallet');
    if (!res.ok) return;
    const json = await res.json();
    setBalance(Number(json.balance ?? 0));
    setTransactions(json.transactions ?? []);
    setLoading(false);
  }, [email]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

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

  async function handleSubmitRecharge(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(amount.replace(/\./g, ''));
    if (!parsed || parsed <= 0) { setMsg({ text: 'Ingresá un monto válido', ok: false }); return; }
    if (!receiptBase64) { setMsg({ text: '⚠ Debés adjuntar el comprobante', ok: false }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await authFetch('/api/wallet', {
        method: 'POST',
        body: JSON.stringify({ amount: parsed, receipt_base64: receiptBase64 ?? undefined, receipt_mime: receiptMime ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ text: json.error || 'Error al enviar solicitud', ok: false });
      } else {
        setMsg({ text: '✓ Solicitud enviada. El admin la revisará pronto.', ok: true });
        setAmount(''); setReceiptBase64(null); setReceiptMime(null); setReceiptPreview(null);
      }
    } catch { setMsg({ text: 'Error de conexión', ok: false }); }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <DriverScreenLayout title="Mi Billetera">
        <div className="tuki-empty-state">Cargando billetera…</div>
      </DriverScreenLayout>
    );
  }

  const isLow = balance < 5000;
  const totalIn  = transactions.filter(t => t.type === 'recharge').reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalOut = transactions.filter(t => t.type === 'commission').reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <DriverScreenLayout title="Mi Billetera">
      <div className="tuki-wallet-page">

        <section className={`tuki-wallet-hero${isLow ? ' is-low' : ''}`}>
          <div className="tuki-wallet-owner">
            {profilePhoto ? (
              <img src={profilePhoto} alt="" loading="lazy" decoding="async" className="tuki-wallet-avatar" />
            ) : (
              <div className="tuki-wallet-avatar">{(displayName || email || 'D').charAt(0).toUpperCase()}</div>
            )}
            <div className="tuki-wallet-owner-copy">
              <div className="tuki-wallet-owner-label">Billetera de</div>
              <div className="tuki-wallet-owner-name">{displayName || email}</div>
            </div>
            <span className={`tuki-wallet-badge ${isLow ? 'is-low' : 'is-ok'}`}>{isLow ? 'Saldo bajo' : 'Al día'}</span>
          </div>

          <div className="tuki-wallet-balance-label">Saldo disponible</div>
          <div className="tuki-wallet-balance"><span>Gs.</span>{fmtGS(balance)}</div>

          <div className="tuki-wallet-stats">
            <div className="tuki-wallet-stat">
              <div className="tuki-wallet-stat-label">Total recargado</div>
              <div className="tuki-wallet-stat-value is-in">Gs. {fmtGS(totalIn)}</div>
            </div>
            <div className="tuki-wallet-stat">
              <div className="tuki-wallet-stat-label">Total comisiones</div>
              <div className="tuki-wallet-stat-value is-out">Gs. {fmtGS(totalOut)}</div>
            </div>
          </div>
        </section>

        <div className="tuki-segmented" role="tablist">
          {(['movimientos', 'recargar'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={tab === t ? 'is-active' : ''}>
              {t === 'movimientos' ? 'Movimientos' : 'Recargar'}
            </button>
          ))}
        </div>

        {tab === 'movimientos' && (
          <div className="tuki-wallet-section">
            {transactions.length === 0 ? (
              <div className="tuki-empty-state">
                <div className="tuki-empty-title">Sin movimientos aún</div>
                <div>Tus recargas y comisiones aparecerán aquí.</div>
              </div>
            ) : (
              <div className="tuki-tx-list">
                {transactions.map((tx) => {
                  const cfg = TX_CONFIG[tx.type] ?? TX_CONFIG.adjustment;
                  const absAmt = Math.abs(tx.amount);
                  const isAdmin = tx.type === 'admin_credit' || tx.type === 'admin_debit';
                  // Strip "[Admin: email]" prefix for clean display, keep the rest as note
                  const adminNoteMatch = tx.note?.match(/^\[Admin: ([^\]]+)\]\s*(.*)/);
                  const adminWho = adminNoteMatch ? adminNoteMatch[1] : null;
                  const cleanNote = adminNoteMatch ? adminNoteMatch[2] : tx.note;
                  return (
                    <div key={tx.id} className={`tuki-tx-row is-${cfg.tone}${isAdmin ? ' is-admin' : ''}`}>
                      <div className="tuki-tx-icon">{cfg.icon}</div>
                      <div className="tuki-tx-main">
                        <div className="tuki-tx-title">
                          {isAdmin ? cfg.label : (fmtNote(tx.note) || cfg.label)}
                        </div>
                        {isAdmin && cleanNote && (
                          <div className="tuki-tx-note">{fmtNote(cleanNote)}</div>
                        )}
                        <div className="tuki-tx-date">
                          {fmtDate(tx.created_at)}
                          {adminWho && <span> · Admin</span>}
                        </div>
                      </div>
                      <div className="tuki-tx-side">
                        <div className="tuki-tx-amount">{cfg.sign}Gs. {fmtGS(absAmt)}</div>
                        <div className="tuki-tx-type">{cfg.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Recargar ── */}
        {tab === 'recargar' && (
          <div className="tuki-wallet-section">
            {bankAliases.length > 0 && (
              <div className="tuki-bank-card">
                <div className="tuki-section-label">Transferí a estas cuentas</div>
                {bankAliases.map(b => (
                  <div key={b.id} className="tuki-bank-row">
                    <div className="tuki-bank-name">{b.bank_name}</div>
                    <div className="tuki-bank-alias">{b.alias}</div>
                    {b.extra_info && <div className="tuki-bank-extra">{b.extra_info}</div>}
                  </div>
                ))}
                <div className="tuki-bank-hint">Adjuntá el comprobante de la transferencia.</div>
              </div>
            )}

            <div className="tuki-form-card">
              <form onSubmit={handleSubmitRecharge}>
                <div className="tuki-field">
                  <div className="tuki-section-label">Monto a recargar (Gs)</div>
                  <input
                    type="text" inputMode="numeric" value={amount}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setAmount(raw ? Number(raw).toLocaleString('es-PY') : '');
                    }}
                    placeholder="Ej: 50.000"
                    required
                    className="tuki-amount-input"
                  />
                </div>

                <div className="tuki-field">
                  <div className="tuki-section-label">Comprobante de pago</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className={`tuki-upload-btn${receiptPreview ? ' is-done' : ''}`}>
                    {receiptPreview ? 'Comprobante cargado · tocá para cambiar' : 'Adjuntar comprobante (requerido)'}
                  </button>
                  {receiptPreview && (
                    <img src={receiptPreview} alt="comprobante" className="tuki-receipt-preview" />
                  )}
                </div>

                {msg && (
                  <div className={`tuki-form-msg ${msg.ok ? 'is-ok' : 'is-error'}`}>{msg.text}</div>
                )}

                <button type="submit" disabled={submitting} className="tuki-submit-btn">
                  {submitting ? 'Enviando…' : 'Enviar solicitud de recarga'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </DriverScreenLayout>
  );
}
