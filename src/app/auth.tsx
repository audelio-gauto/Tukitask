// Componente de autenticación con Supabase
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Auth() {
  const router = useRouter();
  // If a session already exists (HMR / reload), redirect by role
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
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const userEmail = (data?.user?.email || email).toLowerCase();
      // Esperar a que la sesión se persista en el cliente antes de redirigir
      try {
        let tries = 0;
        let ok = false;
        while (tries < 10) {
          // Obtener usuario actual
          // eslint-disable-next-line no-await-in-loop
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            ok = true;
            console.log('Auth persisted, user:', userData.user.email);
            break;
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 200));
          tries += 1;
        }
        if (!ok) console.warn('No se detectó sesión persistida tras iniciar sesión');

        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        });
        const json = await res.json();
        if (json?.role === 'admin') {
          router.push('/admin');
        } else if (json?.role === 'driver') {
          router.push('/driver');
        } else if (json?.role === 'cliente') {
          router.push('/cliente');
        } else if (json?.role === 'servicio' || json?.role === 'tecnico') {
          router.push('/tecnico');
        } else if (json?.role) {
          router.push('/');
        } else {
          setError('No se encontró tu cuenta en el sistema.');
        }
      } catch (err) {
        setError('Error al verificar permisos.');
      }
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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (!error) {
      // Normalizar email al insertar/upsert
      const emailNormalized = email.toLowerCase();
      if (emailNormalized === 'audeliogauto@hotmail.com') {
        // Insertar en la tabla users con rol admin
        await supabase.from('users').upsert({ email: emailNormalized, role: 'admin' }, { onConflict: 'email' });
      }
    }
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess('Registro exitoso. Revisa tu email para confirmar tu cuenta.');
  };

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto mt-10">
      <form onSubmit={isRegister ? handleSignUp : handleSignIn} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <button type="submit" className="bg-blue-600 text-white p-2 rounded" disabled={loading}>
          {loading ? (isRegister ? 'Registrando...' : 'Entrando...') : (isRegister ? 'Registrarse' : 'Entrar')}
        </button>
        {error && <p className="text-red-500">{error}</p>}
        {success && <p className="text-green-600">{success}</p>}
      </form>
      <button
        type="button"
        className="underline text-sm text-blue-700 mt-2"
        onClick={() => {
          setIsRegister(!isRegister);
          setError(null);
          setSuccess(null);
        }}
      >
        {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
      </button>
    </div>
  );
}
