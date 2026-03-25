// Componente de autenticación con Supabase
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Auth() {
  const router = useRouter();
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
        if (json?.role === 'admin') router.push('/admin');
        else if (json?.role === 'driver') router.push('/driver');
        else if (json?.role === 'cliente') router.push('/cliente');
        else if (json?.role === 'servicio' || json?.role === 'tecnico') router.push('/tecnico');
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

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(cfg => {
        setLogoUrl(cfg.logo_url || '/logo.svg');
        if (cfg.logo_size) setLogoSize(Number(cfg.logo_size));
      })
      .catch(() => { setLogoUrl('/logo.svg'); });
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
        while (tries < 10) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) break;
          await new Promise(r => setTimeout(r, 200));
          tries++;
        }
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        });
        const json = await res.json();
        if (json?.role === 'admin')                          router.push('/admin');
        else if (json?.role === 'driver')                    router.push('/driver');
        else if (json?.role === 'cliente')                   router.push('/cliente');
        else if (json?.role === 'servicio' || json?.role === 'tecnico') router.push('/tecnico');
        else if (json?.role)                                 router.push('/');
        else setError('No se encontró tu cuenta en el sistema.');
      } catch { setError('Error al verificar permisos.'); }
    } else {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (!error) {
      const emailNormalized = email.toLowerCase();
      if (emailNormalized === 'audeliogauto@hotmail.com') {
        await supabase.from('users').upsert({ email: emailNormalized, role: 'admin' }, { onConflict: 'email' });
      }
    }
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess('¡Registro exitoso! Revisá tu email para confirmar tu cuenta.');
  };

  const switchMode = () => {
    setIsRegister(v => !v);
    setError(null);
    setSuccess(null);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #1C1C2E 0%, #16213E 60%, #0F3460 100%)',
      padding: '24px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorative blobs */}
      <div style={{
        position: 'absolute', top: -100, right: -80, width: 320, height: 320,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,197,24,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -60, width: 260, height: 260,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,138,7,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(245,197,24,0.18)',
        borderRadius: 24,
        padding: '36px 32px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,197,24,0.08)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, minHeight: 90 }}>
            {logoUrl === null ? (
              // Placeholder while config loads — no flash
              <div style={{ width: 90, height: 90 }} />
            ) : logoFailed ? (
              <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #2563EB, #F5C518)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(245,197,24,0.4)' }}>
                <span style={{ fontSize: '2.2rem' }}>📦</span>
              </div>
            ) : (
              <img
                src={logoUrl}
                alt="TukiTask"
                style={{ height: logoSize, width: 'auto', objectFit: 'contain' }}
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#F5C518', letterSpacing: '-0.02em' }}>
            {isRegister ? 'Crear cuenta' : 'Bienvenido'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.87rem', color: 'rgba(255,255,255,0.45)' }}>
            {isRegister ? 'Completá tus datos para registrarte' : 'Ingresá a tu cuenta TukiTask'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', borderRadius: 12, background: 'rgba(255,255,255,0.06)',
          padding: 3, marginBottom: 24, gap: 3,
        }}>
          {(['Iniciar sesión', 'Registrarse'] as const).map((label, i) => {
            const active = isRegister === (i === 1);
            return (
              <button
                key={label}
                onClick={switchMode}
                type="button"
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
                  background: active ? 'linear-gradient(135deg, #F5C518, #F58A07)' : 'transparent',
                  color: active ? '#1C1C2E' : 'rgba(255,255,255,0.45)',
                  boxShadow: active ? '0 2px 10px rgba(245,197,24,0.3)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={isRegister ? handleSignUp : handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Correo electrónico
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', fontSize: '1rem' }}>✉️</span>
              <input
                type="email"
                placeholder="nombre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12,
                  border: '1.5px solid rgba(245,197,24,0.2)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.2)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', fontSize: '1rem' }}>🔒</span>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%', padding: '12px 44px 12px 40px', borderRadius: 12,
                  border: '1.5px solid rgba(245,197,24,0.2)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(245,197,24,0.2)'}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '1rem', padding: 2 }}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.84rem', fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '0.84rem', fontWeight: 500 }}>
              ✅ {success}
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
                ? 'rgba(245,197,24,0.3)'
                : 'linear-gradient(135deg, #F5C518 0%, #F58A07 100%)',
              color: loading ? 'rgba(255,255,255,0.5)' : '#1C1C2E',
              fontWeight: 800, fontSize: '1rem', letterSpacing: '0.01em',
              boxShadow: loading ? 'none' : '0 4px 18px rgba(245,197,24,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? (isRegister ? 'Registrando…' : 'Ingresando…')
              : (isRegister ? '🚀 Crear cuenta' : '⚡ Ingresar')
            }
          </button>
        </form>

        {/* Footer text */}
        <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.28)' }}>
          Al continuar aceptás nuestros{' '}
          <span style={{ color: 'rgba(245,197,24,0.6)', cursor: 'pointer' }}>Términos de uso</span>
        </p>
      </div>

      {/* Bottom tagline */}
      <p style={{ marginTop: 20, fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
        © 2026 TukiTask · Conectamos profesionales con clientes
      </p>
    </div>
  );
}
