'use client';
import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';
import { Icon } from '@/components/Icon';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_pct: number;
  discount_fixed: number;
  min_order_gs: number;
  max_uses: number | null;
  used_count: number;
  applicable_to: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid var(--adm-input-border)',
  background: 'var(--adm-input-bg)',
  color: 'var(--adm-text-primary)',
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, color: 'var(--adm-text-secondary)',
  textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4,
};

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discount_pct: 0, discount_fixed: 0,
    min_order_gs: 0, max_uses: '', applicable_to: 'all', expires_at: '',
  });

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/promos');
      const data = await res.json();
      setPromos(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.code.trim()) { showToast('El código es obligatorio', false); return; }
    const body = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_pct: Number(form.discount_pct),
      discount_fixed: Number(form.discount_fixed),
      min_order_gs: Number(form.min_order_gs),
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      applicable_to: form.applicable_to,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    const res = await authFetch('/api/admin/promos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showToast('Código creado');
      setShowForm(false);
      setForm({ code: '', description: '', discount_pct: 0, discount_fixed: 0, min_order_gs: 0, max_uses: '', applicable_to: 'all', expires_at: '' });
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Error al crear', false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    const res = await authFetch('/api/admin/promos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    });
    if (res.ok) {
      setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
      showToast(!current ? 'Activado' : 'Desactivado');
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`¿Eliminar el código "${code}" permanentemente?`)) return;
    const res = await authFetch(`/api/admin/promos?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPromos(prev => prev.filter(p => p.id !== id));
      showToast('Código eliminado');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Error al eliminar', false);
    }
  };

  return (
    <div className="p-6">
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '12px 20px', borderRadius: 12,
          background: toast.ok ? 'var(--adm-success-bg)' : 'var(--adm-danger-bg)',
          color: toast.ok ? 'var(--adm-success-text)' : 'var(--adm-danger)',
          fontSize: '0.9rem', fontWeight: 600, border: `1px solid ${toast.ok ? 'var(--adm-success)' : 'var(--adm-danger)'}`,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={toast.ok ? 'check' : 'x'} size={14} />
            {toast.msg}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--adm-text-primary)' }}>Códigos Promocionales</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--adm-text-muted)' }}>{promos.length} código(s) en total</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-xl font-bold text-sm"
          style={{ background: 'var(--adm-accent)', color: 'var(--adm-accent-text)' }}
        >
          {showForm ? (
            <span className="inline-flex items-center gap-2"><Icon name="x" size={14} /> Cancelar</span>
          ) : (
            <span className="inline-flex items-center gap-2"><Icon name="plus" size={14} /> Nuevo código</span>
          )}
        </button>
      </div>

      {showForm && (
        <div style={{
          background: 'var(--adm-surface)', border: '1px solid var(--adm-border)',
          borderRadius: 16, padding: 20, marginBottom: 24,
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--adm-accent)' }}>Nuevo código</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Código *', key: 'code', type: 'text', placeholder: 'PROMO10' },
              { label: 'Descripción', key: 'description', type: 'text', placeholder: 'Desc. opcional' },
              { label: 'Descuento %', key: 'discount_pct', type: 'number', placeholder: '0' },
              { label: 'Descuento Fijo (Gs)', key: 'discount_fixed', type: 'number', placeholder: '0' },
              { label: 'Mínimo pedido (Gs)', key: 'min_order_gs', type: 'number', placeholder: '0' },
              { label: 'Usos máximos', key: 'max_uses', type: 'number', placeholder: 'ilimitado' },
              { label: 'Expira (opcional)', key: 'expires_at', type: 'datetime-local', placeholder: '' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as Record<string, string | number>)[f.key] as string}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Aplica a</label>
              <select
                value={form.applicable_to}
                onChange={e => setForm(prev => ({ ...prev, applicable_to: e.target.value }))}
                style={fieldStyle}
              >
                <option value="all">Todos</option>
                <option value="envio">Solo envíos</option>
                <option value="tecnico">Solo técnicos</option>
              </select>
            </div>
          </div>
          <button onClick={handleCreate} style={{
            marginTop: 16, padding: '12px 24px', borderRadius: 12,
            background: 'var(--adm-accent)', color: 'var(--adm-accent-text)',
            fontWeight: 800, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
          }}>
            Crear código
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--adm-text-muted)' }}>Cargando...</div>
      ) : promos.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--adm-text-muted)' }}>Sin códigos aún</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {promos.map(p => (
            <div key={p.id} style={{
              background: 'var(--adm-surface)', border: '1px solid var(--adm-border)',
              borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: p.is_active ? 'var(--adm-accent)' : 'var(--adm-text-primary)' }}>{p.code}</span>
                  {p.is_active
                    ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--adm-success-text)', background: 'var(--adm-success-bg)', padding: '2px 7px', borderRadius: 6 }}>ACTIVO</span>
                    : <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--adm-text-muted)', background: 'var(--adm-neutral-bg)', padding: '2px 7px', borderRadius: 6 }}>INACTIVO</span>}
                  <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>{p.applicable_to === 'all' ? 'Todos' : p.applicable_to}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                  {p.discount_pct > 0 && `${p.discount_pct}% off`}
                  {p.discount_pct > 0 && p.discount_fixed > 0 && ' + '}
                  {p.discount_fixed > 0 && `${p.discount_fixed.toLocaleString('es-PY')} Gs`}
                  {' · '}Usos: {p.used_count}{p.max_uses ? `/${p.max_uses}` : ''}
                  {p.expires_at && ` · Expira: ${new Date(p.expires_at).toLocaleDateString('es-PY')}`}
                  {p.description && ` · ${p.description}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleActive(p.id, p.is_active)} style={{
                  padding: '7px 14px', borderRadius: 9,
                  border: `1px solid ${p.is_active ? 'var(--adm-danger)' : 'var(--adm-success)'}`,
                  background: p.is_active ? 'var(--adm-danger-bg)' : 'var(--adm-success-bg)',
                  color: p.is_active ? 'var(--adm-danger)' : 'var(--adm-success-text)',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                }}>
                  {p.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => handleDelete(p.id, p.code)} style={{
                  padding: '7px 10px', borderRadius: 9, border: '1px solid var(--adm-danger)',
                  background: 'var(--adm-danger-bg)', color: 'var(--adm-danger)',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                }} title="Eliminar">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
