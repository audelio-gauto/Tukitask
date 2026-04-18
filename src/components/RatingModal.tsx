'use client';
import { useState } from 'react';

interface RatingModalProps {
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  avatarName?: string;
  onSubmit: (rating: number, note: string) => Promise<void>;
  onClose: () => void;
}

export default function RatingModal({
  title, subtitle, avatarUrl, avatarName, onSubmit, onClose,
}: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const displayRating = hovered || rating;

  const handleSubmit = async () => {
    if (rating === 0) { setError('Por favor selecciona una calificación'); return; }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(rating, note);
    } catch {
      setError('Error al guardar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'var(--modal-bg)', borderRadius: 24, padding: '1.75rem 1.5rem',
        width: '100%', maxWidth: 340, textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        border: '1px solid var(--border-subtle)',
        animation: 'ratingSlideUp 0.25s ease',
      }}>
        {/* Avatar */}
        {(avatarUrl || avatarName) && (
          <div style={{
            width: 76, height: 76, borderRadius: '50%', margin: '0 auto 1rem',
            background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '2rem',
            border: '3px solid #10b981',
          }}>
            {!avatarUrl && avatarName?.[0]?.toUpperCase()}
          </div>
        )}

        <h3 style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)', margin: '0 0 4px' }}>{title}</h3>
        {subtitle && (
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: '1.25rem' }}>{subtitle}</p>
        )}

        {/* Stars */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '1rem 0 1.25rem' }}>
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              style={{
                fontSize: '2.4rem', background: 'none', border: 'none', cursor: 'pointer',
                color: displayRating >= star ? '#f59e0b' : '#d1d5db',
                transition: 'transform 0.12s, color 0.12s',
                transform: displayRating >= star ? 'scale(1.2)' : 'scale(1)',
                padding: 0, lineHeight: 1,
              }}
              aria-label={`${star} estrellas`}
            >
              ★
            </button>
          ))}
        </div>

        {rating > 0 && (
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem', fontWeight: 500 }}>
            {['', '😞 Muy malo', '😕 Malo', '😐 Regular', '😊 Bueno', '🤩 Excelente'][rating]}
          </div>
        )}

        {/* Note */}
        <textarea
          placeholder="Comentario opcional..."
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          style={{
            width: '100%', borderRadius: 10, border: '1.5px solid var(--input-border)',
            padding: '0.6rem 0.75rem', fontSize: '0.9rem', resize: 'none',
            fontFamily: 'inherit', marginBottom: '0.75rem', background: 'var(--input-bg)',
            outline: 'none', boxSizing: 'border-box', color: 'var(--input-text)',
          }}
        />

        {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '0.7rem', borderRadius: 10,
              background: 'var(--glass-card)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
              fontWeight: 600, color: '#94a3b8', fontSize: '0.9rem',
            }}
          >
            Ahora no
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            style={{
              flex: 2, padding: '0.7rem', borderRadius: 10,
              background: rating === 0 ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none', cursor: rating === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 700, color: rating === 0 ? '#475569' : '#fff', fontSize: '0.9rem',
              transition: 'background 0.2s',
            }}
          >
            {submitting ? 'Enviando...' : '⭐ Enviar calificación'}
          </button>
        </div>

        <style>{`
          @keyframes ratingSlideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
