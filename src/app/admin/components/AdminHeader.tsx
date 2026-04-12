'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AdminHeader() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  return (
    <header className="h-16 bg-[#1C1C2E] border-b border-[rgba(245,197,24,0.12)] flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Panel de Administración</h2>
      </div>
      <div className="flex items-center gap-4">
        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[#F5C518] to-[#F58A07] rounded-full flex items-center justify-center">
            <span className="text-[#1C1C2E] text-sm font-bold">
              {email ? email[0].toUpperCase() : 'A'}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-white">{email || 'Admin'}</p>
            <p className="text-xs text-[rgba(255,255,255,0.4)]">Administrador</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
