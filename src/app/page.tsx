'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Redirige al usuario segun su sesion activa.
// Si no hay sesion → /auth. Si hay sesion → pagina de su rol.
// Evita que el boton atras en mobile muestre la pantalla de login
// cuando el usuario ya esta autenticado.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        // getSession() lee de localStorage — sin red, muy rapido
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.replace('/auth'); return; }

        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: session.user.email }),
        });
        const json = await res.json();
        if      (json?.role === 'admin')                                router.replace('/admin');
        else if (json?.role === 'driver')                              router.replace('/driver');
        else if (json?.role === 'cliente')                             router.replace('/cliente');
        else if (json?.role === 'servicio' || json?.role === 'tecnico') router.replace('/tecnico');
        else if (json?.role === 'vendedor')                            router.replace('/vendedor');
        else                                                           router.replace('/auth');
      } catch {
        router.replace('/auth');
      }
    })();
  }, []);

  // Pantalla en blanco mientras verifica — se resuelve en milisegundos
  return null;
}
