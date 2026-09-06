'use client';

const STEPS: { key: string; label: string }[] = [
  { key: 'pending',    label: 'Recibido' },
  { key: 'preparing',  label: 'Preparando' },
  { key: 'ready',      label: 'Listo' },
  { key: 'in_transit', label: 'En camino' },
  { key: 'delivered',  label: 'Entregado' },
];

export default function OrderStatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
        borderRadius: 12, padding: '10px 12px', color: '#f87171', fontWeight: 700, fontSize: '0.85rem',
      }}>
        <span style={{ fontSize: '1.05rem' }}>✕</span> Pedido cancelado
      </div>
    );
  }

  const rawIndex = status === 'commission_charged'
    ? STEPS.length - 1
    : STEPS.findIndex(s => s.key === status);
  const currentIndex = Math.max(0, rawIndex);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 2px 4px' }}>
      {STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: isLast ? '0 0 auto' : 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: done ? '#4ade80' : 'var(--ghost-btn)',
                border: done ? 'none' : '2px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.68rem', fontWeight: 800,
                color: done ? '#0b3b1e' : 'var(--text-muted)',
              }}>
                {done ? '✓' : i + 1}
              </div>
              {!isLast && (
                <div style={{ flex: 1, height: 3, borderRadius: 2, margin: '0 2px', background: i < currentIndex ? '#4ade80' : 'var(--border-subtle)' }} />
              )}
            </div>
            <span style={{
              fontSize: '0.6rem', marginTop: 4, textAlign: 'center',
              color: done ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: done ? 700 : 500,
            }}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
