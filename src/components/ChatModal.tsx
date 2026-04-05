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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const scope = orderId ? `order_id=${orderId}` : `job_id=${jobId}`;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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
    if (open && messages.length > 0) scrollToBottom();
  }, [messages, open, scrollToBottom]);

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
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender_email !== myEmail) {
          setUnread(u => u + 1);
          // Marcar como leído automáticamente si el chat está abierto
          authFetch('/api/chat', {
            method: 'PATCH',
            body: JSON.stringify(orderId ? { order_id: orderId } : { job_id: jobId }),
          }).catch(() => {});
        }
        scrollToBottom();
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [open, orderId, jobId, myEmail, scrollToBottom]);

  const sendMessage = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
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
        alert(j?.error || 'No se pudo enviar el mensaje.');
        setText(content); // restaurar texto
      }
    } catch { alert('Error de red al enviar.'); setText(content); }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
        height: '85vh', maxHeight: 700,
        background: '#0f172a',
        borderRadius: '24px 24px 0 0',
        border: '1px solid rgba(34,197,94,0.2)',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.03)',
          flexShrink: 0,
        }}>
          {/* Drag handle */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, background: '#334155', borderRadius: 2 }} />

          {otherPhoto ? (
            <img src={otherPhoto} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #22c55e', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
              {orderId ? '🚗' : '👷'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {otherName || (orderId ? 'Conductor' : 'Técnico')}
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
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>

        {/* ── Mensajes ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px 0', fontSize: '0.85rem' }}>
              Cargando mensajes...
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                Comenzá la conversación.<br />Los mensajes son privados entre vos y {otherName || 'el conductor'}.
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
                    {msg.sender_name || (msg.sender_role === 'client' ? 'Cliente' : msg.sender_role === 'driver' ? 'Conductor' : 'Técnico')}
                  </div>
                )}
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isMe
                    ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                    : 'rgba(255,255,255,0.08)',
                  color: isMe ? '#fff' : 'rgba(255,255,255,0.9)',
                  fontSize: '0.9rem',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  boxShadow: isMe ? '0 2px 12px rgba(34,197,94,0.25)' : 'none',
                }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', marginTop: 3, paddingLeft: 4, paddingRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {formatTime(msg.created_at)}
                  {isMe && msg.read_at && <span style={{ color: '#22c55e' }}>✓✓</span>}
                  {isMe && !msg.read_at && <span>✓</span>}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div style={{
          padding: '10px 12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.3)',
          flexShrink: 0,
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un mensaje..."
            rows={1}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '10px 14px',
              color: '#fff',
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
  );
}
