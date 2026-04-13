'use client';
import { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

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

  return (
    <div className="min-h-screen bg-[#13131F] text-white p-6">
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, padding: '12px 20px', borderRadius: 12, background: toast.ok ? '#065f46' : '#7f1d1d', color: '#fff', fontSize: '0.9rem', fontWeight: 600, border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}` }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🏷️ Códigos Promocionales</h1>
          <p className="text-sm text-gray-400 mt-1">{promos.length} código(s) en total</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-xl font-bold text-sm"
          style={{ background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E' }}>
          {showForm ? '✕ Cancelar' : '+ Nuevo código'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#F5C518' }}>Nuevo código</h2>
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
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as Record<string, string | number>)[f.key] as string}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Aplica a</label>
              <select
                value={form.applicable_to}
                onChange={e => setForm(prev => ({ ...prev, applicable_to: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#1e1e2e', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              >
                <option value="all">Todos</option>
                <option value="envio">Solo envíos</option>
                <option value="tecnico">Solo técnicos</option>
              </select>
            </div>
          </div>
          <button onClick={handleCreate} style={{ marginTop: 16, padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.9rem', border: 'none', cursor: 'pointer' }}>
            Crear código
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(255,255,255,0.4)' }}>Cargando...</div>
      ) : promos.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'rgba(255,255,255,0.3)' }}>Sin códigos aún</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {promos.map(p => (
            <div key={p.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${p.is_active ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: p.is_active ? '#F5C518' : 'rgba(255,255,255,0.4)' }}>{p.code}</span>
                  {p.is_active ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 7px', borderRadius: 6 }}>ACTIVO</span>
                    : <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,0.15)', padding: '2px 7px', borderRadius: 6 }}>INACTIVO</span>}
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{p.applicable_to === 'all' ? 'Todos' : p.applicable_to}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
                  {p.discount_pct > 0 && `${p.discount_pct}% off`}
                  {p.discount_pct > 0 && p.discount_fixed > 0 && ' + '}
                  {p.discount_fixed > 0 && `${p.discount_fixed.toLocaleString('es-PY')} Gs`}
                  {' · '}Usos: {p.used_count}{p.max_uses ? `/${p.max_uses}` : ''}
                  {p.expires_at && ` · Expira: ${new Date(p.expires_at).toLocaleDateString('es-PY')}`}
                  {p.description && ` · ${p.description}`}
                </div>
              </div>
              <button onClick={() => toggleActive(p.id, p.is_active)} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${p.is_active ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`, background: p.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: p.is_active ? '#f87171' : '#4ade80', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {p.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
