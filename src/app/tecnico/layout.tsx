'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '../driver/driver.css';
import { DriverDrawer } from '../driver/components/DriverDrawer';
import { DriverContext } from '../driver/context';

export default function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) { router.push('/auth'); return; }
      setEmail(user.email || '');

      // First, try to use role stored in user metadata as a fast fallback
      try {
        const metaRole = ((user as any)?.user_metadata?.role || (user as any)?.role || '').toString().trim().toLowerCase();
        if (metaRole) {
          console.log('Tecnico metadata role:', metaRole);
          setRole(metaRole || null);
          if (['servicio', 'tecnico'].includes(metaRole)) {
            setDisplayName(user.email?.split('@')[0] || '');
            try {
              const profRes = await fetch(`/api/driver-profile?email=${encodeURIComponent(user.email || '')}`);
              const profJson = await profRes.json();
              if (profJson.profile?.profile_photo) setProfilePhoto(profJson.profile.profile_photo);
            } catch {}
            setChecking(false);
            return;
          }
        }
      } catch (e) {
        console.log('Error reading user metadata role:', e);
      }

      // Fallback to server-side role check
      try {
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        const json = await res.json();
        console.log('Tecnico check-role response:', json);
        // Accept any variant of 'servicio' or 'tecnico' (case/space insensitive)
        const roleVal = (json?.role || '').toString().trim().toLowerCase();
        console.log('Tecnico role check:', roleVal);
        setRole(roleVal || null);
        if (!['servicio', 'tecnico'].includes(roleVal)) {
          // In dev, show debug overlay briefly before redirecting to help diagnosis
          if (process.env.NODE_ENV !== 'production') {
            setTimeout(() => router.push('/auth'), 1200);
          } else {
            router.push('/auth');
          }
          return;
        }
        setDisplayName(user.email?.split('@')[0] || '');
        // Try load profile photo like driver
        try {
          const profRes = await fetch(`/api/driver-profile?email=${encodeURIComponent(user.email || '')}`);
          const profJson = await profRes.json();
          if (profJson.profile?.profile_photo) setProfilePhoto(profJson.profile.profile_photo);
        } catch {}
        setChecking(false);
      } catch (err) {
        console.error('Tecnico role check failed:', err);
        router.push('/auth');
      }
    }

    // Run initial check
    checkAccess();

    // Listen for auth state changes (helps when HMR or other reloads occur)
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (event === 'SIGNED_OUT') {
          router.push('/auth');
        } else if (event === 'SIGNED_IN') {
          // Re-run access check when a sign-in occurs
          checkAccess();
        }
      } catch (e) {
        // ignore
      }
    });

    // Cleanup
    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="tuki-driver-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="tuki-spinner" />
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // debug overlay removed - UI will render normally; use console logs for debugging

  return (
    <div className="tuki-driver-app">
      <DriverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={email}
        displayName={displayName}
        profilePhoto={profilePhoto}
        role={role}
      />
      <DriverContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto }}>
        <main>
          {children}
        </main>
      </DriverContext.Provider>
    </div>
  );
}
