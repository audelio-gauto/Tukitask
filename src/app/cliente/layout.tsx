'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientContext } from './context';
import { supabase } from '@/lib/supabaseClient';
import './cliente.css';
import { ClientDrawer } from './components/ClientDrawer';
import OfferIncomingToast from './components/OfferIncomingToast';

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setEmail(user.email || '');
      try {
        const res = await fetch('/api/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        const json = await res.json();
        if (json?.role !== 'cliente') { router.push('/auth'); return; }
        setDisplayName(user.email?.split('@')[0] || '');
        setChecking(false);

        // Load client profile (non-blocking)
        fetch(`/api/client-profile?email=${encodeURIComponent(user.email || '')}`)
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
      } catch {
        router.push('/auth');
      }
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
      <ClientContext.Provider value={{
        openDrawer: () => setDrawerOpen(true),
        email, displayName, profilePhoto, setProfilePhoto,
        phone, setPhone,
        avgRating, setAvgRating,
        totalRatings, setTotalRatings,
      }}>
        {children}
        {email && <OfferIncomingToast email={email} />}
      </ClientContext.Provider>
    </div>
  );
}
