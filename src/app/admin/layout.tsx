
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AdminSidebar from './components/AdminSidebar';
import AdminHeader from './components/AdminHeader';
import { initTheme } from '@/lib/useTheme';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: session.user.email }),
        });
        const json = await res.json();
        if (json?.role !== 'admin') { router.replace('/auth'); return; }
        setChecking(false);
      } catch {
        router.replace('/auth');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="adm-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          <p style={{ color: 'var(--adm-text-muted)', fontSize: '0.875rem' }}>Verificando permisos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-root">
      <AdminSidebar />
      <div className="ml-64 transition-all duration-300">
        <AdminHeader />
        <main className="adm-content">
          {children}
        </main>
      </div>
    </div>
  );
}
