'use client';
import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';
import { Icon } from '@/components/Icon';

interface BankAlias {
  id: number;
  bank_name: string;
  alias: string;
  extra_info: string | null;
  is_active: boolean;
  updated_at: string;
}

export default function BankAliasPage() {
  const [aliases, setAliases] = useState<BankAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Form para nuevo alias
  const [bankName, setBankName] = useState('');
  const [alias, setAlias] = useState('');
  const [extraInfo, setExtraInfo] = useState('');

  // Edición en línea
  const [editing, setEditing] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<BankAlias>>({});

  async function fetchAliases() {
    setLoading(true);
    const res = await authFetch('/api/admin/bank-alias?all=true');
    if (res.ok) setAliases(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchAliases(); }, []);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !alias.trim()) return;
    setSaving(true);
    const res = await authFetch('/api/admin/bank-alias', {
      method: 'POST',
      body: JSON.stringify({ bank_name: bankName, alias, extra_info: extraInfo }),
    });
    setSaving(false);
    if (res.ok) {
      flash('Alias creado', true);
      setBankName(''); setAlias(''); setExtraInfo('');
      fetchAliases();
    } else {
      const j = await res.json();
      flash(j.error || 'Error al crear', false);
    }
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    const res = await authFetch('/api/admin/bank-alias', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...editData }),
    });
    setSaving(false);
    if (res.ok) {
      flash('Guardado', true);
      setEditing(null);
      fetchAliases();
    } else {
      const j = await res.json();
      flash(j.error || 'Error al guardar', false);
    }
  }

  async function handleToggle(a: BankAlias) {
    await authFetch('/api/admin/bank-alias', {
      method: 'PATCH',
      body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
    });
    fetchAliases();
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este alias?')) return;
    await authFetch(`/api/admin/bank-alias?id=${id}`, { method: 'DELETE' });
    fetchAliases();
  }

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
    marginBottom: '1rem',
  };

  return (
    <div>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1rem 1rem 4rem' }}>

        {msg && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem',
            background: msg.ok ? '#d1fae5' : '#fee2e2',
            color: msg.ok ? '#065f46' : '#991b1b',
            fontWeight: 600, fontSize: '0.88rem',
          }}>{msg.text}</div>
        )}

        {/* ── Formulario nuevo alias ── */}
        <div style={card}>
          <p style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} />
            Nuevo Alias de Banco
          </p>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              placeholder="Nombre del banco (ej: BNF)"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              required
              style={{ padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}
            />
            <input
              placeholder="Alias / Número de cuenta"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              required
              style={{ padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}
            />
            <input
              placeholder="Info extra (ej: Cuenta Ahorro, Tukitask SRL) — opcional"
              value={extraInfo}
              onChange={e => setExtraInfo(e.target.value)}
              style={{ padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.95rem' }}
            />
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.65rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Guardando…' : 'Crear Alias'}
            </button>
          </form>
        </div>

        {/* ── Lista de alias ── */}
        <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
          Alias configurados ({aliases.length})
        </p>

        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Cargando…</p>
        ) : aliases.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No hay alias configurados aún.</p>
        ) : (
          aliases.map(a => (
            <div key={a.id} style={{ ...card, opacity: a.is_active ? 1 : 0.55 }}>
              {editing === a.id ? (
                // Modo edición
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    defaultValue={a.bank_name}
                    placeholder="Banco"
                    onChange={e => setEditData(prev => ({ ...prev, bank_name: e.target.value }))}
                    style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                  />
                  <input
                    defaultValue={a.alias}
                    placeholder="Alias"
                    onChange={e => setEditData(prev => ({ ...prev, alias: e.target.value }))}
                    style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                  />
                  <input
                    defaultValue={a.extra_info || ''}
                    placeholder="Info extra"
                    onChange={e => setEditData(prev => ({ ...prev, extra_info: e.target.value }))}
                    style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleSaveEdit(a.id)}
                      disabled={saving}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}
                    >Guardar</button>
                    <button
                      onClick={() => setEditing(null)}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff', fontWeight: 600, fontSize: '0.85rem' }}
                    >Cancelar</button>
                  </div>
                </div>
              ) : (
                // Modo lectura
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="credit-card" size={14} />
                        {a.bank_name}
                      </p>
                      <p style={{ fontSize: '1rem', fontWeight: 800, color: '#4f46e5', margin: '2px 0' }}>
                        {a.alias}
                      </p>
                      {a.extra_info && (
                        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>{a.extra_info}</p>
                      )}
                    </div>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: a.is_active ? '#d1fae5' : '#fee2e2',
                      color: a.is_active ? '#065f46' : '#991b1b',
                    }}>
                      {a.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={() => { setEditing(a.id); setEditData({}); }}
                      style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="pencil" size={12} />
                        Editar
                      </span>
                    </button>
                    <button
                      onClick={() => handleToggle(a)}
                      style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: a.is_active ? '#fef3c7' : '#d1fae5', fontSize: '0.82rem', fontWeight: 600, color: a.is_active ? '#92400e' : '#065f46' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={a.is_active ? 'clock' : 'check'} size={12} />
                        {a.is_active ? 'Desactivar' : 'Activar'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#fee2e2', fontSize: '0.82rem', fontWeight: 600, color: '#991b1b' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="trash" size={12} />
                        Eliminar
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
