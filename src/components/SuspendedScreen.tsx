'use client';

import { supabase } from '@/lib/supabaseClient';

interface Props {
  reason?: string | null;
  until?: string | null;
  permanent?: boolean;
}

export default function SuspendedScreen({ reason, until, permanent }: Props) {
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PY', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #1C1C2E 0%, #2d1b3d 50%, #1C1C2E 100%)' }}>
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-white mb-2">
          Cuenta Suspendida
        </h1>

        {/* Subtitle */}
        <p className="text-sm text-gray-400 mb-6">
          Tu cuenta ha sido suspendida{permanent ? ' permanentemente' : ''} y no puedes acceder a la aplicación en este momento.
        </p>

        {/* Info card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-5 mb-6 text-left space-y-3">
          {reason && (
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">Motivo</p>
              <p className="text-sm text-gray-300">{reason}</p>
            </div>
          )}
          {!permanent && until && (
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">Suspendido hasta</p>
              <p className="text-sm text-gray-300">{fmtDate(until)}</p>
            </div>
          )}
          {permanent && (
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">Duración</p>
              <p className="text-sm text-red-400 font-semibold">Permanente</p>
            </div>
          )}
        </div>

        {/* Contact support */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-amber-300 font-medium">
            Si crees que esto es un error, contacta con soporte.
          </p>
          <a
            href="mailto:soporte@tukitask.com"
            className="inline-block mt-2 px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg text-sm font-bold hover:bg-yellow-400 transition-colors"
          >
            Contactar Soporte
          </a>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
