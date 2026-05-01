'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientContext } from './context';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import './cliente.css';
import { initTheme } from '@/lib/useTheme';
import { ClientDrawer } from './components/ClientDrawer';
import { NotificationBell } from '@/components/NotificationBell';
import { ChatBadge } from '@/components/ChatBadge';
import { usePushNotifications } from '@/lib/usePushNotifications';
import SuspendedScreen from '@/components/SuspendedScreen';
import OfferIncomingToast from './components/OfferIncomingToast';
import { getAppMode, saveRealRole, TASKER_ROLES } from '@/lib/modeSwitch';

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
  const [suspended, setSuspended] = useState<{ active: boolean; reason?: string; until?: string; permanent?: boolean }>({ active: false });
  usePushNotifications(email || undefined);

  // Apply saved theme on mount
  useEffect(() => { initTheme(); }, []);

  useEffect(() => {
    (async () => {
      // getSession() reads from localStorage — no network call, very fast
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      const isModeCliente = getAppMode() === 'cliente';

      if (cachedRole !== 'cliente') {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          const realRole = (json?.role || '').toLowerCase();
          // Allow driver/tecnico/servicio if they explicitly switched to client mode
          if (realRole !== 'cliente' && !(isModeCliente && TASKER_ROLES.includes(realRole))) {
            router.replace('/auth'); return;
          }
          if (TASKER_ROLES.includes(realRole)) saveRealRole(realRole);
          setCachedRole(userEmail, json.role);
        } catch {
          router.replace('/auth');
          return;
        }
      }

      // Read profile from cache immediately — avoids showing email prefix on load
      try {
        const cached = JSON.parse(localStorage.getItem(`tuki_profile_${userEmail}`) || 'null');
        if (cached?.displayName) setDisplayName(cached.displayName);
        else setDisplayName(userEmail.split('@')[0] || '');
        if (cached?.profilePhoto) setProfilePhoto(cached.profilePhoto);
      } catch {
        setDisplayName(userEmail.split('@')[0] || '');
      }
      setChecking(false);

      // Check suspension status
      fetch('/api/me/suspension', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(r => r.json()).then(s => {
        if (s?.suspended) setSuspended({ active: true, reason: s.reason, until: s.until || s.banned_until, permanent: s.permanent });
      }).catch(() => {});

      // Load client profile in background — updates state and refreshes cache
      fetch(`/api/client-profile?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(data => {
          const p = data?.profile;
          if (p) {
            const name  = p.display_name || '';
            const photo = p.photo_url    || '';
            if (name)  setDisplayName(name);
            if (photo) setProfilePhoto(photo);
            if (p.phone) setPhone(p.phone);
            if (p.avg_rating)    setAvgRating(Number(p.avg_rating));
            if (p.total_ratings) setTotalRatings(Number(p.total_ratings));
            // Save to cache so next load shows correct name+photo instantly
            try {
              localStorage.setItem(`tuki_profile_${userEmail}`, JSON.stringify({ displayName: name, profilePhoto: photo }));
            } catch {}
          }
        })
        .catch(() => {});
    })();
    // Redirigir al auth solo cuando el usuario cierra sesion explicitamente
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/auth');
    });
    return () => { listener?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="tuki-client-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--surface-1)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="client-spinner" />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (suspended.active) {
    return <SuspendedScreen reason={suspended.reason} until={suspended.until} permanent={suspended.permanent} />;
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
      {email && <ChatBadge email={email} href="/cliente" scope="order" />}
      {email && <OfferIncomingToast email={email} />}
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
