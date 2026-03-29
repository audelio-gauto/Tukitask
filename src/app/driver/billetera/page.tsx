'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext } from '../context';
import { authFetch } from '@/lib/authFetch';

interface BankAlias {
  id: number;
  bank_name: string;
  alias: string;
  extra_info: string | null;
}

interface Transaction {
  id: string;
  type: 'recharge' | 'commission' | 'adjustment';
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

const TX_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string; sign: string }> = {
  recharge:   { label: 'Recarga',    color: '#4ade80', bg: 'rgba(34,197,94,0.15)',   icon: '↑', sign: '+' },
  commission: { label: 'Comisión',   color: '#f87171', bg: 'rgba(239,68,68,0.15)',   icon: '↓', sign: '-' },
  adjustment: { label: 'Ajuste',     color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  icon: '⇄', sign: ''  },
};

export default function DriverBilleteraPage() {
  const { email, displayName, profilePhoto } = useDriverContext();
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
    const parsed = Number(amount);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem' }}>Cargando billetera…</div>
        </div>
      </DriverScreenLayout>
    );
  }

  const isLow = balance < 5000;
  const totalIn  = transactions.filter(t => t.type === 'recharge').reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalOut = transactions.filter(t => t.type === 'commission').reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <DriverScreenLayout title="Mi Billetera">
      <div style={{ minHeight: '100vh', background: '#0e0e1a', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>

        {/* ── Hero balance card ── */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: 24,
          background: 'linear-gradient(135deg, #2563EB 0%, #1e40af 50%, #1C1C2E 100%)',
          padding: '24px 22px 20px',
          boxShadow: '0 8px 32px rgba(37,99,235,0.35)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(245,197,24,0.12)' }} />

          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {profilePhoto ? (
              <img src={profilePhoto} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', border: '2px solid rgba(255,255,255,0.2)' }}>👤</div>
            )}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>Billetera de</div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#fff' }}>{displayName || email}</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              {isLow ? (
                <div style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 20, padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: '#fca5a5' }}>⚠ Saldo bajo</div>
              ) : (
                <div style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 20, padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: '#4ade80' }}>● Activo</div>
              )}
            </div>
          </div>

          {/* Balance */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Saldo disponible</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 500, verticalAlign: 'super', marginRight: 4, color: 'rgba(255,255,255,0.6)' }}>Gs.</span>
              {fmtGS(balance)}
            </div>
          </div>

          {/* Mini stats */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>Total recargado</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#4ade80' }}>Gs. {fmtGS(totalIn)}</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>Total comisiones</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f87171' }}>Gs. {fmtGS(totalOut)}</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', margin: '16px 16px 0', background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 4 }}>
          {(['movimientos', 'recargar'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 700,
              fontSize: '0.88rem', transition: 'all 0.2s',
              background: tab === t ? 'linear-gradient(135deg, #2563EB, #1e40af)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
              boxShadow: tab === t ? '0 2px 12px rgba(37,99,235,0.4)' : 'none',
            }}>
              {t === 'movimientos' ? '📊 Movimientos' : '➕ Recargar'}
            </button>
          ))}
        </div>

        {/* ── Tab: Movimientos ── */}
        {tab === 'movimientos' && (
          <div style={{ padding: '16px 16px 40px' }}>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 600 }}>Sin movimientos aún</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {transactions.map((tx) => {
                  const cfg = TX_CONFIG[tx.type] ?? TX_CONFIG.adjustment;
                  const absAmt = Math.abs(tx.amount);
                  return (
                    <div key={tx.id} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: 'rgba(255,255,255,0.04)', borderRadius: 16,
                      padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        background: cfg.bg, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800, color: cfg.color,
                      }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tx.note || cfg.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>{fmtDate(tx.created_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: '1rem', color: cfg.color }}>
                          {cfg.sign}Gs. {fmtGS(absAmt)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{cfg.label}</div>
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
          <div style={{ padding: '16px 16px 40px' }}>
            {/* Bank aliases */}
            {bankAliases.length > 0 && (
              <div style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#93c5fd', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>🏦 Transferí a estas cuentas</div>
                {bankAliases.map(b => (
                  <div key={b.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{b.bank_name}</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#60a5fa', letterSpacing: '0.02em' }}>{b.alias}</div>
                    {b.extra_info && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>{b.extra_info}</div>}
                  </div>
                ))}
                <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>Adjuntá el comprobante de la transferencia.</div>
              </div>
            )}

            {/* Form */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '20px 16px' }}>
              <form onSubmit={handleSubmitRecharge}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto a recargar (Gs)</div>
                  <input
                    type="number" min="1000" step="1000" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Ej: 50.000"
                    required
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: 14, boxSizing: 'border-box',
                      border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)',
                      color: '#fff', fontSize: '1.1rem', fontWeight: 700, outline: 'none',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comprobante de pago</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  <button type="button" onClick={() => fileRef.current?.click()} style={{
                    width: '100%', padding: '14px', borderRadius: 14,
                    border: receiptPreview ? '1.5px solid rgba(34,197,94,0.5)' : '1.5px dashed rgba(239,68,68,0.5)',
                    background: receiptPreview ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                    color: receiptPreview ? '#4ade80' : '#f87171', fontSize: '0.88rem', cursor: 'pointer', fontWeight: 700,
                  }}>
                    {receiptPreview ? '✓ Comprobante cargado — toca para cambiar' : '📷 Requerido: Adjuntar comprobante'}
                  </button>
                  {receiptPreview && (
                    <img src={receiptPreview} alt="comprobante" style={{ marginTop: 10, height: 90, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(34,197,94,0.3)' }} />
                  )}
                </div>

                {msg && (
                  <div style={{
                    marginBottom: 16, padding: '12px 14px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600,
                    background: msg.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: msg.ok ? '#4ade80' : '#f87171',
                  }}>
                    {msg.text}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                  background: submitting ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg, #2563EB, #1e40af)',
                  color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 4px 20px rgba(37,99,235,0.4)',
                }}>
                  {submitting ? 'Enviando…' : 'Enviar Solicitud de Recarga'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </DriverScreenLayout>
  );
}
