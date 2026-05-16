'use client';
/**
 * ChatModal — Chat en tiempo real entre cliente y driver/técnico.
 * Uso:
 *   <ChatModal
 *     open={chatOpen}
 *     onClose={() => setChatOpen(false)}
 *     orderId="uuid"          // para envíos
 *     // jobId="uuid"         // para servicios técnicos
 *     myEmail="yo@mail.com"
 *     myName="Juan Pérez"
 *     otherName="Conductor"
 *     otherPhoto={null}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { Icon } from '@/components/Icon';

interface Message {
  id: string;
  created_at: string;
  sender_email: string;
  sender_name: string | null;
  sender_role: 'client' | 'driver' | 'tecnico';
  content: string;
  read_at: string | null;
}

interface ChatModalProps {
  open: boolean;
  onClose: () => void;
  orderId?: string;
  jobId?: string;
  myEmail: string;
  myName: string | null;
  otherName: string | null;
  otherPhoto: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatModal({
  open, onClose, orderId, jobId, myEmail, myName, otherName, otherPhoto,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const isMobileRef = useRef(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const scope = orderId ? `order_id=${orderId}` : `job_id=${jobId}`;

  // Detect touch device once on mount
  useEffect(() => {
    isMobileRef.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  const scrollToBottom = useCallback((instant = false) => {
    const el = messagesRef.current;
    if (!el) return;
    if (instant) {
      el.scrollTop = el.scrollHeight;
    } else {
      // Smooth only if we're close to the bottom (< 200px away)
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom) {
        el.scrollTop = el.scrollHeight;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const res = await authFetch(`/api/chat?${scope}`);
      if (!res.ok) return;
      const data: Message[] = await res.json();
      setMessages(data);
      setLoading(false);
      // Marcar como leídos
      await authFetch('/api/chat', {
        method: 'PATCH',
        body: JSON.stringify(orderId ? { order_id: orderId } : { job_id: jobId }),
      });
      setUnread(0);
    } catch { setLoading(false); }
  }, [scope, orderId, jobId]);

  // Cargar al abrir
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadMessages();
  }, [open, loadMessages]);

  // Scroll al último mensaje cuando cambian
  useEffect(() => {
    if (!open || messages.length === 0) return;
    // Use instant scroll on initial load (loading just turned false)
    scrollToBottom(loading ? false : true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, open]);

  // Realtime subscription
  useEffect(() => {
    if (!open || (!orderId && !jobId)) return;

    const channelName = orderId ? `chat-order-${orderId}` : `chat-job-${jobId}`;
    const filter      = orderId ? `order_id=eq.${orderId}` : `job_id=eq.${jobId}`;

    const ch = supabase.channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter,
      } as never, (payload: { new: Message }) => {
        const msg = payload.new;
        setMessages(prev => {
          // Remove optimistic placeholder from same sender, then add real message
          const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.sender_email === msg.sender_email));
          if (filtered.find(m => m.id === msg.id)) return filtered;
          return [...filtered, msg];
        });
        if (msg.sender_email !== myEmail) {
          setUnread(u => u + 1);
          // Marcar como leído automáticamente si el chat está abierto
          authFetch('/api/chat', {
            method: 'PATCH',
            body: JSON.stringify(orderId ? { order_id: orderId } : { job_id: jobId }),
          }).catch(() => {});
        }
        scrollToBottom(false);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [open, orderId, jobId, myEmail, scrollToBottom]);

  const sendMessage = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    setText('');

    // Optimistic: show message immediately before server confirms
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      created_at: new Date().toISOString(),
      sender_email: myEmail,
      sender_name: myName,
      sender_role: 'client',
      content,
      read_at: null,
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom(true);

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId || undefined,
          job_id:   jobId   || undefined,
          content,
          sender_name: myName,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setText(content);
        setSendError(j?.error || 'No se pudo enviar el mensaje.');
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setText(content);
      setSendError('Error de red al enviar.');
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // On desktop Enter sends; on mobile Enter inserts a newline
    if (e.key === 'Enter' && !e.shiftKey && !isMobileRef.current) { e.preventDefault(); sendMessage(); }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 480,
        height: '85dvh', maxHeight: '85dvh',
        background: 'var(--sheet-bg)',
        borderRadius: '24px 24px 0 0',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--glass-card)',
          flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          {/* Drag handle */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, background: '#334155', borderRadius: 2 }} />

          {otherPhoto ? (
            <img src={otherPhoto} alt="" loading="eager" decoding="sync" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #22c55e', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', flexShrink: 0 }}>
              <Icon name={orderId ? 'truck' : 'tool'} size={20} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {otherName || 'Tasker'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Chat activo
            </div>
          </div>
          {unread > 0 && (
            <div style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 800 }}>
              {unread} nuevo{unread > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--glass-card)', color: 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>

        {/* ── Mensajes ── */}
        <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, overscrollBehavior: 'contain' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px 0', fontSize: '0.85rem' }}>
              Cargando mensajes...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--glass-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5f5' }}>
                  <Icon name="chat" size={22} />
                </div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                Comenzá la conversación.<br />Los mensajes son privados entre vos y {otherName || 'el Tasker'}.
              </div>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_email === myEmail;
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                {/* Nombre del remitente (solo para mensajes ajenos) */}
                {!isMe && (
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 3, paddingLeft: 4, fontWeight: 600 }}>
                    {msg.sender_name || (msg.sender_role === 'client' ? 'Cliente' : 'Tasker')}
                  </div>
                )}
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isMe
                    ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                    : 'var(--glass-card)',
                  color: isMe ? '#fff' : 'var(--text-primary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  boxShadow: isMe ? '0 2px 12px rgba(34,197,94,0.25)' : 'none',
                }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', marginTop: 3, paddingLeft: 4, paddingRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {formatTime(msg.created_at)}
                  {isMe && msg.id.startsWith('temp-') && <span style={{ color: 'rgba(255,255,255,0.3)' }}>enviando…</span>}
                  {isMe && !msg.id.startsWith('temp-') && msg.read_at && <span style={{ color: '#22c55e' }}>✓✓</span>}
                  {isMe && !msg.id.startsWith('temp-') && !msg.read_at && <span>✓</span>}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div style={{
          padding: '8px 12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-3)',
          flexShrink: 0,
        }}>
          {/* Error message */}
          {sendError && (
            <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: 6, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
              ⚠️ {sendError}
            </div>
          )}
          {/* Char counter — only show when near limit */}
          {text.length > 400 && (
            <div style={{ fontSize: '0.68rem', color: text.length >= 490 ? '#f87171' : 'rgba(255,255,255,0.35)', textAlign: 'right', marginBottom: 4 }}>
              {500 - text.length} caracteres restantes
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => { setText(e.target.value); if (sendError) setSendError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un mensaje..."
            rows={1}
            style={{
              flex: 1,
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: 20,
              padding: '10px 14px',
              color: 'var(--input-text)',
              fontSize: '0.9rem',
              resize: 'none',
              outline: 'none',
              maxHeight: 100,
              overflowY: 'auto',
              lineHeight: 1.4,
            }}
            maxLength={500}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            style={{
              width: 44, height: 44,
              borderRadius: '50%',
              border: 'none',
              background: text.trim() && !sending
                ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                : 'rgba(255,255,255,0.1)',
              color: text.trim() && !sending ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: '1.1rem',
              cursor: text.trim() && !sending ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.2s',
            }}
          >
            {sending ? '⏳' : '➤'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
