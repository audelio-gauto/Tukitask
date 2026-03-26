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
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export default function DriverBilleteraPage() {
  const { email } = useDriverContext();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!parsed || parsed <= 0) {
      setMsg({ text: 'Ingresa un monto válido', ok: false });
      return;
    }
    if (!receiptBase64) {
      setMsg({ text: '⚠ Debes adjuntar el comprobante de pago', ok: false });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await authFetch('/api/wallet', {
        method: 'POST',
        body: JSON.stringify({
          amount: parsed,
          receipt_base64: receiptBase64 ?? undefined,
          receipt_mime: receiptMime ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ text: json.error || 'Error al enviar solicitud', ok: false });
      } else {
        setMsg({ text: '✓ Solicitud enviada. El admin la revisará pronto.', ok: true });
        setAmount('');
        setReceiptBase64(null);
        setReceiptMime(null);
        setReceiptPreview(null);
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false });
    }
    setSubmitting(false);
  }

  const colorFor = (t: Transaction) => {
    if (t.type === 'recharge') return '#059669';
    if (t.type === 'commission') return '#dc2626';
    return '#6b7280';
  };

  const iconFor = (t: Transaction) => {
    if (t.type === 'recharge') return '⬆';
    if (t.type === 'commission') return '⬇';
    return '⇄';
  };

  if (loading) {
    return (
      <DriverScreenLayout title="Mi Billetera">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Cargando...</div>
      </DriverScreenLayout>
    );
  }

  const isLow = balance < 5000;

  return (
    <DriverScreenLayout title="Mi Billetera">
      {/* ─── Saldo card ─── */}
      <div style={{
        margin: '1rem',
        borderRadius: 16,
        background: isLow
          ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'
          : 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
        padding: '1.5rem',
        color: isLow ? '#7f1d1d' : '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 4 }}>Saldo disponible</div>
        <div style={{ fontSize: '2rem', fontWeight: 800 }}>{fmtGS(balance)}</div>
        {isLow && (
          <div style={{ marginTop: 8, fontSize: '0.78rem', fontWeight: 600, color: '#991b1b' }}>
            ⚠ Saldo bajo — recarga para seguir recibiendo pedidos
          </div>
        )}
      </div>

      {/* ─── Solicitar recarga ─── */}
      <div style={{ margin: '0 1rem 1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
          Solicitar Recarga
        </h2>

        {/* ─── Datos bancarios ─── */}
        {bankAliases.length > 0 && (
          <div style={{ background: '#eff6ff', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '0.75rem', border: '1px solid #bfdbfe' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', margin: '0 0 0.4rem' }}>🏦 Transferí a estas cuentas:</p>
            {bankAliases.map(b => (
              <div key={b.id} style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e3a8a' }}>{b.bank_name}:</span>{' '}
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1d4ed8' }}>{b.alias}</span>
                {b.extra_info && <span style={{ fontSize: '0.78rem', color: '#3b82f6' }}> — {b.extra_info}</span>}
              </div>
            ))}
            <p style={{ fontSize: '0.75rem', color: '#1e40af', margin: '0.4rem 0 0', fontStyle: 'italic' }}>Adjuntá el comprobante de la transferencia.</p>
          </div>
        )}

        <form onSubmit={handleSubmitRecharge} style={{ background: '#fff', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Monto a recargar (Gs)
            </label>
            <input
              type="number"
              min="1000"
              step="1000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Ej: 50000"
              required
              style={{
                width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8,
                border: '1.5px solid #e5e7eb', fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Foto del comprobante (transferencia)
            </label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: receiptPreview ? '1.5px solid #059669' : '1.5px dashed #f87171',
                background: receiptPreview ? '#f0fdf4' : '#fff7f7', color: receiptPreview ? '#065f46' : '#b91c1c', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {receiptPreview ? '✓ Comprobante cargado — toca para cambiar' : '📷 Requerido: Adjuntar foto de comprobante'}
            </button>
            {receiptPreview && (
              <img src={receiptPreview} alt="comprobante" style={{ marginTop: 8, height: 80, borderRadius: 6, objectFit: 'cover' }} />
            )}
          </div>

          {msg && (
            <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.82rem',
              background: msg.ok ? '#d1fae5' : '#fee2e2', color: msg.ok ? '#065f46' : '#991b1b' }}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '0.75rem', borderRadius: 10, border: 'none',
              background: submitting ? '#d1fae5' : '#059669', color: '#fff',
              fontWeight: 700, fontSize: '0.95rem', cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar Solicitud de Recarga'}
          </button>
        </form>
      </div>

      {/* ─── Historial ─── */}
      <div style={{ margin: '0 1rem 2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
          Últimos movimientos
        </h2>
        {transactions.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            Sin movimientos aún
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            {transactions.map((tx, i) => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: i < transactions.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.1rem',
                  background: tx.type === 'recharge' ? '#d1fae5' : tx.type === 'commission' ? '#fee2e2' : '#f3f4f6',
                }}>
                  {iconFor(tx)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.note || (tx.type === 'recharge' ? 'Recarga' : tx.type === 'commission' ? 'Comisión' : 'Ajuste')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{fmtDate(tx.created_at)}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: colorFor(tx), whiteSpace: 'nowrap' }}>
                  {tx.amount >= 0 ? '+' : ''}{fmtGS(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DriverScreenLayout>
  );
}
