'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import '../driver/driver.css';
import { DriverDrawer } from '../driver/components/DriverDrawer';
import { DriverContext, DEFAULT_FILTERS } from '../driver/context';
import { NotificationBell } from '@/components/NotificationBell';
import { ChatBadge } from '@/components/ChatBadge';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { BottomNav } from '../driver/components/BottomNav';

const TECNICO_TABS = [
  { href: '/tecnico',                   icon: '🏠', label: 'Inicio'    },
  { href: '/tecnico/ofertas',           icon: '🔧', label: 'Ofertas'   },
  { href: '/tecnico/citas',             icon: '📅', label: 'Citas'     },
  { href: '/tecnico/billetera',         icon: '💰', label: 'Billetera' },
  { href: '/tecnico/settings',          icon: '⚙️', label: 'Config'    },
];

export default function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [navApp, setNavApp] = useState('google_maps');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  usePushNotifications(email || undefined);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      // getSession() reads from localStorage — no network call, very fast
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) { router.push('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      if (!['servicio', 'tecnico'].includes(cachedRole ?? '')) {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          const roleVal = (json?.role || '').toString().trim().toLowerCase();
          setRole(roleVal || null);
          if (!['servicio', 'tecnico'].includes(roleVal)) { router.push('/auth'); return; }
          setCachedRole(userEmail, roleVal);
        } catch (err) {
          console.error('Tecnico role check failed:', err);
          router.push('/auth');
          return;
        }
      } else {
        setRole(cachedRole);
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
      setChecking(false); // show content BEFORE profile load

      // Load profile in background — updates state and refreshes cache
      Promise.all([
        fetch(`/api/driver-profile?email=${encodeURIComponent(userEmail)}`).then(r => r.json()),
        fetch(`/api/tecnico/settings?email=${encodeURIComponent(userEmail)}`).then(r => r.json()),
      ]).then(([profJson, settingsJson]) => {
        if (!mounted) return;
        const photo = profJson.profile?.profile_photo || settingsJson.settings?.profile_photo || '';
        const fn    = profJson.profile?.first_name || settingsJson.settings?.first_name || '';
        const ln    = profJson.profile?.last_name  || settingsJson.settings?.last_name  || '';
        const full  = [fn, ln].filter(Boolean).join(' ');
        if (photo) setProfilePhoto(photo);
        if (full)  setDisplayName(full);
        if (profJson.profile?.nav_app) setNavApp(profJson.profile.nav_app);
        if (settingsJson.settings?.avg_rating)    setAvgRating(Number(settingsJson.settings.avg_rating));
        if (settingsJson.settings?.total_ratings) setTotalRatings(Number(settingsJson.settings.total_ratings));
        // Save to cache so next load shows correct name+photo instantly
        try {
          localStorage.setItem(`tuki_profile_${userEmail}`, JSON.stringify({ displayName: full, profilePhoto: photo }));
        } catch {}
      }).catch(() => {});
    }

    checkAccess();

    // Only react to SIGNED_OUT — token refresh fires SIGNED_IN and caused re-auth flash
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/auth');
    });

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
      <NotificationBell userEmail={email} className="" />
      <ChatBadge email={email} href="/tecnico/citas" scope="job" />
      <DriverContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, avgRating, totalRatings, serviceFilters: DEFAULT_FILTERS, toggleFilter: () => {}, navApp, pickupRangeKm: 10, setPickupRangeKm: () => {}, deliveryRangeKm: 20, setDeliveryRangeKm: () => {} }}>
        <main>
          {children}
        </main>
        <BottomNav tabs={TECNICO_TABS} accent="#F5C518" />
      </DriverContext.Provider>
    </div>
  );
}
