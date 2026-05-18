'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { initTheme, useTheme } from '@/lib/useTheme';
import './tienda.css';

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    initTheme();
  }, []);

  return (
    <div className="tnd-root">
      {/* ── Navbar ── */}
      <nav className="tnd-nav">
        <Link href="/tienda" className="tnd-nav-brand">
          <div className="tnd-nav-logo">TK</div>
          <div>
            <div className="tnd-nav-title">TukiTask</div>
            <div className="tnd-nav-sub">Marketplace</div>
          </div>
        </Link>

        <div className="tnd-nav-divider" />
        <Link href="/tienda" className="tnd-nav-link">Catálogo</Link>

        <div className="tnd-nav-spacer" />

        <div className="tnd-nav-actions">
          <button
            onClick={toggleTheme}
            className="tnd-nav-btn tnd-nav-btn-ghost tnd-nav-btn-icon"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link href="/vendedor" className="tnd-nav-btn tnd-nav-btn-ghost">
            Panel Vendedor
          </Link>
          <Link href="/auth" className="tnd-nav-btn tnd-nav-btn-primary">
            Ingresar
          </Link>
        </div>
      </nav>

      {children}
    </div>
  );
}
