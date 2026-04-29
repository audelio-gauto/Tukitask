'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkerContext, DEFAULT_FILTERS } from './context';
import type { ServiceFilters } from './context';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import './driver.css';
import { initTheme } from '@/lib/useTheme';
import { WorkerDrawer } from '@/components/WorkerDrawer';
import { NotificationBell } from '@/components/NotificationBell';
import { ChatBadge } from '@/components/ChatBadge';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { BottomNav } from '@/components/BottomNav';
import SuspendedScreen from '@/components/SuspendedScreen';
import { authFetch } from '@/lib/authFetch';

const DRIVER_TABS = [
  { href: '/driver',           label: 'Inicio',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg> },
  { href: '/driver/activo',    label: 'Activo',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { href: '/driver/delivered', label: 'Historial', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { href: '/driver/ganancias', label: 'Ganancias', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3v18h18M7 13v6M12 9v10M17 5v14" /></svg> },
  { href: '/driver/settings',  label: 'Cuenta',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
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
  const [suspended, setSuspended] = useState<{ active: boolean; reason?: string; until?: string; permanent?: boolean }>({ active: false });
  const toggleFilter = (key: string) => setServiceFilters(prev => ({ ...prev, [key]: !prev[key] }));
  const [pickupRangeKm, setPickupRangeKm] = useState(10);
  const [deliveryRangeKm, setDeliveryRangeKm] = useState(20);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  usePushNotifications(email || undefined);

  // Apply saved theme on mount
  useEffect(() => { initTheme(); }, []);

  // ── GPS broadcast: always-on while driver app is open ──────────────────────
  // 1. Broadcasts via Supabase Realtime Broadcast (0 DB writes, < 1s latency)
  // 2. Writes to DB every 60s only — for clients that join late / fallback
  // 3. Skips DB write when driver is offline (saves ~4 writes/min per driver)
  // 4. Exposes driverPos via context — child pages must NOT create their own watchPosition
  useEffect(() => {
    if (!email) return;
    let lastLat: number | null = null;
    let lastLng: number | null = null;
    let lastDbLat: number | null = null;
    let lastDbLng: number | null = null;
    let watchId: number | null = null;
    let dbIntervalId: ReturnType<typeof setInterval> | null = null;

    // Supabase Broadcast channel — ephemeral, no DB writes
    const broadcastCh = supabase.channel(`loc:driver:${email}`, {
      config: { broadcast: { self: false } },
    });
    broadcastCh.subscribe();

    const broadcastLocation = (lat: number, lng: number) => {
      broadcastCh.send({
        type: 'broadcast',
        event: 'location',
        payload: { lat, lng },
      }).catch(() => {});
    };

    // DB write (throttled to 60s, skipped when offline)
    // 'driver_available' === 'false' means driver toggled offline
    const distMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const postToDB = () => {
      if (lastLat == null || lastLng == null) return;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('driver_available') === 'false') return;
      if (lastDbLat != null && lastDbLng != null) {
        const moved = distMeters({ lat: lastDbLat, lng: lastDbLng }, { lat: lastLat, lng: lastLng });
        if (moved < 50) return;
      }
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        fetch('/api/driver-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ lat: lastLat, lng: lastLng }),
        }).catch(() => {});
      });
      lastDbLat = lastLat;
      lastDbLng = lastLng;
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          lastLat = pos.coords.latitude;
          lastLng = pos.coords.longitude;
          // Share position with child pages via context (eliminates duplicate watchPosition)
          setDriverPos({ lat: lastLat, lng: lastLng });
          // Broadcast immediately on every GPS fix (< 1s for client)
          broadcastLocation(lastLat, lastLng);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 8_000, timeout: 15_000 },
      );
      // DB write every 60s (reduced from 15s — 75% fewer writes)
      dbIntervalId = setInterval(postToDB, 60_000);
    }

    // Background GPS — only activates inside the Capacitor APK.
    // On web browsers startBackgroundGeo() returns null (no-op).
    let bgGeoStop: (() => void) | null = null;
    import('@/lib/capacitorGeo').then(({ startBackgroundGeo }) =>
      startBackgroundGeo((lat, lng) => {
        lastLat = lat;
        lastLng = lng;
        setDriverPos({ lat, lng });
        broadcastLocation(lat, lng);
      }),
    ).then(cleanup => { bgGeoStop = cleanup; });

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (dbIntervalId != null) clearInterval(dbIntervalId);
      supabase.removeChannel(broadcastCh);
      bgGeoStop?.();
    };
  }, [email]);

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

      // Check suspension status
      fetch('/api/me/suspension', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(r => r.json()).then(s => {
        if (s?.suspended) setSuspended({ active: true, reason: s.reason, until: s.until || s.banned_until, permanent: s.permanent });
      }).catch(() => {});

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

  // Fetch active order count for the Activo tab badge
  useEffect(() => {
    if (!email) return;
    const ACTIVE_STATUSES = ['accepted', 'picking_up', 'in_transit'];
    const load = () => {
      authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .then((data: any[]) => {
          if (Array.isArray(data)) {
            setActiveOrderCount(data.filter(o => ACTIVE_STATUSES.includes(o.status)).length);
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [email]);

  if (checking) {
    return (
      <div className="tuki-driver-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-1)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div className="tuki-spinner" />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (suspended.active) {
    return <SuspendedScreen reason={suspended.reason} until={suspended.until} permanent={suspended.permanent} />;
  }

  return (
    <div className="tuki-driver-app">
      <WorkerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={email}
        displayName={displayName}
        profilePhoto={profilePhoto}
      />
      <NotificationBell userEmail={email} className="" />
      <ChatBadge email={email} href="/driver/delivered" scope="order" />
      <WorkerContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, avgRating, totalRatings, serviceFilters, toggleFilter, navApp, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm, driverPos, setDriverPos }}>
        {children}
        <BottomNav tabs={DRIVER_TABS.map(t => t.href === '/driver/activo' ? { ...t, badge: activeOrderCount } : t)} accent="#F5C518" />
      </WorkerContext.Provider>
    </div>
  );
}


