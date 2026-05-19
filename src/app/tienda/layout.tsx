'use client';
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { initTheme, useTheme } from '@/lib/useTheme';
import { CartProvider, useCart, type CartItem } from './cart-context';
import './tienda.css';

/* ── Cart Drawer ─────────────────────────────────────────── */
const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, removeItem, updateQty, total, clear } = useCart();

  /* close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`tnd-cart-overlay${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside className={`tnd-cart-drawer${open ? ' open' : ''}`} aria-label="Carrito de compras">
        {/* Header */}
        <div className="tnd-cart-header">
          <span className="tnd-cart-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Mi carrito
          </span>
          <button className="tnd-cart-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Items */}
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

            {/* Footer */}
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

/* ── Navbar inner (needs Cart context) ───────────────────── */
function TiendaNavbar() {
  const { theme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const { count } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(() => {
    const q = searchVal.trim();
    router.push(q ? `/tienda?q=${encodeURIComponent(q)}` : '/tienda');
  }, [searchVal, router]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  const clearSearch = () => {
    setSearchVal('');
    router.push('/tienda');
    inputRef.current?.focus();
  };

  return (
    <>
      <nav className="tnd-nav">
        {/* Brand */}
        <Link href="/tienda" className="tnd-nav-brand">
          <div className="tnd-nav-logo">TK</div>
          <div>
            <div className="tnd-nav-title">TukiTask</div>
            <div className="tnd-nav-sub">Marketplace</div>
          </div>
        </Link>

        <div className="tnd-nav-divider" />
        <Link href="/tienda" className="tnd-nav-link">Catálogo</Link>

        {/* ── Search (center) ── */}
        <div className="tnd-nav-search-wrap">
          <div className="tnd-nav-search-inner">
            <svg className="tnd-nav-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              ref={inputRef}
              className="tnd-nav-search-input"
              placeholder="Buscar productos..."
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              onKeyDown={handleKey}
              aria-label="Buscar productos"
            />
            {searchVal && (
              <button className="tnd-nav-search-clear" onClick={clearSearch} aria-label="Limpiar búsqueda">✕</button>
            )}
            <button className="tnd-nav-search-btn" onClick={doSearch} aria-label="Buscar">
              Buscar
            </button>
          </div>
        </div>

        {/* ── Actions (right) ── */}
        <div className="tnd-nav-actions">
          <button
            onClick={toggleTheme}
            className="tnd-nav-btn tnd-nav-btn-ghost tnd-nav-btn-icon"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link href="/vendedor" className="tnd-nav-btn tnd-nav-btn-ghost tnd-nav-hide-sm">
            Panel Vendedor
          </Link>
          <Link href="/auth" className="tnd-nav-btn tnd-nav-btn-primary tnd-nav-hide-sm">
            Ingresar
          </Link>

          {/* Cart button */}
          <button
            className="tnd-cart-btn"
            onClick={() => setCartOpen(true)}
            aria-label={`Carrito (${count} items)`}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            {count > 0 && <span className="tnd-cart-badge">{count > 99 ? '99+' : count}</span>}
          </button>
        </div>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

/* ── Layout root ─────────────────────────────────────────── */
export default function TiendaLayout({ children }: { children: ReactNode }) {
  useEffect(() => { initTheme(); }, []);

  return (
    <CartProvider>
      <div className="tnd-root">
        <TiendaNavbar />
        {children}
      </div>
    </CartProvider>
  );
}
