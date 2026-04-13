
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AdminSidebar from './components/AdminSidebar';
import AdminHeader from './components/AdminHeader';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
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
      <div className="min-h-screen bg-[#13131F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          <p className="text-[rgba(255,255,255,0.5)] text-sm">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#13131F]">
      <AdminSidebar />
      <div className="ml-64 transition-all duration-300">
        <AdminHeader />
        <main className="p-6 text-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}
