'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { initTheme } from '@/lib/useTheme';
import VendedorSidebar from './components/VendedorSidebar';
import VendedorHeader  from './components/VendedorHeader';
import './vendedor.css';

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    initTheme();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/auth'); return; }

      try {
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email: session.user.email }),
        });
        const json = await res.json();
        if (json?.role !== 'vendedor' && json?.role !== 'admin') {
          router.replace('/auth');
          return;
        }
        setChecking(false);
      } catch {
        router.replace('/auth');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="vnd-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, border: '4px solid #F5C518', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.875rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vnd-root">
      <VendedorSidebar />
      <div style={{ marginLeft: 256, transition: 'margin 0.3s' }}>
        <VendedorHeader />
        <main className="vnd-content">
          {children}
        </main>
      </div>
    </div>
  );
}
