'use client';
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { NotificationBell } from '@/components/NotificationBell';
import { initTheme } from '@/lib/useTheme';
import { CartProvider, useCart, type CartItem } from './cart-context';
import './tienda.css';

/* ── Helpers ─────────────────────────────────────────────── */
const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ── Cart Drawer ─────────────────────────────────────────── */
function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, removeItem, updateQty, total, clear } = useCart();
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
                  <div className="tnd-cart-item-emoji">{item.emoji}</div>
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
              <button className="tnd-cart-checkout-btn">
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

/* ── Header (mismo estilo que panel cliente) ─────────────── */
function TiendaHeader({
  email, displayName, profilePhoto, avgRating,
}: { email: string; displayName: string; profilePhoto: string; avgRating: number }) {
  const { count } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const doSearch = useCallback(() => {
    const q = searchVal.trim();
    router.push(q ? `/tienda?q=${encodeURIComponent(q)}` : '/tienda');
  }, [searchVal, router]);

  return (
    <>
      {/* ── Fila 1: perfil + acciones (igual al cliente) ── */}
      <div className="tnd-client-bar">
        {/* Foto + rating */}
        <Link href="/cliente" className="tnd-client-avatar-wrap" aria-label="Volver al inicio">
          {profilePhoto ? (
            <img src={profilePhoto} alt="" className="tnd-client-avatar" />
          ) : (
            <div className="tnd-client-avatar-placeholder">
              {displayName?.[0]?.toUpperCase() || '👤'}
            </div>
          )}
          {avgRating > 0 && (
            <div className="tnd-client-rating">
              <span>★</span>{avgRating.toFixed(1)}
            </div>
          )}
        </Link>

        {/* Saludo + nombre */}
        <div className="tnd-client-info">
          <div className="tnd-client-greeting">{getGreeting()}</div>
          <div className="tnd-client-name">{displayName || 'Cliente'}</div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Campana de notificaciones */}
        {email && <NotificationBell userEmail={email} />}

        {/* Menú / volver al cliente */}
        <Link
          href="/cliente"
          className="tnd-client-menu-btn"
          aria-label="Menú principal"
        >
          <span /><span /><span />
        </Link>

        {/* Carrito */}
        <button
          className="tnd-cart-btn"
          onClick={() => setCartOpen(true)}
          aria-label={`Carrito (${count} items)`}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          {count > 0 && <span className="tnd-cart-badge">{count > 99 ? '99+' : count}</span>}
        </button>
      </div>

      {/* ── Fila 2: buscador ── */}
      <div className="tnd-search-bar-row">
        <div className="tnd-search-bar-inner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="tnd-search-bar-icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            className="tnd-search-bar-input"
            placeholder="Buscar productos, tiendas..."
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
            aria-label="Buscar productos"
          />
          {searchVal && (
            <button
              className="tnd-search-bar-clear"
              onClick={() => { setSearchVal(''); router.push('/tienda'); inputRef.current?.focus(); }}
              aria-label="Limpiar"
            >✕</button>
          )}
          <button className="tnd-search-bar-btn" onClick={doSearch}>Buscar</button>
        </div>
      </div>

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

  useEffect(() => {
    initTheme();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userEmail = session.user.email || '';
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
        <TiendaHeader
          email={email}
          displayName={displayName}
          profilePhoto={profilePhoto}
          avgRating={avgRating}
        />
        {children}
      </div>
    </CartProvider>
  );
}


