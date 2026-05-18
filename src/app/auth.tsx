// Componente de autenticación con Supabase
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/useTheme';
import { Icon } from '@/components/Icon';

export default function Auth() {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const userEmail = (user.email || '').toLowerCase();
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        });
        const json = await res.json();
        if (json?.role === 'admin') router.replace('/admin');
        else if (json?.role === 'driver') router.replace('/driver');
        else if (json?.role === 'cliente') router.replace('/cliente');
        else if (json?.role === 'servicio' || json?.role === 'tecnico') router.replace('/tecnico');
        else if (json?.role === 'vendedor') router.replace('/vendedor');
        else if (json?.role) router.push('/');
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoUrl, setLogoUrl]   = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(90);
  const [isForgot, setIsForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(cfg => {
        setLogoUrl(cfg.logo_url || '/api/logo');
        if (cfg.logo_size) setLogoSize(Number(cfg.logo_size));
      })
      .catch(() => { setLogoUrl('/api/logo'); });
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const userEmail = (data?.user?.email || email).toLowerCase();
      try {
        let tries = 0;
        let token = data.session?.access_token ?? '';
        while (tries < 10) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) break;
          await new Promise(r => setTimeout(r, 200));
          tries++;
        }
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ email: userEmail }),
        });
        const json = await res.json();
        if (json?.role === 'admin')                          router.replace('/admin');
        else if (json?.role === 'driver')                    router.replace('/driver');
        else if (json?.role === 'cliente')                   router.replace('/cliente');
        else if (json?.role === 'servicio' || json?.role === 'tecnico') router.replace('/tecnico');
        else if (json?.role)                                 router.replace('/');
        else setError('No se encontró tu cuenta en el sistema.');
      } catch { setError('Error al verificar permisos.'); }
    } else {
      setError(translateAuthError(error.message));
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (!error) {
      // Role assignment happens server-side: ADMIN_EMAIL is a private env var never exposed to the client
      await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });
    }
    setLoading(false);
    if (error) setError(translateAuthError(error.message));
    else setSuccess('¡Registro exitoso! Revisá tu email para confirmar tu cuenta.');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Ingresá tu correo electrónico primero.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }),
      });
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Demasiados intentos. Esperá unos minutos.');
      } else {
        setForgotSent(true);
      }
    } catch {
      setError('Error de conexión. Verificá tu internet.');
    }
    setLoading(false);
  };

  /** Translate common Supabase auth errors to Spanish */
  function translateAuthError(msg: string): string {
    if (!msg) return 'Error desconocido.';
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) return 'Email o contraseña incorrectos.';
    if (m.includes('email not confirmed'))  return 'Debes confirmar tu email antes de ingresar. Revisá tu casilla.';
    if (m.includes('user already registered') || m.includes('already been registered')) return 'Este email ya está registrado. Intentá iniciar sesión.';
    if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
    if (m.includes('rate limit') || m.includes('too many requests') || m.includes('429')) return 'Demasiados intentos. Esperá unos minutos.';
    if (m.includes('banned') || m.includes('user is banned')) return 'Tu cuenta está suspendida. Contactá con soporte si creés que es un error.';
    if (m.includes('network') || m.includes('fetch')) return 'Error de conexión. Verificá tu internet.';
    if (m.includes('email')) return 'El correo ingresado no es válido.';
    return msg;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: isLight
        ? 'linear-gradient(140deg, #f6f7fb 0%, #eef2f7 55%, #e2e8f0 100%)'
        : 'linear-gradient(140deg, #0b1220 0%, #111827 55%, #0f172a 100%)',
      padding: '24px 16px',
      fontFamily: 'var(--font-sans), system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorative blobs */}
      <div style={{
        position: 'absolute', top: -100, right: -80, width: 320, height: 320,
        borderRadius: '50%', background: isLight
          ? 'radial-gradient(circle, rgba(245,197,24,0.12) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(245,197,24,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -60, width: 260, height: 260,
        borderRadius: '50%', background: isLight
          ? 'radial-gradient(circle, rgba(245,138,7,0.08) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(245,138,7,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: isLight ? '#ffffff' : 'rgba(15,23,42,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(245,197,24,0.22)',
        borderRadius: 24,
        padding: '36px 32px 32px',
        boxShadow: isLight
          ? '0 24px 64px rgba(15,23,42,0.10), 0 0 0 1px rgba(15,23,42,0.02)'
          : '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,197,24,0.08)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 90 }}>
            {logoUrl === null ? (
              // Placeholder while config loads — no flash
              <div style={{ width: 90, height: 90 }} />
            ) : logoFailed ? (
              <img
                src="/logo.svg"
                alt="TukiTask"
                style={{ height: logoSize, width: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <img
                src={logoUrl}
                alt="TukiTask"
                style={{ height: logoSize, width: 'auto', objectFit: 'contain' }}
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: isLight ? '#0f172a' : '#f8fafc', letterSpacing: '-0.02em' }}>
            {isForgot ? 'Recuperar contraseña' : isRegister ? 'Crear cuenta' : 'Bienvenido'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.87rem', color: isLight ? '#64748b' : 'rgba(226,232,240,0.62)' }}>
            {isForgot ? 'Te enviaremos un link para resetear tu contraseña' : isRegister ? 'Completá tus datos para registrarte' : 'Ingresá a tu cuenta TukiTask'}
          </p>
        </div>

        {/* Tab switcher — hidden on forgot password screen */}
        {!isForgot && (
        <div style={{
          display: 'flex', borderRadius: 12, background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
          padding: 3, marginBottom: 24, gap: 3,
        }}>
          {(['Iniciar sesión', 'Registrarse'] as const).map((label, i) => {
            const active = isRegister === (i === 1);
            return (
              <button
                key={label}
                onClick={() => { setIsRegister(i === 1); setIsForgot(false); setForgotSent(false); setError(null); setSuccess(null); }}
                type="button"
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
                  background: active ? 'linear-gradient(135deg, #F5C518, #F58A07)' : 'transparent',
                  color: active ? '#1C1C2E' : isLight ? '#64748b' : 'rgba(226,232,240,0.6)',
                  boxShadow: active ? '0 2px 10px rgba(245,197,24,0.3)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        )}

        {/* ── FORGOT PASSWORD SCREEN ── */}
        {isForgot && (
          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {forgotSent ? (
              <div style={{ padding: '14px', borderRadius: 12, background: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)', border: isLight ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(16,185,129,0.3)', color: isLight ? '#059669' : '#6ee7b7', fontSize: '0.88rem', textAlign: 'center' }}>
                <Icon name="check" size={14} /> Te enviamos un link a <strong>{email}</strong>.<br />Revisá tu bandeja de entrada (y spam).
              </div>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Correo electrónico</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', pointerEvents: 'none', lineHeight: 1 }}><Icon name="mail" size={15} /></span>
                    <input type="email" placeholder="nombre@email.com" value={email} onChange={e => setEmail(e.target.value)} required
                      style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: isLight ? '1.5px solid rgba(245,197,24,0.4)' : '1.5px solid rgba(245,197,24,0.2)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: isLight ? '#111' : '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: isLight ? 'rgba(220,38,38,0.08)' : 'rgba(239,68,68,0.12)', border: isLight ? '1px solid rgba(220,38,38,0.2)' : '1px solid rgba(239,68,68,0.3)', color: isLight ? '#dc2626' : '#fca5a5', fontSize: '0.84rem' }}><Icon name="exclamation" size={14} /> {error}</div>}
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer', background: loading ? 'rgba(245,197,24,0.3)' : 'linear-gradient(135deg, #F5C518 0%, #F58A07 100%)', color: loading ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)') : '#1C1C2E', fontWeight: 800, fontSize: '1rem' }}>
                  {loading ? 'Enviando…' : 'Enviar link de recuperación'}
                </button>
              </>
            )}
            <button type="button" onClick={() => { setIsForgot(false); setForgotSent(false); setError(null); }}
              style={{ background: 'none', border: 'none', color: isLight ? '#b45309' : 'rgba(245,197,24,0.7)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center', marginTop: 4 }}>
              ← Volver al inicio de sesión
            </button>
          </form>
        )}

        {/* ── MAIN FORM (login + register) ── */}
        {!isForgot && (
        <form onSubmit={isRegister ? handleSignUp : handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Correo electrónico
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', pointerEvents: 'none', lineHeight: 1 }}><Icon name="mail" size={15} /></span>
              <input
                type="email"
                placeholder="nombre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12,
                  border: isLight ? '1.5px solid rgba(245,197,24,0.4)' : '1.5px solid rgba(245,197,24,0.2)',
                  background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: isLight ? '#111' : '#fff', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = isLight ? 'rgba(245,197,24,0.4)' : 'rgba(245,197,24,0.2)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', pointerEvents: 'none', lineHeight: 1 }}><Icon name="lock" size={15} /></span>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : 6}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                style={{
                  width: '100%', padding: '12px 44px 12px 40px', borderRadius: 12,
                  border: isLight ? '1.5px solid rgba(245,197,24,0.4)' : '1.5px solid rgba(245,197,24,0.2)',
                  background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: isLight ? '#111' : '#fff', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = isLight ? 'rgba(245,197,24,0.4)' : 'rgba(245,197,24,0.2)'}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: '1rem', padding: 2 }}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Icon name={showPass ? 'eye-off' : 'eye'} size={16} />
              </button>
            </div>
          </div>

          {/* Forgot password link — only shown on login tab */}
          {!isRegister && (
            <button type="button" onClick={() => { setIsForgot(true); setError(null); setSuccess(null); }}
              style={{ background: 'none', border: 'none', color: isLight ? '#b45309' : '#F5C518', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'right', padding: 0, marginTop: -6, width: '100%', opacity: 0.75 }}>
              ¿Olvidaste tu contraseña?
            </button>
          )}

          {/* Error / Success */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: isLight ? 'rgba(220,38,38,0.08)' : 'rgba(239,68,68,0.12)', border: isLight ? '1px solid rgba(220,38,38,0.2)' : '1px solid rgba(239,68,68,0.3)', color: isLight ? '#dc2626' : '#fca5a5', fontSize: '0.84rem', fontWeight: 500 }}>
              <Icon name="exclamation" size={14} /> {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)', border: isLight ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(16,185,129,0.3)', color: isLight ? '#059669' : '#6ee7b7', fontSize: '0.84rem', fontWeight: 500 }}>
              <Icon name="check" size={14} /> {success}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, width: '100%', padding: '13px',
              borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer',
              background: loading
                ? isLight ? 'rgba(0,0,0,0.1)' : 'rgba(245,197,24,0.3)'
                : 'linear-gradient(135deg, #F5C518 0%, #F58A07 100%)',
              color: loading ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)') : '#1C1C2E',
              fontWeight: 800, fontSize: '1rem', letterSpacing: '0.01em',
              boxShadow: (loading || isLight) ? 'none' : '0 4px 18px rgba(245,197,24,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? (isRegister ? 'Registrando…' : 'Ingresando…')
              : (isRegister ? 'Crear cuenta' : 'Ingresar')
            }
          </button>
        </form>
        )}
        {/* Footer text */}
        <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.8rem', color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.28)' }}>
          Al continuar aceptás nuestros{' '}
          <span style={{ color: isLight ? '#b45309' : 'rgba(245,197,24,0.6)', cursor: 'pointer' }}>Términos de uso</span>
        </p>
      </div>

      {/* Bottom tagline */}
      <p style={{ marginTop: 20, fontSize: '0.75rem', color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
        © 2026 TukiTask · Conectamos profesionales con clientes
      </p>
    </div>
  );
}
