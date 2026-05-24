'use client';
import { useEffect, useState, useRef, useCallback, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { NotificationBell } from '@/components/NotificationBell';
import { initTheme } from '@/lib/useTheme';
import { CartProvider, useCart, type CartItem } from './cart-context';
import { gs } from './data';
import './tienda.css';

/* ── Autocomplete types ─────────────────────────────────── */
type Sugg = {
  type: 'product' | 'vendor' | 'recent';
  label: string;
  sub: string;
  emoji: string;
  href: string;
};

/* ── Helpers ─────────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ── Menu Drawer ─────────────────────────────────────────── */
const menuLinks = [
  { href: '/cliente',          label: 'Inicio',              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h2"/></svg> },
  { href: '/tienda',           label: 'TukiMarket',          icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
  { href: '/cliente/enviar',   label: 'Enviar paquete',      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> },
  { href: '/cliente/servicio', label: 'Contratar servicio',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg> },
  { href: '/cliente/settings', label: 'Configuración',       icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
];

function TiendaMenuDrawer({
  open, onClose, email, displayName, profilePhoto,
}: { open: boolean; onClose: () => void; email: string; displayName: string; profilePhoto: string }) {
  const router = useRouter();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleLogout = useCallback(async () => {
    onClose();
    await supabase.auth.signOut();
    router.replace('/auth');
  }, [router, onClose]);

  return (
    <>
      <div className={`tnd-menu-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`tnd-menu-drawer${open ? ' open' : ''}`} aria-label="Menú principal">
        {/* Perfil */}
        <div className="tnd-menu-profile">
          <div className="tnd-menu-avatar">
            {profilePhoto
              ? <img src={profilePhoto} alt="" className="tnd-menu-avatar-img" />
              : <div className="tnd-menu-avatar-ph">{displayName?.[0]?.toUpperCase() || '👤'}</div>
            }
          </div>
          <div>
            <div className="tnd-menu-name">{displayName || 'Cliente'}</div>
            <div className="tnd-menu-email">{email}</div>
          </div>
          <button className="tnd-menu-close" onClick={onClose} aria-label="Cerrar menú">✕</button>
        </div>

        {/* Links */}
        <nav className="tnd-menu-links">
          {menuLinks.map(({ href, label, icon }) => (
            <Link key={href} href={href} className="tnd-menu-link" onClick={onClose}>
              <span className="tnd-menu-link-icon">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="tnd-menu-footer">
          <button className="tnd-menu-logout" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Cart Drawer ─────────────────────────────────────────── */
function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, removeItem, updateQty, total, clear } = useCart();
  const router = useRouter();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className={`tnd-cart-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`tnd-cart-drawer${open ? ' open' : ''}`} aria-label="Carrito de compras">
        <div className="tnd-cart-header">
          <span className="tnd-cart-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Mi carrito
          </span>
          <button className="tnd-cart-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {items.length === 0 ? (
          <div className="tnd-cart-empty">
            <div className="tnd-cart-empty-icon">🛒</div>
            <div className="tnd-cart-empty-title">Tu carrito está vacío</div>
            <div className="tnd-cart-empty-sub">Explorá el catálogo y agregá productos</div>
          </div>
        ) : (
          <>
            <div className="tnd-cart-items">
              {items.map((item: CartItem) => (
                <div key={item.id} className="tnd-cart-item">
                  <div className="tnd-cart-item-emoji" style={{ overflow: 'hidden' }}>
                    {item.image
                      ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                      : item.emoji
                    }
                  </div>
                  <div className="tnd-cart-item-info">
                    <div className="tnd-cart-item-name">{item.name}</div>
                    <div className="tnd-cart-item-vendor">{item.vendorName}</div>
                    <div className="tnd-cart-item-price">{gs(item.price)}</div>
                  </div>
                  <div className="tnd-cart-item-right">
                    <div className="tnd-cart-qty">
                      <button className="tnd-cart-qty-btn" onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                      <span className="tnd-cart-qty-val">{item.qty}</span>
                      <button className="tnd-cart-qty-btn" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                    </div>
                    <button className="tnd-cart-remove" onClick={() => removeItem(item.id)} title="Eliminar">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="tnd-cart-footer">
              <div className="tnd-cart-total-row">
                <span className="tnd-cart-total-label">Total</span>
                <span className="tnd-cart-total-value">{gs(total)}</span>
              </div>
              <button className="tnd-cart-checkout-btn" onClick={() => { onClose(); router.push('/tienda/checkout'); }}>
                Proceder al pago
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
              <button className="tnd-cart-clear-btn" onClick={clear}>Vaciar carrito</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ── Header — ML style single row + autocomplete ────────── */
function TiendaHeader({
  email, displayName, profilePhoto, avgRating, onMenuOpen,
}: { email: string; displayName: string; profilePhoto: string; avgRating: number; onMenuOpen: () => void }) {
  const { count } = useCart();
  const [cartOpen, setCartOpen]       = useState(false);
  const [searchVal, setSearchVal]     = useState('');
  const [searchOpen, setSearchOpen]   = useState(false);
  const [suggestions, setSuggestions] = useState<Sugg[]>([]);
  const [suggIdx, setSuggIdx]         = useState(-1);
  const [greeting, setGreeting]       = useState('');
  const inputRef    = useRef<HTMLInputElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const router      = useRouter();
  const searchParams = useSearchParams();
  const pathname    = usePathname();

  /* Ocultar buscador del header en: tienda de vendedor y página de producto */
  const hideHeaderSearch = (() => {
    const parts = pathname.split('/').filter(Boolean);
    // /tienda/[vendor_id]
    if (parts.length === 2 && parts[0] === 'tienda' && parts[1] !== 'buscar' && parts[1] !== 'producto') return true;
    // /tienda/producto/[id]
    if (parts.length === 3 && parts[0] === 'tienda' && parts[1] === 'producto') return true;
    return false;
  })();

  /* Sincronizar con URL (buscar page) */
  const urlQ = searchParams.get('q') ?? '';
  useEffect(() => { setSearchVal(urlQ); }, [urlQ]);
  useEffect(() => { setGreeting(getGreeting()); }, []);

  /* Click fuera cierra dropdown */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setSuggIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Leer / guardar búsquedas recientes */
  const getRecent = (): string[] => {
    try { return JSON.parse(localStorage.getItem('tuki_recent_searches') ?? '[]'); } catch { return []; }
  };
  const saveRecent = (q: string) => {
    try {
      const updated = [q, ...getRecent().filter(r => r !== q)].slice(0, 5);
      localStorage.setItem('tuki_recent_searches', JSON.stringify(updated));
    } catch {}
  };

  /* Compute suggestions — only recent searches (no mock data) */
  const computeSuggestions = useCallback((val: string) => {
    const results: Sugg[] = [];
    if (!val.trim()) {
      getRecent().forEach(r => results.push({
        type: 'recent', label: r, sub: 'Búsqueda reciente', emoji: '🕐',
        href: `/tienda/buscar?q=${encodeURIComponent(r)}`,
      }));
    }
    setSuggestions(results);
    setSuggIdx(-1);
  }, []);

  /* Navigate suggestion or search */
  const doSearch = useCallback((overrideQ?: string) => {
    const q = (overrideQ ?? searchVal).trim();
    setSuggestions([]);
    setSuggIdx(-1);
    inputRef.current?.blur();
    if (!q) { router.push('/tienda'); return; }
    saveRecent(q);
    router.push(`/tienda/buscar?q=${encodeURIComponent(q)}`);
  }, [searchVal, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    setSearchOpen(false);
    setSearchVal('');
    setSuggestions([]);
    inputRef.current?.blur();
    if (!urlQ) router.push('/tienda');
  }, [router, urlQ]);

  /* Keyboard navigation */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (suggIdx >= 0 && suggestions[suggIdx]) {
        router.push(suggestions[suggIdx].href);
        setSuggestions([]);
        inputRef.current?.blur();
      } else {
        doSearch();
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setSuggIdx(-1);
      inputRef.current?.blur();
    }
  };

  const showDrop = searchOpen && suggestions.length > 0;

  return (
    <>
      <header className={`tnd-header${searchOpen ? ' tnd-header--searching' : ''}`}>

        {/* ← Volver — mobile cuando search abierto */}
        <button className="tnd-header-back" onClick={handleBack} aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>

        {/* Perfil compacto */}
        <Link href="/cliente" className="tnd-header-profile" aria-label="Mi perfil">
          <div className="tnd-header-avatar">
            {profilePhoto
              ? <img src={profilePhoto} alt="" />
              : <span>{displayName?.[0]?.toUpperCase() || '👤'}</span>
            }
          </div>
          <div className="tnd-header-info">
            <span className="tnd-header-greeting">{greeting},</span>
            <span className="tnd-header-name">{displayName || 'Cliente'}</span>
            {avgRating > 0 && <span className="tnd-header-rating">★ {avgRating.toFixed(1)}</span>}
          </div>
        </Link>

        {/* Buscador central + autocomplete — oculto en tienda de vendedor */}
        <div className={`tnd-header-search-wrap${hideHeaderSearch ? ' tnd-header-search-wrap--hidden' : ''}`} ref={wrapRef}>
          <div className="tnd-header-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="tnd-header-search-icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              ref={inputRef}
              className="tnd-header-search-input"
              placeholder="Estoy buscando..."
              value={searchVal}
              onChange={e => { setSearchVal(e.target.value); computeSuggestions(e.target.value); }}
              onFocus={() => { setSearchOpen(true); computeSuggestions(searchVal); }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              aria-label="Buscar productos"
              aria-autocomplete="list"
              aria-expanded={showDrop}
            />
            {searchVal && (
              <button
                className="tnd-header-search-clear"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setSearchVal(''); setSuggestions([]); computeSuggestions(''); inputRef.current?.focus(); }}
                aria-label="Limpiar búsqueda"
              >✕</button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {showDrop && (
            <ul className="tnd-autocomplete" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={`${s.type}-${s.label}`}
                  className={`tnd-autocomplete-item${i === suggIdx ? ' tnd-autocomplete-item--active' : ''}`}
                  role="option"
                  aria-selected={i === suggIdx}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setSearchVal(s.label); doSearch(s.label); router.push(s.href); setSuggestions([]); }}
                >
                  <span className="tnd-autocomplete-emoji">
                    {s.type === 'recent'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      : s.type === 'vendor'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    }
                  </span>
                  <div className="tnd-autocomplete-text">
                    <span className="tnd-autocomplete-label">{s.label}</span>
                    <span className="tnd-autocomplete-sub">{s.sub}</span>
                  </div>
                  {s.type === 'product' && (
                    <span className="tnd-autocomplete-arrow">›</span>
                  )}
                </li>
              ))}
              {searchVal.trim() && (
                <li
                  className="tnd-autocomplete-item tnd-autocomplete-item--all"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => doSearch()}
                  role="option"
                >
                  <span className="tnd-autocomplete-emoji">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  </span>
                  <span className="tnd-autocomplete-label">Ver todos los resultados de &ldquo;{searchVal}&rdquo;</span>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Acciones: campana + menú + carrito */}
        <div className="tnd-header-actions">
          {email && <NotificationBell userEmail={email} />}
          <button className="tnd-client-menu-btn" onClick={onMenuOpen} aria-label="Abrir menú">
            <span /><span /><span />
          </button>
          <button className="tnd-cart-btn" onClick={() => setCartOpen(true)} aria-label={`Carrito (${count} items)`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {count > 0 && <span className="tnd-cart-badge">{count > 99 ? '99+' : count}</span>}
          </button>
        </div>
      </header>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

/* ── Layout root ─────────────────────────────────────────── */
export default function TiendaLayout({ children }: { children: ReactNode }) {
  const [email, setEmail]           = useState('');
  const [displayName, setName]      = useState('');
  const [profilePhoto, setPhoto]    = useState('');
  const [avgRating, setRating]      = useState(0);
  const [menuOpen, setMenuOpen]     = useState(false);

  useEffect(() => {
    initTheme();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return; // allow anonymous browsing
      const userEmail = session.user.email || '';

      // Block non-cliente roles from the marketplace
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      const blockedRoles = ['driver', 'tecnico', 'servicio', 'vendedor', 'admin'];
      if (userData?.role && blockedRoles.includes(userData.role)) {
        const roleHome: Record<string, string> = {
          driver: '/driver', tecnico: '/tecnico', servicio: '/servicio',
          vendedor: '/vendedor', admin: '/admin',
        };
        window.location.replace(roleHome[userData.role] ?? '/auth');
        return;
      }

      setEmail(userEmail);
      /* Cache rápido (mismo patrón que el layout del cliente) */
      try {
        const cached = JSON.parse(localStorage.getItem(`tuki_profile_${userEmail}`) || 'null');
        if (cached?.displayName) setName(cached.displayName);
        else setName(userEmail.split('@')[0]);
        if (cached?.profilePhoto) setPhoto(cached.profilePhoto);
      } catch {
        setName(userEmail.split('@')[0]);
      }
      /* Fetch fresco en background */
      fetch(`/api/client-profile?email=${encodeURIComponent(userEmail)}`)
        .then(r => r.json())
        .then(data => {
          const p = data?.profile;
          if (!p) return;
          if (p.display_name) setName(p.display_name);
          if (p.photo_url)    setPhoto(p.photo_url);
          if (p.avg_rating)   setRating(Number(p.avg_rating));
        })
        .catch(() => {});
    })();
  }, []);

  return (
    <CartProvider>
      <div className="tnd-root">
        <Suspense fallback={<div className="tnd-header" style={{ height: 58 }} />}>
          <TiendaHeader
            email={email}
            displayName={displayName}
            profilePhoto={profilePhoto}
            avgRating={avgRating}
            onMenuOpen={() => setMenuOpen(true)}
          />
        </Suspense>
        <TiendaMenuDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          email={email}
          displayName={displayName}
          profilePhoto={profilePhoto}
        />
        {children}
      </div>
    </CartProvider>
  );
}


