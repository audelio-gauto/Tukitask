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
import { usePushNotifications } from '@/lib/usePushNotifications';

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
      if (!session?.user) { router.push('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      if (cachedRole !== 'driver') {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          if (json?.role !== 'driver') { router.push('/auth'); return; }
          setCachedRole(userEmail, json.role);
        } catch {
          router.push('/auth');
          return;
        }
      }

      setDisplayName(userEmail.split('@')[0] || '');
      setChecking(false); // show content BEFORE profile load

      // Load profile (non-blocking — content already visible)
      fetch(`/api/driver-profile?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(profJson => {
          if (profJson.profile?.profile_photo) setProfilePhoto(profJson.profile.profile_photo);
          if (profJson.profile?.nav_app) setNavApp(profJson.profile.nav_app);
          if (profJson.profile?.pickup_range) setPickupRangeKm(Number(profJson.profile.pickup_range));
          if (profJson.profile?.delivery_range) setDeliveryRangeKm(Number(profJson.profile.delivery_range));
          if (profJson.profile?.avg_rating) setAvgRating(Number(profJson.profile.avg_rating));
          if (profJson.profile?.total_ratings) setTotalRatings(Number(profJson.profile.total_ratings));
          if (profJson.profile?.service_filters && typeof profJson.profile.service_filters === 'object') {
            setServiceFilters({ ...DEFAULT_FILTERS, ...profJson.profile.service_filters });
          }
          const firstName = profJson.profile?.first_name || '';
          const lastName  = profJson.profile?.last_name  || '';
          const fullName  = [firstName, lastName].filter(Boolean).join(' ');
          if (fullName) setDisplayName(fullName);
        })
        .catch(() => {});
    })();
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
      <DriverContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, avgRating, totalRatings, serviceFilters, toggleFilter, navApp, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm }}>
        {children}
      </DriverContext.Provider>
    </div>
  );
}


