'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCachedRole, setCachedRole } from '@/lib/roleCache';
import '../driver/driver.css';
import './tecnico.css';
import { initTheme } from '@/lib/useTheme';
import { WorkerDrawer } from '@/components/WorkerDrawer';
import { WorkerContext, DEFAULT_FILTERS } from '../driver/context';
import { NotificationBell } from '@/components/NotificationBell';
import { ChatBadge } from '@/components/ChatBadge';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { BottomNav } from '@/components/BottomNav';
import SuspendedScreen from '@/components/SuspendedScreen';
import { authFetch } from '@/lib/authFetch';

const TECNICO_TABS = [
  { href: '/tecnico',           label: 'Inicio',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg> },
  { href: '/tecnico/activo',    label: 'Activo',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { href: '/tecnico/historial', label: 'Historial', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { href: '/tecnico/ganancias', label: 'Ganancias', icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3v18h18M7 13v6M12 9v10M17 5v14" /></svg> },
  { href: '/tecnico/settings',  label: 'Cuenta',    icon: <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
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
  const [suspended, setSuspended] = useState<{ active: boolean; reason?: string; until?: string; permanent?: boolean }>({ active: false });
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [activeJobCount, setActiveJobCount] = useState(0);
  usePushNotifications(email || undefined);

  // Apply saved theme on mount
  useEffect(() => { initTheme(); }, []);

  // ── GPS broadcast: always-on while tecnico app is open ─────────────────────
  // DB write every 60s (reduced from 15s), skipped when tecnico is offline
  // Exposes driverPos via context so child pages don't need their own watchPosition
  useEffect(() => {
    if (!email) return;
    let lastLat: number | null = null;
    let lastLng: number | null = null;
    let watchId: number | null = null;
    let dbIntervalId: ReturnType<typeof setInterval> | null = null;

    const broadcastCh = supabase.channel(`loc:tecnico:${email}`, {
      config: { broadcast: { self: false } },
    });
    broadcastCh.subscribe();

    const broadcastLocation = (lat: number, lng: number) => {
      broadcastCh.send({ type: 'broadcast', event: 'location', payload: { lat, lng } }).catch(() => {});
    };

    const postToDB = () => {
      if (lastLat == null || lastLng == null) return;
      // Skip DB write when tecnico is offline
      if (typeof localStorage !== 'undefined' && localStorage.getItem('tecnico_available') === 'false') return;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('tecnico_active_job_id')) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        fetch('/api/driver-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ lat: lastLat, lng: lastLng }),
        }).catch(() => {});
      });
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          lastLat = pos.coords.latitude;
          lastLng = pos.coords.longitude;
          // Share with child pages via context
          setDriverPos({ lat: lastLat, lng: lastLng });
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
    let mounted = true;

    async function checkAccess() {
      // getSession() reads from localStorage — no network call, very fast
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) { router.replace('/auth'); return; }
      const userEmail = session.user.email || '';
      setEmail(userEmail);

      // Fast path: role verified recently — skip network check
      const cachedRole = getCachedRole(userEmail);
      if (!['servicio', 'tecnico'].includes(cachedRole ?? '')) {
        try {
          const res = await fetch('/api/check-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ email: userEmail }),
          });
          const json = await res.json();
          const roleVal = (json?.role || '').toString().trim().toLowerCase();
          setRole(roleVal || null);
          if (!['servicio', 'tecnico'].includes(roleVal)) { router.replace('/auth'); return; }
          setCachedRole(userEmail, roleVal);
        } catch (err) {
          console.error('Tecnico role check failed:', err);
          router.replace('/auth');
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

      // Check suspension status
      fetch('/api/me/suspension', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(r => r.json()).then(s => {
        if (s?.suspended) setSuspended({ active: true, reason: s.reason, until: s.until || s.banned_until, permanent: s.permanent });
      }).catch(() => {});

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
      if (event === 'SIGNED_OUT') router.replace('/auth');
    });

    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch active job count for the Activo tab badge
  useEffect(() => {
    if (!email) return;
    const ACTIVE_JOB_STATUSES = ['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
    const load = () => {
      authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&active=true`)
        .then(r => r.json())
        .then((data: any) => {
          const jobs = Array.isArray(data) ? data : (Array.isArray(data?.jobs) ? data.jobs : []);
          setActiveJobCount(jobs.filter((j: any) => ACTIVE_JOB_STATUSES.includes(j.status)).length);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [email]);

  if (checking) {
    return (
      <div className="tuki-driver-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--surface-1)' }}>
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
        role={role}
      />
      <NotificationBell userEmail={email} className="" />
      <ChatBadge email={email} href="/tecnico/citas" scope="job" />
      <WorkerContext.Provider value={{ openDrawer: () => setDrawerOpen(true), email, displayName, profilePhoto, setProfilePhoto, avgRating, totalRatings, serviceFilters: DEFAULT_FILTERS, toggleFilter: () => {}, navApp, pickupRangeKm: 10, setPickupRangeKm: () => {}, deliveryRangeKm: 20, setDeliveryRangeKm: () => {}, driverPos, setDriverPos }}>
        <main>
          {children}
        </main>
        <BottomNav tabs={TECNICO_TABS.map(t => t.href === '/tecnico/activo' ? { ...t, badge: activeJobCount } : t)} accent="#F5C518" />
      </WorkerContext.Provider>
    </div>
  );
}
