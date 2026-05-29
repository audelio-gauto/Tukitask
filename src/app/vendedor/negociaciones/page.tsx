'use client';

import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '@/lib/authFetch';

type VendorNegotiationStatus = 'countered' | 'accepted_pending_payment';

type NegotiationRow = {
  id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  product_name: string | null;
  product_image: string | null;
  listed_price: number;
  buyer_offer: number;
  counter_amount: number | null;
  final_amount: number | null;
  quantity: number;
  status: VendorNegotiationStatus;
  bot_message: string | null;
  expires_at: string | null;
  updated_at: string;
  message_count: number;
};

type MessageRow = {
  id: string;
  sender_role: 'buyer' | 'vendor' | 'system';
  sender_name: string | null;
  message: string;
  created_at: string;
};

const gs = (n?: number | null) => `Gs. ${(n ?? 0).toLocaleString('es-PY')}`;

function timeLeftLabel(expiresAt?: string | null) {
  if (!expiresAt) return 'Sin vencimiento';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expirada';
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m restantes` : `${minutes}m restantes`;
}

function statusCopy(status: VendorNegotiationStatus) {
  return status === 'countered' ? 'Negociado sin aceptar' : 'Oferta abandonada';
}

export default function NegociacionesPage() {
  const [items, setItems] = useState<NegotiationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingMessage, setEditingMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | VendorNegotiationStatus>('all');

  async function loadItems() {
    setLoading(true);
    try {
      const res = await authFetch('/api/tukibot/negotiations?role=vendor&status=all&limit=50');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar negociaciones');
      const rows = data.items ?? [];
      setItems(rows);
      setSelectedId((current) => current && rows.some((item: NegotiationRow) => item.id === current) ? current : rows[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(id: string) {
    setMessagesLoading(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${id}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar mensajes');
      setMessages(data.items ?? []);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId]);

  const counts = useMemo(() => ({
    countered: items.filter((item) => item.status === 'countered').length,
    accepted_pending_payment: items.filter((item) => item.status === 'accepted_pending_payment').length,
  }), [items]);

  const filteredItems = useMemo(() => filter === 'all' ? items : items.filter((item) => item.status === filter), [filter, items]);
  const selected = filteredItems.find((item) => item.id === selectedId) ?? items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setEditingPrice(String(selected.counter_amount ?? selected.final_amount ?? ''));
    setEditingMessage(selected.bot_message ?? '');
  }, [selected]);

  async function handleSavePrice() {
    if (!selected) return;
    setSaving(true);
    try {
      const digits = Number(editingPrice.replace(/\D/g, ''));
      const res = await authFetch(`/api/tukibot/negotiations/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'edit_counter', counterAmount: digits, message: editingMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el precio');
      await loadItems();
      await loadMessages(selected.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendMessage() {
    if (!selected || !chatDraft.trim()) return;
    setSending(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${selected.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: chatDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mensaje');
      setChatDraft('');
      await loadMessages(selected.id);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 className="vnd-page-heading">Negociaciones</h1>
          <p className="vnd-page-sub">Ofertas activas con clientes para cerrar o recuperar ventas pendientes.</p>
        </div>
        <button className="vnd-btn vnd-btn-secondary" onClick={() => void loadItems()}>
          Actualizar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="vnd-btn" style={{ background: filter === 'all' ? '#F5C518' : 'var(--vnd-surface-2)', color: filter === 'all' ? '#1C1C2E' : 'var(--vnd-text)', border: '1px solid var(--vnd-border)' }} onClick={() => setFilter('all')}>
          Todas ({items.length})
        </button>
        <button className="vnd-btn" style={{ background: filter === 'countered' ? 'rgba(58,126,215,0.14)' : 'var(--vnd-surface-2)', color: filter === 'countered' ? '#60a5fa' : 'var(--vnd-text)', border: '1px solid rgba(58,126,215,0.25)' }} onClick={() => setFilter('countered')}>
          Negociado sin aceptar ({counts.countered})
        </button>
        <button className="vnd-btn" style={{ background: filter === 'accepted_pending_payment' ? 'rgba(245,197,24,0.12)' : 'var(--vnd-surface-2)', color: filter === 'accepted_pending_payment' ? '#F5C518' : 'var(--vnd-text)', border: '1px solid rgba(245,197,24,0.25)' }} onClick={() => setFilter('accepted_pending_payment')}>
          Oferta abandonada ({counts.accepted_pending_payment})
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title"><span className="vnd-card-title-dot" />Activas</span>
          </div>
          <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 580, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ color: 'var(--vnd-text-muted)', margin: 0 }}>Cargando negociaciones...</p>
            ) : filteredItems.length === 0 ? (
              <div className="vnd-empty" style={{ padding: '32px 12px' }}>
                <div className="vnd-empty-icon">🤝</div>
                <p className="vnd-empty-title">Sin negociaciones activas</p>
                <p className="vnd-empty-sub">Cuando un cliente deje una contraoferta pendiente o acepte sin pagar, aparecerá aquí.</p>
              </div>
            ) : filteredItems.map((item) => {
              const active = item.id === selected?.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{ textAlign: 'left', borderRadius: 16, border: active ? '1px solid rgba(245,197,24,0.4)' : '1px solid var(--vnd-border)', background: active ? 'rgba(245,197,24,0.08)' : 'var(--vnd-surface-2)', padding: 14, display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 12, cursor: 'pointer' }}
                >
                  <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'visible', position: 'relative', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
                    <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden' }}>
                      {item.product_image ? <img src={item.product_image} alt={item.product_name || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛍️'}
                    </div>
                    {item.message_count > 0 && (
                      <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999, background: '#F5C518', color: '#1C1C2E', fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid var(--vnd-surface)', zIndex: 2 }}>
                        {item.message_count}
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, color: 'var(--vnd-text)', fontSize: '0.92rem' }}>{item.product_name || 'Producto'}</div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: item.status === 'countered' ? '#60a5fa' : '#F5C518' }}>{statusCopy(item.status)}</span>
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>{item.buyer_name || item.buyer_email || 'Cliente'}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--vnd-text-secondary)' }}>Oferta: {gs(item.buyer_offer)}</span>
                      <span style={{ color: 'var(--vnd-text-secondary)' }}>Tu precio: {gs(item.counter_amount ?? item.final_amount)}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>{timeLeftLabel(item.expires_at)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title"><span className="vnd-card-title-dot" />Detalle</span>
          </div>
          <div className="vnd-card-body">
            {!selected ? (
              <div className="vnd-empty" style={{ padding: '32px 12px' }}>
                <div className="vnd-empty-icon">💬</div>
                <p className="vnd-empty-title">Elegí una negociación</p>
                <p className="vnd-empty-sub">Vas a poder editar el precio, reiniciar las 24h y hablar con el cliente desde acá.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ padding: 16, borderRadius: 16, background: 'var(--vnd-surface-2)', border: '1px solid var(--vnd-border)' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--vnd-text)' }}>{selected.product_name || 'Producto'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>{selected.buyer_name || selected.buyer_email || 'Cliente'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                      <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--vnd-border)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)', fontWeight: 700 }}>Oferta del cliente</div>
                        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--vnd-text)' }}>{gs(selected.buyer_offer)}</div>
                      </div>
                      <div style={{ borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--vnd-border)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)', fontWeight: 700 }}>Precio activo</div>
                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#F5C518' }}>{gs(selected.counter_amount ?? selected.final_amount)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: '0.76rem', color: 'var(--vnd-text-muted)' }}>{timeLeftLabel(selected.expires_at)}</div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 16, background: 'var(--vnd-surface-2)', border: '1px solid var(--vnd-border)' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--vnd-text)', marginBottom: 10 }}>Editar precio</div>
                    <input value={editingPrice} onChange={(e) => setEditingPrice(e.target.value.replace(/\D/g, ''))} placeholder="Nuevo precio" style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--vnd-border)', background: 'var(--vnd-surface)', color: 'var(--vnd-text)', padding: '0 12px', fontWeight: 700, marginBottom: 10 }} />
                    <textarea value={editingMessage} onChange={(e) => setEditingMessage(e.target.value)} placeholder="Mensaje opcional para el cliente" style={{ width: '100%', minHeight: 96, borderRadius: 12, border: '1px solid var(--vnd-border)', background: 'var(--vnd-surface)', color: 'var(--vnd-text)', padding: 12, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
                    <button className="vnd-btn vnd-btn-primary" onClick={() => void handleSavePrice()} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar y reiniciar 24h'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 16, background: 'var(--vnd-surface-2)', border: '1px solid var(--vnd-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--vnd-text)' }}>Mensaje interno</div>
                    <button className="vnd-btn vnd-btn-secondary" onClick={() => selected && void loadMessages(selected.id)}>
                      Recargar
                    </button>
                  </div>

                  <div style={{ minHeight: 260, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, marginBottom: 12 }}>
                    {messagesLoading ? (
                      <p style={{ color: 'var(--vnd-text-muted)' }}>Cargando chat...</p>
                    ) : messages.length === 0 ? (
                      <p style={{ color: 'var(--vnd-text-muted)' }}>Todavía no hay mensajes. Podés abrir la conversación desde acá.</p>
                    ) : messages.map((message) => {
                      const own = message.sender_role === 'vendor';
                      return (
                        <div key={message.id} style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '85%', background: own ? 'rgba(245,197,24,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${own ? 'rgba(245,197,24,0.26)' : 'var(--vnd-border)'}`, color: 'var(--vnd-text)', borderRadius: 14, padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)', marginBottom: 4 }}>{message.sender_name || (own ? 'Vos' : 'Cliente')}</div>
                          <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>{message.message}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <textarea value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="Escribí un mensaje para el cliente" style={{ width: '100%', minHeight: 90, borderRadius: 12, border: '1px solid var(--vnd-border)', background: 'var(--vnd-surface)', color: 'var(--vnd-text)', padding: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                    <button className="vnd-btn vnd-btn-primary" onClick={() => void handleSendMessage()} disabled={sending || !chatDraft.trim()}>
                      {sending ? 'Enviando...' : 'Enviar mensaje'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
