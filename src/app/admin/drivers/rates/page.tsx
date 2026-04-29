'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

interface VehicleRate {
  vehicle_type: string;
  label: string;
  emoji: string;
  rate_good_gspm: number | null;
  rate_ok_gspm: number | null;
}

export default function DriverRatesPage() {
  const [rates, setRates] = useState<VehicleRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // local edits: { vehicle_type → { good: string, ok: string } }
  const [edits, setEdits] = useState<Record<string, { good: string; ok: string }>>({});

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/drivers/rates', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar tarifas');
      setRates(json.rates || []);
      // Seed edit state from DB values
      const init: Record<string, { good: string; ok: string }> = {};
      for (const r of json.rates || []) {
        init[r.vehicle_type] = {
          good: r.rate_good_gspm != null ? String(r.rate_good_gspm) : '',
          ok:   r.rate_ok_gspm   != null ? String(r.rate_ok_gspm)   : '',
        };
      }
      setEdits(init);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const handleSave = async (vt: string) => {
    setSaving(vt);
    setError('');
    setSuccess('');
    const e = edits[vt] || { good: '', ok: '' };
    const good = e.good.trim() === '' ? null : Number(e.good.replace(/\D/g, ''));
    const ok   = e.ok.trim()   === '' ? null : Number(e.ok.replace(/\D/g, ''));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/drivers/rates', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ vehicle_type: vt, rate_good_gspm: good, rate_ok_gspm: ok }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al guardar');
      setSuccess('Guardado correctamente');
      setTimeout(() => setSuccess(''), 3000);
      fetchRates();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (vt: string) => {
    setEdits(prev => ({ ...prev, [vt]: { good: '', ok: '' } }));
    // Immediately persist as null (disable feature)
    setSaving(vt);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/admin/drivers/rates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ vehicle_type: vt, rate_good_gspm: null, rate_ok_gspm: null }),
      });
      setSuccess('Configuración desactivada');
      setTimeout(() => setSuccess(''), 3000);
    } finally {
      setSaving(null);
    }
  };

  const colorFor = (gspm: number | null, good: number | null, ok: number | null) => {
    if (gspm == null || good == null) return '#9ca3af';
    if (gspm >= good) return '#22c55e';
    if (ok != null && gspm >= ok) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link href="/admin/drivers" style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
          Conductores
        </Link>
        <span style={{ color: 'var(--adm-text-muted)' }}>›</span>
        <span style={{ color: '#F5C518', fontSize: '0.85rem', fontWeight: 700 }}>Rentabilidad Gs/km</span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--adm-text-primary)', marginBottom: 6 }}>
          💰 Rentabilidad Gs/km por Vehículo
        </h1>
        <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Configurá los umbrales de Gs por km que verá cada conductor al recibir una solicitud.
          Si dejás ambos campos vacíos, el indicador no se mostrará para ese tipo de vehículo.
        </p>
      </div>

      {/* How it works */}
      <div style={{ background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 24 }}>
        <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.85rem', marginBottom: 8 }}>¿Cómo funciona?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { color: '#22c55e', label: '🟢 Buena oferta',     desc: '≥ Gs/km "Buena" — conviene aceptar' },
            { color: '#f59e0b', label: '🟡 Oferta Aceptable', desc: '≥ Gs/km "Aceptable" pero < "Buena"' },
            { color: '#ef4444', label: '🔴 Oferta baja',       desc: '< Gs/km "Aceptable" — mejor contra-ofertar' },
          ].map(item => (
            <div key={item.color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, color: item.color, fontSize: '0.78rem', width: 110 }}>{item.label}</span>
              <span style={{ color: 'var(--adm-text-secondary)', fontSize: '0.78rem' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--adm-danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: 'var(--adm-danger)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#16a34a', fontSize: '0.85rem' }}>
          ✓ {success}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--adm-text-muted)', textAlign: 'center', padding: 40 }}>Cargando…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {rates.map(r => {
            const e = edits[r.vehicle_type] || { good: '', ok: '' };
            const goodNum = e.good.trim() === '' ? null : Number(e.good.replace(/\D/g, ''));
            const okNum   = e.ok.trim()   === '' ? null : Number(e.ok.replace(/\D/g, ''));
            const isActive = r.rate_good_gspm != null || r.rate_ok_gspm != null;
            const isDirty = e.good !== (r.rate_good_gspm != null ? String(r.rate_good_gspm) : '')
                         || e.ok   !== (r.rate_ok_gspm   != null ? String(r.rate_ok_gspm)   : '');

            return (
              <div key={r.vehicle_type} style={{
                background: 'var(--adm-surface)',
                border: `1.5px solid ${isActive ? 'rgba(245,197,24,0.35)' : 'var(--adm-border)'}`,
                borderRadius: 18,
                padding: '20px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'var(--adm-shadow-soft)',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 14,
                      background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.22)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
                    }}>
                      {r.emoji}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, color: 'var(--adm-text-primary)', fontSize: '1rem' }}>{r.label}</div>
                      <div style={{ fontSize: '0.72rem', color: isActive ? '#16a34a' : 'var(--adm-text-muted)', fontWeight: 700 }}>
                        {isActive ? '● Activo' : '○ Sin configurar'}
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <button
                      onClick={() => handleClear(r.vehicle_type)}
                      disabled={saving === r.vehicle_type}
                      style={{ background: 'var(--adm-danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '4px 10px', color: 'var(--adm-danger)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Desactivar
                    </button>
                  )}
                </div>

                {/* Preview badges */}
                <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
                  {[
                    { label: '🟢 Buena', color: '#22c55e', val: goodNum },
                    { label: '🟡 Aceptable', color: '#f59e0b', val: okNum },
                  ].map(b => (
                    <div key={b.label} style={{
                      flex: 1, background: b.val != null ? `${b.color}18` : 'var(--adm-surface-2)',
                      border: `1px solid ${b.val != null ? `${b.color}40` : 'var(--adm-border)'}`,
                      borderRadius: 8, padding: '6px 8px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--adm-text-muted)', fontWeight: 700, marginBottom: 2 }}>{b.label}</div>
                      <div style={{ fontWeight: 900, color: b.val != null ? b.color : 'var(--adm-text-muted)', fontSize: '0.9rem' }}>
                        {b.val != null ? `₲${b.val.toLocaleString('es-PY')}` : '—'}
                      </div>
                      {b.val != null && <div style={{ fontSize: '0.6rem', color: 'var(--adm-text-muted)' }}>Gs/km</div>}
                    </div>
                  ))}
                </div>

                {/* Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'good' as const, label: '🟢 Tarifa buena (Gs/km)', placeholder: 'Ej: 2500', hint: 'Verde — el driver acepta directo' },
                    { key: 'ok'   as const, label: '🟡 Tarifa aceptable (Gs/km)', placeholder: 'Ej: 1200', hint: 'Amarillo — puede contra-ofertar' },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--adm-text-secondary)', display: 'block', marginBottom: 4 }}>
                        {field.label}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--adm-text-muted)', fontSize: '0.85rem', fontWeight: 700 }}>₲</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={field.placeholder}
                          value={e[field.key] ? Number(e[field.key]).toLocaleString('es-PY') : ''}
                          onChange={ev => {
                            const raw = ev.target.value.replace(/\D/g, '');
                            setEdits(prev => ({ ...prev, [r.vehicle_type]: { ...prev[r.vehicle_type], [field.key]: raw } }));
                          }}
                          style={{
                            flex: 1, padding: '9px 12px', borderRadius: 10,
                            border: '1px solid var(--adm-input-border)',
                            background: 'var(--adm-input-bg)',
                            color: 'var(--adm-text-primary)',
                            fontSize: '0.9rem', fontWeight: 700, outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted)', marginTop: 3 }}>{field.hint}</div>
                    </div>
                  ))}
                </div>

                {/* Save button */}
                <button
                  onClick={() => handleSave(r.vehicle_type)}
                  disabled={saving === r.vehicle_type || !isDirty}
                  style={{
                    width: '100%', marginTop: 14, padding: '11px',
                    borderRadius: 12, border: 'none',
                    background: isDirty && saving !== r.vehicle_type
                      ? 'linear-gradient(135deg, #F5C518, #F58A07)'
                      : 'var(--adm-surface-2)',
                    color: isDirty && saving !== r.vehicle_type ? '#0f172a' : 'var(--adm-text-muted)',
                    fontWeight: 900, fontSize: '0.9rem',
                    cursor: isDirty && saving !== r.vehicle_type ? 'pointer' : 'default',
                    transition: 'background 0.2s',
                  }}
                >
                  {saving === r.vehicle_type ? 'Guardando…' : isDirty ? 'Guardar cambios' : 'Sin cambios'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
