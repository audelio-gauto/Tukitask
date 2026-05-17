import { readFileSync, writeFileSync } from 'fs';

const file = 'src/app/tecnico/historial/page.tsx';
let c = readFileSync(file, 'utf8');

// Detect line endings
const crlf = c.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';

// 1. Add extra_items to interface (after extra_charge, before total_price)
const ifaceOld = `extra_charge: number | null;${nl}  total_price: number | null;`;
const ifaceNew = `extra_charge: number | null;${nl}  extra_items: Array<{ amount: number; reason: string }> | null;${nl}  total_price: number | null;`;
if (c.includes(ifaceOld)) {
  c = c.replace(ifaceOld, ifaceNew);
  console.log('✓ interface: extra_items added');
} else {
  console.log('✗ interface old string not found');
}

// 2. Replace price breakdown block
const breakdownOld = `          {/* Price breakdown */}${nl}          {job.extra_charge && Number(job.extra_charge) > 0 ? (${nl}            <div style={{${nl}              background: 'rgba(245,197,24,0.08)', borderRadius: 8,${nl}              padding: '6px 10px', marginBottom: 10,${nl}              fontSize: '0.77rem', color: 'var(--text-muted)',${nl}            }}>${nl}              Base: \u20b2{Number(job.agreed_price ?? 0).toLocaleString('es-PY')}${nl}              {' + '}Extra: \u20b2{Number(job.extra_charge).toLocaleString('es-PY')}${nl}              {' = '}${nl}              <strong style={{ color: '#F5C518' }}>\u20b2{totalPrice.toLocaleString('es-PY')}</strong>${nl}            </div>${nl}          ) : null}`;

const breakdownNew = `          {/* Price block unificado */}${nl}          {totalPrice > 0 && (() => {${nl}            const hasExtraItems = Array.isArray(job.extra_items) && job.extra_items.length > 0;${nl}            const hasExtraCharge = Number(job.extra_charge ?? 0) > 0;${nl}            const hasExtras = hasExtraItems || hasExtraCharge;${nl}            return (${nl}              <div style={{ marginBottom: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, overflow: 'hidden' }}>${nl}                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px' }}>${nl}                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(16,185,129,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acordado</span>${nl}                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10b981' }}>\u20b2{Number(job.agreed_price ?? totalPrice).toLocaleString('es-PY')}</span>${nl}                </div>${nl}                {hasExtras && (${nl}                  <>${nl}                    <div style={{ height: 1, background: 'rgba(16,185,129,0.15)', margin: '0 14px' }} />${nl}                    {hasExtraItems${nl}                      ? job.extra_items!.map((it, i) => (${nl}                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px' }}>${nl}                            <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>\u2795 {it.reason || 'Extra'}</span>${nl}                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>\u20b2{Number(it.amount).toLocaleString('es-PY')}</span>${nl}                          </div>${nl}                        ))${nl}                      : (${nl}                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px' }}>${nl}                            <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>\u2795 Extra servicio</span>${nl}                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>\u20b2{Number(job.extra_charge).toLocaleString('es-PY')}</span>${nl}                          </div>${nl}                        )${nl}                    }${nl}                    <div style={{ height: 1, background: 'rgba(16,185,129,0.25)', margin: '0 14px' }} />${nl}                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(16,185,129,0.1)' }}>${nl}                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(16,185,129,0.8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>${nl}                      <span style={{ fontSize: '1.12rem', fontWeight: 900, color: '#10b981' }}>\u20b2{totalPrice.toLocaleString('es-PY')}</span>${nl}                    </div>${nl}                  </>${nl}                )}${nl}              </div>${nl}            );${nl}          })()}`;

if (c.includes(breakdownOld)) {
  c = c.replace(breakdownOld, breakdownNew);
  console.log('✓ price block: replaced');
} else {
  console.log('✗ price block old string not found, searching for marker...');
  console.log('Has "Price breakdown":', c.includes('Price breakdown'));
  console.log('Has "extra_charge) > 0":', c.includes('extra_charge) > 0'));
}

writeFileSync(file, c, 'utf8');
console.log('Saved.');
