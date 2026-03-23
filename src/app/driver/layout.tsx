'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriverContext, DEFAULT_FILTERS } from './context';
import type { ServiceFilters } from './context';
import { supabase } from '@/lib/supabaseClient';
import './driver.css';
import { DriverDrawer } from './components/DriverDrawer';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [navApp, setNavApp] = useState('google_maps');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [serviceFilters, setServiceFilters] = useState<ServiceFilters>(DEFAULT_FILTERS);
  const toggleFilter = (key: string) => setServiceFilters(prev => ({ ...prev, [key]: !prev[key] }));
  const [pickupRangeKm, setPickupRangeKm] = useState(10);
  const [deliveryRangeKm, setDeliveryRangeKm] = useState(20);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setEmail(user.email || '');
      // Use API route to check role (bypasses RLS and handles case-insensitive email)
      try {
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        const json = await res.json();
        if (json?.role !== 'driver') { router.push('/auth'); return; }
        setDisplayName(user.email?.split('@')[0] || '');
        // Load profile photo
        try {
          const profRes = await fetch(`/api/driver-profile?email=${encodeURIComponent(user.email || '')}`);
          const profJson = await profRes.json();
          if (profJson.profile?.profile_photo) setProfilePhoto(profJson.profile.profile_photo);
          if (profJson.profile?.nav_app) setNavApp(profJson.profile.nav_app);
          if (profJson.profile?.pickup_range) setPickupRangeKm(Number(profJson.profile.pickup_range));
          if (profJson.profile?.delivery_range) setDeliveryRangeKm(Number(profJson.profile.delivery_range));
        } catch {}
        setChecking(false);
      } catch {
        router.push('/auth');
      }
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
      <DriverContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, serviceFilters, toggleFilter, navApp, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm }}>
        {children}
      </DriverContext.Provider>
    </div>
  );
}


