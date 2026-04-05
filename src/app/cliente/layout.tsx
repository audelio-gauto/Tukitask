'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientContext } from './context';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import './cliente.css';
import { ClientDrawer } from './components/ClientDrawer';
import { NotificationBell } from '@/components/NotificationBell';
import { usePushNotifications } from '@/lib/usePushNotifications';

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [phone, setPhone] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  usePushNotifications(email || undefined);

  useEffect(() => {
    (async () => {
      // getSession() reads from localStorage — no network call, very fast
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      if (cachedRole !== 'cliente') {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          if (json?.role !== 'cliente') { router.push('/auth'); return; }
          setCachedRole(userEmail, json.role);
        } catch {
          router.push('/auth');
          return;
        }
      }

      setDisplayName(userEmail.split('@')[0] || '');
      setChecking(false);

      // Load client profile (non-blocking — content already visible)
      fetch(`/api/client-profile?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(data => {
          const p = data?.profile;
          if (p) {
            if (p.display_name) setDisplayName(p.display_name);
            if (p.phone) setPhone(p.phone);
            if (p.photo_url) setProfilePhoto(p.photo_url);
            if (p.avg_rating) setAvgRating(Number(p.avg_rating));
            if (p.total_ratings) setTotalRatings(Number(p.total_ratings));
          }
        })
        .catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="tuki-client-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="client-spinner" />
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tuki-client-app">
      <ClientDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={email}
        displayName={displayName}
        profilePhoto={profilePhoto}
      />
      <NotificationBell userEmail={email} className="" />
      <ClientContext.Provider value={{
        openDrawer: () => setDrawerOpen(true),
        email, displayName, profilePhoto, setProfilePhoto,
        phone, setPhone,
        avgRating, setAvgRating,
        totalRatings, setTotalRatings,
      }}>
        {children}
      </ClientContext.Provider>
    </div>
  );
}
