'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

interface Receipt {
  id: string;
  order_type?: string | null;
  status: string;
  pickup_address?: string | null;
  delivery_address?: string | null;
  driver_name?: string | null;
  offer?: number | null;
  suggested_price?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
}

const TYPE_LABEL: Record<string, string> = { envio: 'Envío', flete: 'Flete', viaje: 'Remis' };

export default function ReciboPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Receipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch(`/api/orders?id=${encodeURIComponent(id)}`)
      .then(async r => {
        if (!r.ok) { setError('No se pudo cargar el recibo'); return; }
        const o = await r.json();
        if (!o?.id) { setError('Recibo no encontrado'); return; }
        setOrder(o);
      })
      .catch(() => setError('No se pudo cargar el recibo'));
  }, [id]);

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const total = Number(order?.offer ?? order?.suggested_price ?? 0);
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(128,128,128,0.2)', fontSize: '0.88rem' };

  return (
    <div style={{ minHeight: '100dvh', padding: 16, background: 'var(--background)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => router.back()} className="no-print" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>← Volver</button>
        {error && <div>{error}</div>}
        {!error && !order && <div>Cargando…</div>}
        {order && (
          <div style={{ background: 'var(--glass-card)', borderRadius: 18, padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '1.6rem' }}>🧾</div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>Recibo de {TYPE_LABEL[order.order_type ?? 'envio'] ?? 'servicio'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>#{order.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div style={row}><span>Fecha</span><b>{fmt(order.completed_at ?? order.created_at)}</b></div>
            <div style={row}><span>Origen</span><b style={{ textAlign: 'right' }}>{order.pickup_address ?? '—'}</b></div>
            <div style={row}><span>Destino</span><b style={{ textAlign: 'right' }}>{order.delivery_address ?? '—'}</b></div>
            <div style={row}><span>Conductor</span><b>{order.driver_name ?? '—'}</b></div>
            <div style={{ ...row, borderBottom: 'none', fontSize: '1.05rem' }}>
              <span>Total pagado</span><b style={{ color: '#F5C518' }}>{total.toLocaleString('es-PY')} Gs</b>
            </div>
            <button onClick={() => window.print()} className="no-print" style={{ width: '100%', marginTop: 10, padding: 12, borderRadius: 12, border: 'none', background: '#F5C518', color: '#000', fontWeight: 800, cursor: 'pointer' }}>
              Imprimir / guardar PDF
            </button>
          </div>
        )}
      </div>
      <style>{'@media print { .no-print { display: none !important; } }'}</style>
    </div>
  );
}
