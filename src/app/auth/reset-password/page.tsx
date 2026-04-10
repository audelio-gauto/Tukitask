'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash token automatically.
    // We just need to verify the session exists.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionReady(true);
      } else {
        setError('El link de recuperación es inválido o ya expiró. Solicitá uno nuevo.');
      }
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push('/auth'), 3000);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0D0D1A 0%, #1C1C2E 50%, #16213E 100%)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)', borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '36px 32px', boxSizing: 'border-box',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#F5C518' }}>
          Nueva contraseña
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: '0.87rem', color: 'rgba(255,255,255,0.45)' }}>
          Elegí una contraseña segura de al menos 8 caracteres.
        </p>

        {success ? (
          <div style={{
            padding: '16px', borderRadius: 12,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
            color: '#6ee7b7', fontSize: '0.9rem', textAlign: 'center',
          }}>
            ✅ ¡Contraseña actualizada! Redirigiendo al login…
          </div>
        ) : (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1.5px solid rgba(245,197,24,0.2)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff',
                  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repetí la contraseña"
                required
                minLength={8}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1.5px solid rgba(245,197,24,0.2)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff',
                  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5', fontSize: '0.84rem',
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !sessionReady}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                cursor: (loading || !sessionReady) ? 'default' : 'pointer',
                background: (loading || !sessionReady)
                  ? 'rgba(245,197,24,0.3)'
                  : 'linear-gradient(135deg, #F5C518 0%, #F58A07 100%)',
                color: (loading || !sessionReady) ? 'rgba(255,255,255,0.5)' : '#1C1C2E',
                fontWeight: 800, fontSize: '1rem',
              }}
            >
              {loading ? 'Guardando…' : '🔐 Guardar nueva contraseña'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/auth')}
              style={{ background: 'none', border: 'none', color: 'rgba(245,197,24,0.65)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
            >
              ← Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
