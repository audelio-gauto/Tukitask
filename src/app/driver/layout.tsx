'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriverContext, DEFAULT_FILTERS } from './context';
import type { ServiceFilters } from './context';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import './driver.css';
import { DriverDrawer } from './components/DriverDrawer';
import { NotificationBell } from '@/components/NotificationBell';
import { ChatBadge } from '@/components/ChatBadge';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { BottomNav } from './components/BottomNav';

const DRIVER_TABS = [
  { href: '/driver',           label: 'Inicio',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg> },
  { href: '/driver/delivered', label: 'Historial', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { href: '/driver/ganancias', label: 'Ganancias', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3v18h18M7 13v6M12 9v10M17 5v14" /></svg> },
  { href: '/driver/settings',  label: 'Config',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
];

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [navApp, setNavApp] = useState('google_maps');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [serviceFilters, setServiceFilters] = useState<ServiceFilters>(DEFAULT_FILTERS);
  const toggleFilter = (key: string) => setServiceFilters(prev => ({ ...prev, [key]: !prev[key] }));
  const [pickupRangeKm, setPickupRangeKm] = useState(10);
  const [deliveryRangeKm, setDeliveryRangeKm] = useState(20);
  usePushNotifications(email || undefined);

  useEffect(() => {
    (async () => {
      // getSession() reads from localStorage — no network call, very fast
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      if (cachedRole !== 'driver') {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          if (json?.role !== 'driver') { router.replace('/auth'); return; }
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
      setChecking(false); // show content BEFORE profile load

      // Load profile in background — updates state and refreshes cache
      fetch(`/api/driver-profile?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(profJson => {
          const photo    = profJson.profile?.profile_photo || '';
          const firstName = profJson.profile?.first_name || '';
          const lastName  = profJson.profile?.last_name  || '';
          const fullName  = [firstName, lastName].filter(Boolean).join(' ');
          if (photo)    setProfilePhoto(photo);
          if (fullName) setDisplayName(fullName);
          if (profJson.profile?.nav_app) setNavApp(profJson.profile.nav_app);
          if (profJson.profile?.pickup_range)   setPickupRangeKm(Number(profJson.profile.pickup_range));
          if (profJson.profile?.delivery_range) setDeliveryRangeKm(Number(profJson.profile.delivery_range));
          if (profJson.profile?.avg_rating)     setAvgRating(Number(profJson.profile.avg_rating));
          if (profJson.profile?.total_ratings)  setTotalRatings(Number(profJson.profile.total_ratings));
          if (profJson.profile?.service_filters && typeof profJson.profile.service_filters === 'object') {
            setServiceFilters({ ...DEFAULT_FILTERS, ...profJson.profile.service_filters });
          }
          // Save to cache so next load shows correct name+photo instantly
          try {
            localStorage.setItem(`tuki_profile_${userEmail}`, JSON.stringify({ displayName: fullName, profilePhoto: photo }));
          } catch {}
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
      <div className="tuki-driver-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="tuki-spinner" />
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tuki-driver-app">
      <DriverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={email}
        displayName={displayName}
        profilePhoto={profilePhoto}
      />
      <NotificationBell userEmail={email} className="" />
      <ChatBadge email={email} href="/driver/deliveries" scope="order" />
      <DriverContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, avgRating, totalRatings, serviceFilters, toggleFilter, navApp, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm }}>
        {children}
        <BottomNav tabs={DRIVER_TABS} accent="#F5C518" />
      </DriverContext.Provider>
    </div>
  );
}


